#!/usr/bin/env node
/**
 * 一键同步 `prdVersion`（零依赖，直接 `node` 运行）。
 *
 * 用途：把"当前生效版本"的四个声明位改成同一个值。手工同步必然漏（真实教训：改了 PRD 却漏了
 *       rules 与测试头，台账门禁随后报不一致）。改动范围**严格限定声明位**，绝不碰历史叙述。
 *
 * 声明位：
 *   - `docs/process/prd/<ID>.md`          —— 仅 frontmatter 的 `prdVersion:` 字段行
 *   - `docs/process/prd/<ID>-design.md`   —— 同上（与 PRD 同源，常被漏改）
 *   - `docs/process/rules/<ID>.yaml`      —— 仅 YAML 的 `prdVersion:` 字段行
 *   - `<需求包测试目录>/<ID>/*.<测试后缀>` —— 仅 `@prdVersion` 后的数字
 *
 * **不碰**这类文本（它们是历史事实，改了就篡改记录）：修订记录里的 `prdVersion 3 → 4`、
 * `（prdVersion 2）`、`@prdVersion=2 ≠ ...` 之类叙述。
 *
 * 用法：
 *   node scripts/process/sync-prd-version.mjs <ID>            # 读 PRD frontmatter 当前值并同步
 *   node scripts/process/sync-prd-version.mjs <ID> --to 5     # 先把 PRD 设成 5，再同步其余声明位
 *   node scripts/process/sync-prd-version.mjs <ID> --check    # 只检查一致性，不改动（不一致退出 1）
 *   node scripts/process/sync-prd-version.mjs <ID> --header-only  # 只改文件级头，保留用例内旧值
 *
 * 退出码：
 *   0 = 已同步或已一致；1 = --check 发现不一致 / 找不到 PRD / PRD 无 prdVersion / 配置缺失
 *
 * 配置依赖（docs/process/PROJECT.md）：
 *   - 必需：文件存在（缺失即报错退出 1）。
 *   - 可选：「## 4. 项目配置」：`测试文件后缀`、`需求包测试目录`（默认 `test/packages`）、
 *           `台账目录`、`PRD 目录`。每个包一个子目录：`<需求包测试目录>/<ID>/`。
 *
 * 占位符纪律：§4 里含 `<` / `>` 的取值一律视为**未配置**，回落内置默认值。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configValue, parseList, readSection } from "./project-config.mjs";

const PROJECT_REL = "docs/process/PROJECT.md";
const SELF_DIR = dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
  testSuffixes: [".test.ts", ".test.mjs", ".test.js"],
  packageDirs: ["test/packages"],
  rulesDir: "docs/process/rules",
  prdDir: "docs/process/prd",
};

/** 沿目录向上找仓库根：命中 `docs/process/` 或 `.git` 即认定。 */
function findRepoRoot(start) {
  let d = resolve(start);
  for (;;) {
    if (existsSync(join(d, "docs", "process")) || existsSync(join(d, ".git"))) return d;
    const parent = dirname(d);
    if (parent === d) return null;
    d = parent;
  }
}

function fail(msg) {
  console.error(`[sync-prd-version] ✗ ${msg}`);
  process.exit(1);
}

const root = findRepoRoot(process.cwd());
if (!root) {
  fail(
    `从 ${process.cwd()} 向上找不到仓库根（既无 docs/process/ 也无 .git）。\n` +
      `  请在仓库内运行，或先创建 docs/process/ 目录。`,
  );
}
const projectFile = join(root, PROJECT_REL);
if (!existsSync(projectFile)) {
  fail(
    `找不到流程配置 ${PROJECT_REL}（仓库根：${root}）。\n` +
      `  版本同步需要它来确定测试目录与文件后缀（§4 项目配置）。\n` +
      `  请先创建 docs/process/PROJECT.md；缺失即无法定位声明位，故直接拒绝。\n` +
      `  退出码：1（配置缺失）`,
  );
}
const projectText = readFileSync(projectFile, "utf8");
const sec4 = readSection(
  projectText,
  (level, title) => level === 2 && /^4([.、\s:：]|$)/.test(title) && !/^4\.\d/.test(title),
);
const cfg = {
  testSuffixes: parseList(configValue(sec4, "测试文件后缀")) ?? DEFAULTS.testSuffixes,
  packageDir: (parseList(configValue(sec4, "需求包测试目录")) ?? DEFAULTS.packageDirs)[0],
  rulesDir: (parseList(configValue(sec4, "台账目录")) ?? [DEFAULTS.rulesDir])[0],
  prdDir: (parseList(configValue(sec4, "PRD 目录")) ?? [DEFAULTS.prdDir])[0],
};

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, "utf-8") : null;
}

/** 从文本里取 frontmatter / 字段行的 `prdVersion:` 值。 */
function matchFieldVersion(text) {
  return (text.match(/^prdVersion:\s*(\d+)\s*$/m) ?? [])[1] ?? null;
}

/** 把字段行的 `prdVersion:` 值替换成 to（只替换首个字段行，不动正文里的引用）。 */
function replaceFieldVersion(text, to) {
  let done = false;
  return text.replace(/^(prdVersion:\s*)\d+(\s*)$/m, (m, p1, p2) => {
    if (done) return m;
    done = true;
    return `${p1}${to}${p2}`;
  });
}

/**
 * 替换 `@prdVersion` 的版本值。
 * `scope=header` 只改文件首个；默认 `all` 连用例内的同名标记一起改 —— 整批用例都在新版判据上
 * 跑绿时它就该如实改成新版，留旧值反而制造"这条用例没按新版复核过"的假象。
 */
function replaceVersions(text, to, scope) {
  let done = false;
  return text.replace(/(@prdVersion\s+)\d+/g, (m, p1) => {
    if (scope === "header") {
      if (done) return m;
      done = true;
    }
    return `${p1}${to}`;
  });
}

function headerVersion(text) {
  return (text.match(/@prdVersion\s+(\d+)/) ?? [])[1] ?? null;
}
function allVersions(text) {
  return [...text.matchAll(/@prdVersion\s+(\d+)/g)].map((m) => m[1]);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    fail(
      "用法：node scripts/process/sync-prd-version.mjs <ID> [--to N] [--check] [--header-only]",
    );
  }
  const id = args[0];
  const check = args.includes("--check");
  const scope = args.includes("--header-only") ? "header" : "all";
  const toIdx = args.indexOf("--to");
  const target = toIdx >= 0 ? args[toIdx + 1] : undefined;
  if (toIdx >= 0 && !/^\d+$/.test(target ?? "")) fail("--to 需要一个整数");

  const prdRel = join(cfg.prdDir, `${id}.md`);
  const prdPath = join(root, prdRel);
  const rulesRel = join(cfg.rulesDir, `${id}.yaml`);
  const rulesPath = join(root, rulesRel);
  const designRel = join(cfg.prdDir, `${id}-design.md`);
  const designPath = join(root, designRel);
  const testDir = join(root, cfg.packageDir, id);

  const prd = readIfExists(prdPath);
  if (prd === null) fail(`找不到 PRD：${prdRel}`);
  const prdBefore = matchFieldVersion(prd);
  if (prdBefore === null) fail(`PRD frontmatter 里没有 prdVersion 字段行：${prdRel}`);

  const want = target ?? prdBefore;
  const sites = [];

  // 1) PRD frontmatter
  let prdAfter = prd;
  if (prdBefore !== want) {
    prdAfter = replaceFieldVersion(prd, want);
    sites.push({ path: prdPath, label: "PRD frontmatter", before: prdBefore });
  }

  // 2) rules YAML
  let rulesAfter = null;
  const rules = readIfExists(rulesPath);
  if (rules !== null) {
    const before = matchFieldVersion(rules);
    if (before === null) {
      console.warn(`  ⚠ ${rulesRel} 里没有 prdVersion 字段行，跳过`);
    } else if (before !== want) {
      rulesAfter = replaceFieldVersion(rules, want);
      sites.push({ path: rulesPath, label: "rules 台账", before });
    }
  } else {
    console.warn(`  ⚠ 找不到 rules 台账：${rulesRel}，跳过`);
  }

  // 3) 设计与说明（与 PRD 同源，常被漏改）
  let designAfter = null;
  const design = readIfExists(designPath);
  if (design !== null) {
    const before = matchFieldVersion(design);
    if (before === null) {
      console.warn(`  ⚠ ${designRel} 里没有 prdVersion 字段行，跳过`);
    } else if (before !== want) {
      designAfter = replaceFieldVersion(design, want);
      sites.push({ path: designPath, label: "设计与说明", before });
    }
  }

  // 4) 测试文件里的 @prdVersion
  const testFiles = existsSync(testDir)
    ? readdirSync(testDir)
        .filter((f) => cfg.testSuffixes.some((s) => f.endsWith(s)))
        .map((f) => join(testDir, f))
    : [];
  if (testFiles.length === 0) {
    console.warn(`  ⚠ 测试目录为空或不存在：${relative(root, testDir)}`);
  }
  const testAfter = new Map();
  const missingHeader = [];
  const staleInlineReport = [];
  for (const p of testFiles) {
    const text = readFileSync(p, "utf-8");
    const rel = relative(root, p);
    const before = headerVersion(text);
    if (before === null) {
      missingHeader.push(rel);
      continue;
    }
    const versions = allVersions(text);
    const stale = [...new Set(versions.filter((v) => v !== want))];
    const headerNeeds = before !== want;
    if (stale.length > 0) staleInlineReport.push(`${rel}（用例内 ${stale.join("/")}）`);
    if (!headerNeeds && stale.length === 0) continue;

    const parts = [];
    if (headerNeeds) parts.push(`头 ${before}→${want}`);
    if (stale.length > 0) {
      parts.push(
        scope === "all" ? `用例内 ${stale.join("/")}→${want}` : `用例内 ${stale.join("/")}=未动`,
      );
    }
    const replaced = replaceVersions(text, want, scope);
    if (replaced !== text) {
      testAfter.set(p, replaced);
      sites.push({ path: p, label: `测试 ${rel}（${parts.join("；")}）`, before });
    }
  }

  if (missingHeader.length > 0) {
    console.warn(
      `  ⚠ ${missingHeader.length} 个测试文件没有文件级 @prdVersion 头（本脚本不静默注入，请手工补）：`,
    );
    for (const p of missingHeader) console.warn(`      ${p}`);
  }
  if (staleInlineReport.length > 0 && scope === "header") {
    console.warn(
      `  ⚠ ${staleInlineReport.length} 个文件的**用例内** @prdVersion 仍是旧值（--header-only 未处理，也不影响门禁）：`,
    );
    for (const p of staleInlineReport) console.warn(`      ${p}`);
  }

  if (sites.length === 0) {
    if (missingHeader.length > 0) process.exitCode = 1;
    console.log(`✓ ${id} 的文件级头已全部一致（= ${want}）`);
    return;
  }

  console.log(`${check ? "【检查模式，不写入】" : ""}目标版本：${want}`);
  for (const s of sites) console.log(`  ${check ? "✗ 不一致" : "→ 同步"}：${s.label}`);

  if (check) {
    console.log(`\n✗ 共 ${sites.length} 处需要同步到 ${want}。`);
    process.exit(1);
  }

  if (prdAfter !== prd) writeFileSync(prdPath, prdAfter);
  if (rulesAfter !== null) writeFileSync(rulesPath, rulesAfter);
  if (designAfter !== null) writeFileSync(designPath, designAfter);
  for (const [p, text] of testAfter) writeFileSync(p, text);

  console.log(`\n✓ 已同步 ${sites.length} 处声明位。`);
  console.log("  下一步：node scripts/process/check-rules.mjs 应显示 ⑥ 全绿。");

  // 顺手跑一次 rules 校验，把"改完是否自洽"当场暴露出来
  try {
    const out = execFileSync(process.execPath, [join(SELF_DIR, "check-rules.mjs")], {
      cwd: root,
      encoding: "utf-8",
    });
    const summary = out.split("\n").find((l) => l.includes("check-rules：")) ?? "";
    const bad = out.split("\n").filter((l) => l.trim().startsWith("❌"));
    console.log(`\n${summary.trim()}`);
    for (const l of bad) console.log(l);
  } catch {
    console.warn("\n⚠ check-rules 未能执行或返回非零，请手工复核");
  }
}

main();
