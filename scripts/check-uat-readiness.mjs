#!/usr/bin/env node
/**
 * UAT 前置自检（零依赖，直接 `node` 运行）。
 *
 * 用途：派 UAT 之前先确认「环境 + 验收账号 + 目标端点 + 清单」全部就绪。
 *      验收账号与端点权限是**两套东西**——账号能登录不代表能读目标端点。缺权限时 UAT 会跑到
 *      一半才发现全线 403，白白消耗一整轮派工往返。本脚本把「能不能登录 + 每个目标端点段是否
 *      200」压成一次几秒的自检。
 *
 * 用法：
 *   node scripts/process/check-uat-readiness.mjs
 *   node scripts/process/check-uat-readiness.mjs --pkg ABC-001 \
 *     --core http://127.0.0.1:3000 --web http://127.0.0.1:5173 --mobile http://127.0.0.1:5174 \
 *     --account demo_test --password 'demo-pass'
 *   node scripts/process/check-uat-readiness.mjs --progress     # 额外打印 UAT 逐项完成度
 *
 * 退出码：
 *   0 = 全绿（可派 UAT）；1 = 有阻断项（fail），或配置缺失（PROJECT.md 不存在）
 *
 * 配置依赖（docs/process/PROJECT.md）：
 *   - 必需：文件存在（缺失即报错退出 1）。
 *   - 「## 5. UAT 前置自检」小节（表格 `| 配置项 | 值 |` 或 `- 配置项：值`），全部可选：
 *       core 后端、web 前端、移动端、验收账号、验收口令、目标端点（列表）、
 *       端点前缀（默认 /api/v1）、登录路径（默认 <端点前缀>/auth/login）、
 *       令牌字段（默认 data.accessToken，点号路径）、真机 CDP、
 *       清单目录（默认 docs/process/uat）、证据目录。
 *   - 命令行同名参数优先级高于 PROJECT.md；未配置账号/端点时对应检查降级为 ⚠ 而非崩溃。
 *
 * 占位符纪律：§5 里含 `<` / `>` 的取值一律视为**未配置**，回落内置默认值（或「不配 ⇒ 跳过」）。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { configValue, parseList, readSection } from "./project-config.mjs";

const PROJECT_REL = "docs/process/PROJECT.md";

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
  process.stderr.write(`[check-uat-readiness] 失败：${msg}\n`);
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
      `  UAT 前置自检需要它来确定后端/前端地址、验收账号与目标端点（§5 UAT 前置自检）。\n` +
      `  请先创建 docs/process/PROJECT.md；缺失即无法判定，故直接拒绝。\n` +
      `  退出码：1（配置缺失）`,
  );
}
const projectText = readFileSync(projectFile, "utf8");
const sec5 = readSection(
  projectText,
  (level, title) =>
    level === 2 &&
    (/^5([.、\s:：]|$)/.test(title) && !/^5\.\d/.test(title) || title.includes("UAT 前置")),
);
const conf = (key) => parseList(configValue(sec5, key))?.[0] ?? null;

function parseArgs(argv) {
  const get = (key, fallback) => {
    const i = argv.indexOf(`--${key}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const apiPrefix = conf("端点前缀") ?? "/api/v1";
  const evidenceFromConfig = conf("证据目录");
  const checklistDir = conf("清单目录") ?? "docs/process/uat";
  return {
    pkg: get("pkg", null),
    core: get("core", conf("core 后端") ?? "http://127.0.0.1:3000"),
    web: get("web", conf("web 前端") ?? "http://127.0.0.1:5173"),
    mobile: get("mobile", conf("移动端") ?? "http://127.0.0.1:5174"),
    account: get("account", conf("验收账号")),
    password: get("password", conf("验收口令")),
    apiPrefix: get("api-prefix", apiPrefix),
    loginPath: get("login-path", conf("登录路径") ?? `${apiPrefix}/auth/login`),
    tokenField: get("token-field", conf("令牌字段") ?? "data.accessToken"),
    cdp: get("cdp", conf("真机 CDP") ?? "http://localhost:9222/json"),
    checklistDir: get("checklist-dir", checklistDir),
    evidenceDir: get("evidence", evidenceFromConfig),
    endpoints: parseList(configValue(sec5, "目标端点")) ?? [],
    progress: argv.includes("--progress"),
  };
}

let progressIds = [];
let progressCount = () => 0;
let progressMissing = [];
let progressUnattributed = 0;

/**
 * UAT 完成度：按清单项逐个统计证据文件数。
 * ⚠ 只认 `U-NN-` 前缀（Web 侧证据，与清单项同名同源）；前缀之后可以是中文短名，
 * 判定只看 `^U-\d+-`，不得对后续段做 ASCII 假设。无法从文件名可靠映射的（移动端 M-NN
 * 序列、原始探针）一律计入"未归属"并**显式报出**，不硬猜。
 */
function reportProgress(results, args) {
  if (!args.evidenceDir) {
    results.push({
      level: "warn",
      name: "UAT 完成度",
      detail: "未配置证据目录（PROJECT.md §5「证据目录」或 --evidence），跳过",
    });
    return;
  }
  const checklistPath = join(root, args.checklistDir, `${args.pkg}-checklist.md`);
  if (!existsSync(checklistPath)) {
    results.push({
      level: "warn",
      name: "UAT 完成度",
      detail: `清单缺失，无法统计：${checklistPath}`,
    });
    return;
  }
  const ids = [
    ...new Set(
      readFileSync(checklistPath, "utf-8")
        .split("\n")
        .map((l) => (l.match(/^###\s+(U-\d+)/) ?? [])[1])
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) {
    results.push({
      level: "warn",
      name: "UAT 完成度",
      detail: "清单里没找到 `### U-<NN>` 形式的项",
    });
    return;
  }

  const evidenceRoot = join(root, args.evidenceDir);
  const files = existsSync(evidenceRoot) ? readdirSync(evidenceRoot) : [];
  const countOf = (id) => files.filter((f) => f.startsWith(`${id}-`)).length;
  const unattributed = files.filter((f) => !/^U-\d+-/.test(f));
  const done = ids.filter((id) => countOf(id) > 0);
  const missing = ids.filter((id) => countOf(id) === 0);

  results.push({
    level: missing.length === 0 ? "ok" : "warn",
    name: "UAT 完成度",
    detail:
      `${done.length}/${ids.length} 项有可归属证据，已归属 ${files.length - unattributed.length} 个` +
      (unattributed.length > 0 ? `，未归属 ${unattributed.length} 个` : ""),
  });
  progressIds = ids;
  progressCount = countOf;
  progressMissing = missing;
  progressUnattributed = unattributed.length;
}

/** 逐项完成度明细，由 main 在自检表下方调用。 */
function printProgressDetail(args) {
  if (progressIds.length === 0) return;
  console.log(`UAT 逐项完成度 · ${args.evidenceDir}\n${"─".repeat(64)}`);
  for (const id of progressIds) {
    const n = progressCount(id);
    console.log(`  ${n > 0 ? "✓" : "·"} ${id}  ${n > 0 ? `${n} 个证据` : "无 U-NN- 命名的证据"}`);
  }
  if (progressMissing.length > 0) {
    console.log(` 尚无 U-NN- 证据的项：${progressMissing.join(" / ")}`);
  }
  if (progressUnattributed > 0) {
    console.log(
      `  ⚠ 另有 ${progressUnattributed} 个证据文件无 U-NN- 前缀（移动端 M-NN 序列 / 原始探针），` +
        `未计入上表 —— 判某项"未做"前请先人眼确认这批`,
    );
  }
  console.log("─".repeat(64));
}

async function probe(url, timeoutMs = 8000, token) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    return res.status;
  } catch {
    return null;
  }
}

/** 按点号路径取嵌套字段，如 `data.accessToken`。 */
function pick(obj, dotted) {
  let cur = obj;
  for (const key of dotted.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
}

async function login(core, loginPath, account, password, tokenField) {
  try {
    const res = await fetch(`${core}${loginPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status !== 200) return null;
    const body = await res.json();
    const token = pick(body, tokenField);
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.pkg) {
    fail(
      "缺少需求包 ID。用法：node scripts/process/check-uat-readiness.mjs --pkg <ID> [--core ...] [...]\n" +
        "  退出码：1（用法错误）",
    );
  }
  const results = [];

  // ① 清单必须在：清单缺失 ⇒ UAT 会直接退回，不先自检就白派
  const checklistRel = join(a.checklistDir, `${a.pkg}-checklist.md`);
  results.push(
    existsSync(join(root, checklistRel))
      ? { level: "ok", name: "UAT 清单", detail: checklistRel }
      : { level: "fail", name: "UAT 清单", detail: `缺失：${checklistRel}（UAT 会直接退回）` },
  );

  // ② 三个前端/后端存活
  for (const [name, url] of [
    ["core 后端", a.core],
    ["Web 前端", a.web],
    ["移动端", a.mobile],
  ]) {
    if (!url) {
      results.push({ level: "warn", name, detail: "未配置地址，跳过" });
      continue;
    }
    const status = await probe(url);
    results.push(
      status === null
        ? { level: "fail", name, detail: `${url} 不可达` }
        : { level: "ok", name, detail: `${url} → HTTP ${status}` },
    );
  }

  // ③ 验收账号能登录
  let token = null;
  if (a.account && a.password && a.core) {
    token = await login(a.core, a.loginPath, a.account, a.password, a.tokenField);
    results.push(
      token
        ? { level: "ok", name: "验收账号登录", detail: `${a.account} 登录成功` }
        : {
            level: "fail",
            name: "验收账号登录",
            detail: `${a.account} 登录失败（账号/口令错？或登录路径 ${a.loginPath} 不符）`,
          },
    );
  } else {
    results.push({
      level: "warn",
      name: "验收账号登录",
      detail: "未配置验收账号/口令（PROJECT.md §5 或 --account/--password），跳过",
    });
  }

  // ④ 目标端点逐段探测 —— 登录成功 ≠ 有权限，这一步才是 403 的真正防线
  if (a.endpoints.length === 0) {
    results.push({
      level: "warn",
      name: "目标端点权限",
      detail: "未配置目标端点（PROJECT.md §5「目标端点」），跳过",
    });
  } else if (!token) {
    results.push({ level: "warn", name: "目标端点权限", detail: "登录失败或未配置，跳过" });
  } else {
    const denied = [];
    for (const ep of a.endpoints) {
      const path = /^https?:/.test(ep) ? ep : `${a.core}${a.apiPrefix}/${ep.replace(/^\//, "")}`;
      const status = await probe(path, 8000, token);
      if (status === 200) continue;
      denied.push(`${ep} → ${status ?? "不可达"}`);
    }
    results.push(
      denied.length === 0
        ? {
            level: "ok",
            name: "目标端点权限",
            detail: `${a.endpoints.length} 个端点段全 200`,
          }
        : {
            level: "fail",
            name: "目标端点权限",
            detail:
              `${denied.length}/${a.endpoints.length} 个非 200：\n      ` +
              denied.join("\n      ") +
              `\n      ⚠️ 若权限有缓存，刚补授时请稍等再复测，不要直接判为缺陷`,
          },
    );
  }

  // ⑤ 真机通道（可选，不通只警告 —— 移动端也可用浏览器视口验）
  if (a.cdp) {
    const cdp = await probe(a.cdp, 5000);
    results.push(
      cdp === 200
        ? { level: "ok", name: "真机 CDP 通道", detail: `${a.cdp} 通` }
        : { level: "warn", name: "真机 CDP 通道", detail: `${a.cdp} 不通（可改用浏览器移动视口）` },
    );
  }

  const icon = { ok: "✓", warn: "!", fail: "✗" };
  if (a.progress) reportProgress(results, a);
  const blocking = results.filter((r) => r.level === "fail").length;
  console.log(`\nUAT 前置自检 · ${a.pkg}\n${"─".repeat(64)}`);
  for (const r of results) console.log(`  ${icon[r.level]} ${r.name.padEnd(16)} ${r.detail}`);
  console.log("─".repeat(64));
  if (a.progress) printProgressDetail(a);
  console.log(
    blocking === 0
      ? "结论：前置就绪，可派 UAT。\n"
      : `结论：有 ${blocking} 项阻断，补齐后再派 UAT（否则 UAT 会中途退回）。\n`,
  );
  process.exit(blocking === 0 ? 0 : 1);
}

void main();
