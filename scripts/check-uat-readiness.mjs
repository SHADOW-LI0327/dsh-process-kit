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
import { CONFIG_KEYS, SECTION, configValue, parseList, readSection } from "./project-config.mjs";
import { detectLangFromRepo, makeMsg, resolveLang } from "./i18n.mjs";

const PROJECT_REL = "docs/process/PROJECT.md";

/**
 * 取词器：`msg(中文, English)`。root 还没解析出来时先按 cwd 推断语言，
 * 拿到 root 后立刻切成仓库语言（双语文档见 docs/I18N.md）。
 */
let msg = makeMsg(detectLangFromRepo(process.cwd()));

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

function fail(message) {
  process.stderr.write(`[check-uat-readiness] ${msg("失败：", "FAILED: ")}${message}\n`);
  process.exit(1);
}

const root = findRepoRoot(process.cwd());
if (!root) {
  fail(
    msg(
      `从 ${process.cwd()} 向上找不到仓库根（既无 docs/process/ 也无 .git）。\n` +
        `  请在仓库内运行，或先创建 docs/process/ 目录。`,
      `cannot find the repo root above ${process.cwd()} (neither docs/process/ nor .git exists).\n` +
        `  Run inside the repository, or create docs/process/ first.`,
    ),
  );
}
// root 已确定 ⇒ 立刻按仓库语言取词（环境变量 / .process-kit.json / PROJECT.md frontmatter / 文档推断）
msg = makeMsg(resolveLang(root));
const projectFile = join(root, PROJECT_REL);
if (!existsSync(projectFile)) {
  fail(
    msg(
      `找不到流程配置 ${PROJECT_REL}（仓库根：${root}）。\n` +
        `  UAT 前置自检需要它来确定后端/前端地址、验收账号与目标端点（§5 UAT 前置自检）。\n` +
        `  请先创建 docs/process/PROJECT.md；缺失即无法判定，故直接拒绝。\n` +
        `  退出码：1（配置缺失）`,
      `cannot find the process config ${PROJECT_REL} (repo root: ${root}).\n` +
        `  UAT preflight needs it to resolve the backend/frontend URLs, the UAT account and the target endpoints (§5 UAT preflight).\n` +
        `  Create docs/process/PROJECT.md first; without it nothing can be judged, so it refuses outright.\n` +
        `  exit code: 1 (missing config)`,
    ),
  );
}
const projectText = readFileSync(projectFile, "utf8");
// §5 定位：编号 5 / 含「UAT 前置」/ 含 `UAT preflight`（docs/I18N.md §3）
const sec5 = readSection(projectText, SECTION.uatPreflight);
const conf = (key) => parseList(configValue(sec5, key))?.[0] ?? null;

function parseArgs(argv) {
  const get = (key, fallback) => {
    const i = argv.indexOf(`--${key}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const apiPrefix = conf(CONFIG_KEYS.apiPrefix) ?? "/api/v1";
  const evidenceFromConfig = conf(CONFIG_KEYS.evidenceDir);
  const checklistDir = conf(CONFIG_KEYS.checklistDir) ?? "docs/process/uat";
  return {
    pkg: get("pkg", null),
    core: get("core", conf(CONFIG_KEYS.coreBackend) ?? "http://127.0.0.1:3000"),
    web: get("web", conf(CONFIG_KEYS.webFrontend) ?? "http://127.0.0.1:5173"),
    mobile: get("mobile", conf(CONFIG_KEYS.mobile) ?? "http://127.0.0.1:5174"),
    account: get("account", conf(CONFIG_KEYS.uatAccount)),
    password: get("password", conf(CONFIG_KEYS.uatPassword)),
    apiPrefix: get("api-prefix", apiPrefix),
    loginPath: get("login-path", conf(CONFIG_KEYS.loginPath) ?? `${apiPrefix}/auth/login`),
    tokenField: get("token-field", conf(CONFIG_KEYS.tokenField) ?? "data.accessToken"),
    cdp: get("cdp", conf(CONFIG_KEYS.deviceCdp) ?? "http://localhost:9222/json"),
    checklistDir: get("checklist-dir", checklistDir),
    evidenceDir: get("evidence", evidenceFromConfig),
    endpoints: parseList(configValue(sec5, CONFIG_KEYS.targetEndpoints)) ?? [],
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
      name: msg("UAT 完成度", "UAT progress"),
      detail: msg(
        "未配置证据目录（PROJECT.md §5「证据目录」或 --evidence），跳过",
        'no evidence dir configured (PROJECT.md §5 "Evidence dir" or --evidence), skipped',
      ),
    });
    return;
  }
  const checklistPath = join(root, args.checklistDir, `${args.pkg}-checklist.md`);
  if (!existsSync(checklistPath)) {
    results.push({
      level: "warn",
      name: msg("UAT 完成度", "UAT progress"),
      detail: msg(`清单缺失，无法统计：${checklistPath}`, `checklist missing, cannot count: ${checklistPath}`),
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
      name: msg("UAT 完成度", "UAT progress"),
      detail: msg(
        "清单里没找到 `### U-<NN>` 形式的项",
        "no `### U-<NN>` item found in the checklist",
      ),
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
    name: msg("UAT 完成度", "UAT progress"),
    detail: msg(
      `${done.length}/${ids.length} 项有可归属证据，已归属 ${files.length - unattributed.length} 个` +
        (unattributed.length > 0 ? `，未归属 ${unattributed.length} 个` : ""),
      `${done.length}/${ids.length} items have attributable evidence, ${files.length - unattributed.length} attributed` +
        (unattributed.length > 0 ? `, ${unattributed.length} unattributed` : ""),
    ),
  });
  progressIds = ids;
  progressCount = countOf;
  progressMissing = missing;
  progressUnattributed = unattributed.length;
}

/** 逐项完成度明细，由 main 在自检表下方调用。 */
function printProgressDetail(args) {
  if (progressIds.length === 0) return;
  console.log(
    msg(
      `UAT 逐项完成度 · ${args.evidenceDir}\n${"─".repeat(64)}`,
      `UAT per-item progress · ${args.evidenceDir}\n${"─".repeat(64)}`,
    ),
  );
  for (const id of progressIds) {
    const n = progressCount(id);
    console.log(
      `  ${n > 0 ? "✓" : "·"} ${id}  ${
        n > 0
          ? msg(`${n} 个证据`, `${n} evidence file(s)`)
          : msg("无 U-NN- 命名的证据", "no evidence named U-NN-")
      }`,
    );
  }
  if (progressMissing.length > 0) {
    console.log(
      msg(
        ` 尚无 U-NN- 证据的项：${progressMissing.join(" / ")}`,
        ` items with no U-NN- evidence yet: ${progressMissing.join(" / ")}`,
      ),
    );
  }
  if (progressUnattributed > 0) {
    console.log(
      msg(
        `  ⚠ 另有 ${progressUnattributed} 个证据文件无 U-NN- 前缀（移动端 M-NN 序列 / 原始探针），` +
          `未计入上表 —— 判某项"未做"前请先人眼确认这批`,
        `  ⚠ another ${progressUnattributed} evidence file(s) carry no U-NN- prefix (mobile M-NN series / raw probes), ` +
          `not counted above — eyeball this batch before judging an item "not done"`,
      ),
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
      msg(
        "缺少需求包 ID。用法：node scripts/process/check-uat-readiness.mjs --pkg <ID> [--core ...] [...]\n" +
          "  退出码：1（用法错误）",
        "missing package ID. Usage: node scripts/process/check-uat-readiness.mjs --pkg <ID> [--core ...] [...]\n" +
          "  exit code: 1 (usage error)",
      ),
    );
  }
  const results = [];

  // ① 清单必须在：清单缺失 ⇒ UAT 会直接退回，不先自检就白派
  const checklistRel = join(a.checklistDir, `${a.pkg}-checklist.md`);
  results.push(
    existsSync(join(root, checklistRel))
      ? { level: "ok", name: msg("UAT 清单", "UAT checklist"), detail: checklistRel }
      : {
          level: "fail",
          name: msg("UAT 清单", "UAT checklist"),
          detail: msg(`缺失：${checklistRel}（UAT 会直接退回）`, `missing: ${checklistRel} (UAT would bounce back immediately)`),
        },
  );

  // ② 三个前端/后端存活
  for (const [name, url] of [
    [msg("core 后端", "core backend"), a.core],
    [msg("Web 前端", "web frontend"), a.web],
    [msg("移动端", "mobile"), a.mobile],
  ]) {
    if (!url) {
      results.push({ level: "warn", name, detail: msg("未配置地址，跳过", "no URL configured, skipped") });
      continue;
    }
    const status = await probe(url);
    results.push(
      status === null
        ? { level: "fail", name, detail: msg(`${url} 不可达`, `${url} unreachable`) }
        : { level: "ok", name, detail: `${url} → HTTP ${status}` },
    );
  }

  // ③ 验收账号能登录
  let token = null;
  if (a.account && a.password && a.core) {
    token = await login(a.core, a.loginPath, a.account, a.password, a.tokenField);
    results.push(
      token
        ? {
            level: "ok",
            name: msg("验收账号登录", "UAT account login"),
            detail: msg(`${a.account} 登录成功`, `${a.account} logged in`),
          }
        : {
            level: "fail",
            name: msg("验收账号登录", "UAT account login"),
            detail: msg(
              `${a.account} 登录失败（账号/口令错？或登录路径 ${a.loginPath} 不符）`,
              `${a.account} failed to log in (wrong account/password? or the login path ${a.loginPath} does not match)`,
            ),
          },
    );
  } else {
    results.push({
      level: "warn",
      name: msg("验收账号登录", "UAT account login"),
      detail: msg(
        "未配置验收账号/口令（PROJECT.md §5 或 --account/--password），跳过",
        'no UAT account/password configured (PROJECT.md §5 or --account/--password), skipped',
      ),
    });
  }

  // ④ 目标端点逐段探测 —— 登录成功 ≠ 有权限，这一步才是 403 的真正防线
  if (a.endpoints.length === 0) {
    results.push({
      level: "warn",
      name: msg("目标端点权限", "target endpoint permissions"),
      detail: msg(
        "未配置目标端点（PROJECT.md §5「目标端点」），跳过",
        'no target endpoints configured (PROJECT.md §5 "Target endpoints"), skipped',
      ),
    });
  } else if (!token) {
    results.push({
      level: "warn",
      name: msg("目标端点权限", "target endpoint permissions"),
      detail: msg("登录失败或未配置，跳过", "login failed or not configured, skipped"),
    });
  } else {
    const denied = [];
    for (const ep of a.endpoints) {
      const path = /^https?:/.test(ep) ? ep : `${a.core}${a.apiPrefix}/${ep.replace(/^\//, "")}`;
      const status = await probe(path, 8000, token);
      if (status === 200) continue;
      denied.push(`${ep} → ${status ?? msg("不可达", "unreachable")}`);
    }
    results.push(
      denied.length === 0
        ? {
            level: "ok",
            name: msg("目标端点权限", "target endpoint permissions"),
            detail: msg(
              `${a.endpoints.length} 个端点段全 200`,
              `all ${a.endpoints.length} endpoint segment(s) returned 200`,
            ),
          }
        : {
            level: "fail",
            name: msg("目标端点权限", "target endpoint permissions"),
            detail: msg(
              `${denied.length}/${a.endpoints.length} 个非 200：\n      ` +
                denied.join("\n      ") +
                `\n      ⚠️ 若权限有缓存，刚补授时请稍等再复测，不要直接判为缺陷`,
              `${denied.length}/${a.endpoints.length} not 200:\n      ` +
                denied.join("\n      ") +
                `\n      ⚠️ if permissions are cached, wait a moment and re-test right after granting; do not judge it a defect`,
            ),
          },
    );
  }

  // ⑤ 真机通道（可选，不通只警告 —— 移动端也可用浏览器视口验）
  if (a.cdp) {
    const cdp = await probe(a.cdp, 5000);
    results.push(
      cdp === 200
        ? {
            level: "ok",
            name: msg("真机 CDP 通道", "device CDP channel"),
            detail: msg(`${a.cdp} 通`, `${a.cdp} reachable`),
          }
        : {
            level: "warn",
            name: msg("真机 CDP 通道", "device CDP channel"),
            detail: msg(
              `${a.cdp} 不通（可改用浏览器移动视口）`,
              `${a.cdp} unreachable (use a mobile viewport in the browser instead)`,
            ),
          },
    );
  }

  const icon = { ok: "✓", warn: "!", fail: "✗" };
  if (a.progress) reportProgress(results, a);
  const blocking = results.filter((r) => r.level === "fail").length;
  console.log(
    msg(
      `\nUAT 前置自检 · ${a.pkg}\n${"─".repeat(64)}`,
      `\nUAT preflight · ${a.pkg}\n${"─".repeat(64)}`,
    ),
  );
  // 列宽跟着名字走：中文名都 ≤ 16 时输出与旧版逐字一致；英文名更长也不会把 detail 挤到名字后面
  const nameWidth = Math.max(16, ...results.map((r) => r.name.length));
  for (const r of results) console.log(`  ${icon[r.level]} ${r.name.padEnd(nameWidth)} ${r.detail}`);
  console.log("─".repeat(64));
  if (a.progress) printProgressDetail(a);
  console.log(
    blocking === 0
      ? msg("结论：前置就绪，可派 UAT。\n", "conclusion: preflight is ready, dispatch UAT.\n")
      : msg(
          `结论：有 ${blocking} 项阻断，补齐后再派 UAT（否则 UAT 会中途退回）。\n`,
          `conclusion: ${blocking} blocking item(s); fix them before dispatching UAT (otherwise UAT bounces back midway).\n`,
        ),
  );
  process.exit(blocking === 0 ? 0 : 1);
}

void main();
