#!/usr/bin/env node
/**
 * journal 安全追加（零依赖，直接 `node` 运行）。
 *
 * 用途：向 `<ID>.journal.jsonl` 安全追加一条或多条 journal 记录。journal 位于被忽略的
 *       `docs/process/**`，多个会话 / 子代理会并发追加；朴素的 `fs.appendFileSync` 在重写
 *       整个文件时会让并发写入的条目静默丢失。本工具用「持锁 + 内容指纹 + 原子替换 + 备份
 *       + 落盘自校验」保证只增不减、可回滚。
 *
 * 用法：
 *   node scripts/process/journal-append.mjs <journal 路径> <payload.json>
 *   node scripts/process/journal-append.mjs <journal 路径> --stdin   # payload 从 stdin 读
 *
 *   payload 可以是单个 JSON 对象，或 JSON 数组（一次追加多条）。
 *   每条必填字段：at（ISO 时间字符串）、actor（谁做的）、id（需求包 ID）。
 *   其余字段自由（如 step / action / phase / note / files），按原样单行化写入。
 *
 * 退出码：
 *   0 = 追加成功（并已写入 `<journal>.meta.json` 指纹）
 *   1 = 用法错误 / payload 非法 / 缺必填字段 / 锁超时 / 检测到并发改写 / 自校验失败
 *
 * 配置依赖：无。本脚本不读 PROJECT.md，journal 路径由参数显式给出。
 *
 * 副作用文件：
 *   <journal>.lock      持锁标记（成功或失败都会释放）
 *   <journal>.bak       写入前的上一版备份（回滚用）
 *   <journal>.meta.json { lines, lastHash } 内容指纹
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";

const LOCK_STALE_MS = 30_000;

/** 取内容的前 16 位 sha256，用作行指纹。 */
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// 当前持有的锁路径。fail() 会直接退出、不走 finally —— 若不在此处释放，
// 失败路径会留下陈旧锁，后续调用要白等一个 LOCK_STALE_MS 周期。
let heldLock = null;

function fail(msg) {
  if (heldLock) {
    try {
      fs.unlinkSync(heldLock);
    } catch {
      /* 锁可能已被陈旧清理逻辑移除 */
    }
    heldLock = null;
  }
  process.stderr.write(`[journal-append] 失败：${msg}\n`);
  process.exit(1);
}

function readEntries(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0);
}

function acquireLock(lockPath) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      fs.writeFileSync(lockPath, `${process.pid}\n${new Date().toISOString()}\n`, { flag: "wx" });
      return;
    } catch (err) {
      if (err.code !== "EEXIST") fail(`建锁失败：${err.message}`);
      // 陈旧锁（持有者已死或超时）清掉重试，避免死锁
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        /* 锁在此期间被释放，直接重试 */
      }
      if (Date.now() > deadline) fail("等待锁超时（另一进程正在写同一 journal）");
      // 忙等 50ms：journal 写入是毫秒级操作，不值得引入异步依赖
      const until = Date.now() + 50;
      while (Date.now() < until) {
        /* spin */
      }
    }
  }
}

function main() {
  const [file, payloadArg] = process.argv.slice(2);
  if (!file || !payloadArg) {
    fail("用法：node scripts/process/journal-append.mjs <journal 路径> <payload.json | --stdin>");
  }

  const raw =
    payloadArg === "--stdin" ? fs.readFileSync(0, "utf8") : fs.readFileSync(payloadArg, "utf8");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(`payload 不是合法 JSON：${err.message}`);
  }
  const records = Array.isArray(parsed) ? parsed : [parsed];
  if (records.length === 0) fail("payload 为空数组，无可追加内容");

  const lines = [];
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    if (rec === null || typeof rec !== "object" || Array.isArray(rec)) {
      fail(`第 ${i + 1} 条不是 JSON 对象`);
    }
    const missing = ["at", "actor", "id"].filter((k) => typeof rec[k] !== "string" || rec[k] === "");
    if (missing.length > 0) fail(`第 ${i + 1} 条缺少必填字段：${missing.join(" / ")}`);
    // 单行化：journal 是 JSONL，条目内不得含裸换行
    lines.push(JSON.stringify(rec));
  }

  const abs = path.resolve(file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const lockPath = `${abs}.lock`;
  acquireLock(lockPath);
  heldLock = lockPath;

  const backupPath = `${abs}.bak`;
  const metaPath = `${abs}.meta.json`;
  try {
    // 追加前重新读取 —— 若此时文件比预期短，说明有并发截断，必须拒绝而不是覆盖
    const before = readEntries(abs);
    // 只比行数不够：并发方可能「删掉 2 条、加上 2 条」而总数不变。故记录
    // 「上一步的行数 + 末行哈希」指纹，两者任一不符即判定被并发改写并拒绝写入。
    const fingerprintOf = (arr) => ({
      lines: arr.length,
      lastHash: hash(arr.length > 0 ? arr[arr.length - 1] : ""),
    });
    if (fs.existsSync(metaPath)) {
      let prior;
      try {
        prior = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      } catch {
        prior = null;
      }
      if (prior && typeof prior.lines === "number") {
        if (before.length < prior.lines) {
          fail(
            `检测到历史被截断：写入前 ${before.length} 行 < 上次记录 ${prior.lines} 行。` +
              `疑似并发覆盖，已拒绝写入。上一版备份见 ${backupPath}`,
          );
        }
        if (before.length > prior.lines && hash(before[prior.lines - 1] ?? "") !== prior.lastHash) {
          fail(
            `检测到既有内容被改写：第 ${prior.lines} 行与上次记录不符。` +
              `疑似并发覆盖，已拒绝写入。上一版备份见 ${backupPath}`,
          );
        }
      }
    }

    const merged = [...before, ...lines];
    const tmp = path.join(os.tmpdir(), `journal-${process.pid}-${Date.now()}.jsonl`);
    fs.writeFileSync(tmp, `${merged.join("\n")}\n`, "utf8");
    if (fs.existsSync(abs)) fs.copyFileSync(abs, backupPath); // 保留一份可回滚的上一版
    fs.renameSync(tmp, abs);

    // 落盘自校验
    const after = readEntries(abs);
    if (after.length !== merged.length) {
      fail(`自校验失败：预期 ${merged.length} 行、实际 ${after.length} 行`);
    }
    for (let i = 0; i < after.length; i += 1) {
      try {
        JSON.parse(after[i]);
      } catch {
        fail(`自校验失败：第 ${i + 1} 行不是合法 JSON`);
      }
    }
    fs.writeFileSync(metaPath, `${JSON.stringify(fingerprintOf(after), null, 2)}\n`, "utf8");
    process.stdout.write(
      `[journal-append] OK：${before.length} -> ${after.length} 行（+${lines.length}）${abs}\n`,
    );
  } finally {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* 锁可能已被陈旧清理逻辑移除 */
    }
    heldLock = null;
  }
}

main();
