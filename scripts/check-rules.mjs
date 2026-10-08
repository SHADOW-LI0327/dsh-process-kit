#!/usr/bin/env node
/**
 * check-rules —— 流程证据链台账门禁（零依赖，直接 `node` 运行）。
 *
 * 用途：校验「PRD frontmatter ↔ rules 台账 ↔ 测试文件头」三层证据链自洽：
 *   ① rules 的 TC ↔ 测试 `@case` 互引    ② 测试 `@prd` 有 rules 归属
 *   ③ invariants 有对应测试               ④ import 白名单（helpers/schema/routes 等合规入口）
 *   ⑥ `prdVersion` 三方一致               ⑦ PRD 冻结后「待裁定」字样不得存活进 test
 *   ⑧ 反向检查：测试里的 `@case` 必须在台账登记
 *   ⑨ 每条 TC 必须显式声明可识别的 automation 类型
 *   ⑩ 台账头注释自述的计数必须与实际一致
 *   ⑪ 非自动化类型（cdp/manual 等）应声明 carrier 承载脚本且文件存在
 *
 * 用法：
 *   node scripts/process/check-rules.mjs
 *
 * 退出码：
 *   0 = 无 ❌（⚠ 不计入）；1 = 存在 ❌，或配置缺失（PROJECT.md 不存在）
 *
 * 配置依赖（docs/process/PROJECT.md）：
 *   - 必需：文件存在（缺失即报错退出 1）。
 *   - 可选：「## 4. 项目配置」小节，支持表格 `| 配置项 | 值 |` 或 `- 配置项：值`：
 *       测试扫描目录：`test`（默认 test）
 *       测试文件后缀：`.test.ts`、`.test.mjs`、`.test.js`
 *       流程测试目录：应用 import 白名单的目录（默认 = 测试扫描目录）
 *       需求包测试目录：`test/packages`（归档批次豁免 git 跟踪过滤，仅在有台账时扫）
 *       import 白名单：正则列表，如 `^node:`、`^\.\.?/`、`@/api/routes`、`@/db/schema`、`helpers`
 *       自动化类型：`vitest`、`jest`、`node`、`junit`、`cdp`、`manual`、`uat`、`none`、`pending`、`withdrawn`
 *       @case 载体类型：需要源码 `@case` 载体的自动化类型（默认 vitest/jest/node/junit）
 *       junit 测试目录：可选，扫 `.java` 里的 `@case`（不配则跳过）
 *       待裁定字样：正则（默认 `以 Q-\d+ 裁定为准|或 HTTP \d+`）
 *       台账目录 / PRD 目录：默认 `docs/process/rules` / `docs/process/prd`
 *
 * 占位符纪律：§4 里含 `<` / `>` 的取值一律视为**未配置**，回落内置默认值 ——
 * 模板没被替换时，示例值绝不能变成真配置（那会把默认白名单/词表悄悄改窄）。
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { configValue, escapeRe, parseList, readSection } from "./project-config.mjs";

const PROJECT_REL = "docs/process/PROJECT.md";

const errors = [];
const oks = [];
const warns = [];
const err = (m) => errors.push(`❌ ${m}`);
const ok = (m) => oks.push(`✓ ${m}`);
// ⚠ 通道：可见但不计 ❌（用于"检查器自身盲区"，藏起来就会被遗忘）
const warn = (m) => warns.push(`⚠ ${m}`);

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
  process.stderr.write(`[check-rules] 失败：${msg}\n`);
  process.exit(1);
}

const DEFAULTS = {
  scanDirs: ["test"],
  testSuffixes: [".test.ts", ".test.mjs", ".test.js"],
  flowDirs: null, // null => 复用 scanDirs
  packageDirs: ["test/packages"],
  importWhitelist: [
    "^node:",
    "^https?:",
    "^\\.\\.?/",
    "^vitest$",
    "^@?vitest",
    "^jest$",
    "^@jest/",
    "^mocha$",
    "^express$",
    "^supertest$",
  ],
  automationTypes: [
    "vitest",
    "jest",
    "node",
    "junit",
    "cdp",
    "manual",
    "uat",
    "none",
    "pending",
    "withdrawn",
  ],
  carrierTypes: ["vitest", "jest", "node", "junit"],
  junitDir: null,
  frozenWording: "以 Q-\\d+ 裁定为准|或 HTTP \\d+",
  rulesDir: "docs/process/rules",
  prdDir: "docs/process/prd",
};

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
      `  台账门禁需要它来确定测试扫描目录与 import 白名单（§4 项目配置）。\n` +
      `  请先创建 docs/process/PROJECT.md；缺失即无法判定，故直接拒绝。\n` +
      `  退出码：1（配置缺失）`,
  );
}
const projectText = readFileSync(projectFile, "utf8");
const sec4 = readSection(
  projectText,
  (level, title) => level === 2 && /^4([.、\s:：]|$)/.test(title) && !/^4\.\d/.test(title),
);
const cfg = {
  scanDirs: parseList(configValue(sec4, "测试扫描目录")) ?? DEFAULTS.scanDirs,
  testSuffixes: parseList(configValue(sec4, "测试文件后缀")) ?? DEFAULTS.testSuffixes,
  flowDirs: parseList(configValue(sec4, "流程测试目录")),
  packageDirs: parseList(configValue(sec4, "需求包测试目录")) ?? DEFAULTS.packageDirs,
  importWhitelist: parseList(configValue(sec4, "import 白名单")) ?? DEFAULTS.importWhitelist,
  automationTypes: parseList(configValue(sec4, "自动化类型")) ?? DEFAULTS.automationTypes,
  carrierTypes: parseList(configValue(sec4, "@case 载体类型")) ?? DEFAULTS.carrierTypes,
  junitDir: (parseList(configValue(sec4, "junit 测试目录")) ?? [])[0] ?? DEFAULTS.junitDir,
  frozenWording: (parseList(configValue(sec4, "待裁定字样")) ?? [DEFAULTS.frozenWording])[0],
  rulesDir: (parseList(configValue(sec4, "台账目录")) ?? [DEFAULTS.rulesDir])[0],
  prdDir: (parseList(configValue(sec4, "PRD 目录")) ?? [DEFAULTS.prdDir])[0],
};
if (!cfg.flowDirs) cfg.flowDirs = cfg.scanDirs;

const RULES_DIR = join(root, cfg.rulesDir);
const PRD_DIR = join(root, cfg.prdDir);
const AUTOMATION_TYPES = new Set(cfg.automationTypes);
const CARRIER_TYPES = new Set(cfg.carrierTypes);
const IMPORT_OK = cfg.importWhitelist.map((rx) => new RegExp(rx));

/** 取某条 TC 的台账文本块（到下一个条目行为止）。 */
function entryBlock(text, tc) {
  const key = `- id: ${tc}`;
  const start = text.indexOf(key);
  if (start < 0) return "";
  const rest = text.slice(start + key.length);
  const next = rest.search(/^\s*-\s*id:\s*TC-/m);
  return next < 0 ? rest : rest.slice(0, next);
}

// ── 扫哪些测试 ──
// 需求专属测试随批归档 ⇒ 归档目录被 gitignore，沿用「只扫入库文件」会让归档用例的
// @case 载体永远找不到。故：归档包目录**豁免跟踪过滤**，但只扫「当前仍有台账」的包；
// 其余目录维持「只扫 git 跟踪的文件」。非 git 工作区回退为不限制。
const trackedSet = (() => {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return new Set(out.split("\0").filter(Boolean));
  } catch {
    return null;
  }
})();
const isTracked = (rel) => trackedSet === null || trackedSet.has(rel);
// 归一化：git 清单用正斜杠，而 Windows 的 path.relative() 给反斜杠 ⇒ 不归一化会让
// 跟踪判定恒假。
const relOf = (p) => relative(root, p).split(sep).join("/");

const archivedLedgerIds = new Set(
  existsSync(RULES_DIR)
    ? readdirSync(RULES_DIR)
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
        .map((f) => f.replace(/\.ya?ml$/, ""))
    : [],
);

/** 归档需求测试的扫描判据：包目录下「仍有台账」才扫，其余按 git 跟踪过滤。 */
function isScannable(p) {
  const rel = relOf(p);
  for (const dir of cfg.packageDirs) {
    const prefix = `${dir.replace(/\/+$/, "")}/`;
    if (rel.startsWith(prefix)) {
      const rest = rel.slice(prefix.length);
      const pkg = rest.split("/")[0] ?? "";
      return archivedLedgerIds.has(pkg);
    }
  }
  return isTracked(rel);
}

/**
 * ④ 的 import 提取（两段式：先按词法状态把注释与字符串内容抹成空格，再在「代码态」
 * 文本上匹配 import/export-from/require/动态 import，用引号位置回查字面量真值）。
 * 这样字符串字面量与注释里的 `from "..."` 不再被误判为 import。
 */
function extractImports(text) {
  const chars = text.split("");
  const literals = new Map();
  const blank = (from, to) => {
    for (let k = from; k < to && k < chars.length; k += 1) {
      if (chars[k] !== "\n" && chars[k] !== "\r") chars[k] = " ";
    }
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "/" && d === "/") {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && d === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === c) break;
        j += 1;
      }
      literals.set(i, text.slice(i + 1, Math.min(j, text.length)));
      blank(i + 1, j);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  const masked = chars.join("");
  const out = [];
  const push = (m) => {
    const v = literals.get((m.index ?? 0) + m[0].length - 1);
    if (v !== undefined) out.push(v);
  };
  for (const m of masked.matchAll(/\b(?:import|export)\b[^;]*?\bfrom\s*(["'`])/g)) push(m);
  for (const m of masked.matchAll(/^[ \t]*import\s*(["'`])/gm)) push(m);
  for (const m of masked.matchAll(/\b(?:import|require)\s*\(\s*(["'`])/g)) push(m);
  return out;
}

// ── 扫描测试文件 ──
function scanTests(dirs) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (e !== "node_modules") walk(p);
        continue;
      }
      if (!cfg.testSuffixes.some((s) => e.endsWith(s))) continue;
      if (!isScannable(p)) continue;
      const text = readFileSync(p, "utf-8");
      const prd = (text.match(/@prd\s+([\w-]+)/) || [])[1] ?? "";
      const prdVersion = (text.match(/@prdVersion\s+(\d+)/) || [])[1] ?? "";
      const cases = [...text.matchAll(/@case\s+(TC-[\w-]+)/g)].map((m) => m[1]);
      out.push({ path: relOf(p), text, prd, prdVersion, cases, imports: extractImports(text) });
    }
  };
  dirs.forEach((d) => existsSync(d) && walk(d));
  return out;
}
const tests = scanTests(cfg.scanDirs.map((d) => join(root, d)));
const flowDirs = cfg.flowDirs.map((d) => d.replace(/\/+$/, ""));
const flowTests = tests.filter((t) => flowDirs.some((d) => t.path.startsWith(`${d}/`)));

// ── junit/.java 单测载体（可选）──
const javaTests = [];
if (cfg.junitDir) {
  const javaDir = join(root, cfg.junitDir);
  if (existsSync(javaDir)) {
    const walkJava = (d) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        const st = statSync(p);
        if (st.isDirectory()) {
          if (e !== "build") walkJava(p);
          continue;
        }
        if (!e.endsWith(".java")) continue;
        if (!isTracked(relOf(p))) continue;
        const text = readFileSync(p, "utf-8");
        javaTests.push({
          path: relOf(p),
          text,
          cases: [...text.matchAll(/@case\s+(TC-[\w-]+)/g)].map((m) => m[1]),
        });
      }
    };
    walkJava(javaDir);
  }
}

// ── import 白名单（④）──
for (const t of flowTests) {
  const bad = t.imports.filter((i) => !IMPORT_OK.some((rx) => rx.test(i)));
  if (bad.length) err(`④ import 白名单外 [${t.path}]: ${bad.join(", ")}`);
}
ok(`④ import 白名单扫描 ${flowTests.length} 个流程测试文件（白名单 ${IMPORT_OK.length} 条正则）`);

// ── 遍历 rules 台账 ──
const yamlFiles = existsSync(RULES_DIR)
  ? readdirSync(RULES_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
  : [];
let automationDeclared = 0;
let carrierMissing = 0;
let automationBad = 0;

/** 各自动化类型对应的源码载体集合（未列出的类型免 @case）。 */
function carriersOf(auto) {
  return auto === "junit" ? javaTests : tests;
}

for (const yf of yamlFiles) {
  const id = yf.replace(/\.ya?ml$/, "");
  const text = readFileSync(join(RULES_DIR, yf), "utf-8");
  const yamlVersion = (text.match(/^prdVersion:\s*(\d+)/m) || [])[1] ?? "";
  const caseIds = [...text.matchAll(/^\s*-\s*id:\s*(TC-[\w-]+)/gm)].map((m) => m[1]);
  const invariants = (text.match(/^invariants:\s*\[(.*?)\]/m)?.[1] ?? "").trim();

  // ① cases 引用的 TC 存在于测试文件；⑨ 每条必须显式声明可识别的自动化类型
  for (const tc of caseIds) {
    const blk = entryBlock(text, tc);
    const auto = (blk.match(/automation:\s*([^\s#]+)/) || [])[1] ?? "";
    if (!auto) {
      automationBad += 1;
      err(`⑨ ${tc} 未声明 automation（须显式声明：${[...AUTOMATION_TYPES].join("/")}）`);
    } else if (!AUTOMATION_TYPES.has(auto)) {
      // 词表精确匹配，不做基类型归一：容忍 `cdp(UI)` 这类特殊写法会演变成漏洞。
      automationBad += 1;
      const base = auto.replace(/\(.*\)$/, "");
      const hint = AUTOMATION_TYPES.has(base)
        ? `（词表为精确匹配，请改为 ${base}）`
        : `（词表：${[...AUTOMATION_TYPES].join("/")}）`;
      err(`⑨ ${tc} automation 取值不可识别：${auto}${hint}`);
    } else {
      automationDeclared += 1;
    }
    const holder = CARRIER_TYPES.has(auto)
      ? carriersOf(auto).find((t) => t.cases.includes(tc))
      : undefined;
    if (holder) {
      ok(`① ${tc} → ${holder.path}`);
    } else if (CARRIER_TYPES.has(auto)) {
      err(`① ${tc} 标 ${auto} 但源码载体里无此 @case`);
    } else {
      // ① 非自动化类型（cdp 等）免 @case，但仍报一次归属，保持 ✓ 计数稳定
      ok(`① ${tc} → ${auto}（非自动化类型，免 @case）`);
      // ⑪ 但它们没有 @case 可锚，若台账不声明承载脚本，判据就只活在某个一次性脚本里。
      const carrier = (blk.match(/carrier:\s*([^\s#]+)/) || [])[1]?.replace(/^["']|["']$/g, "");
      if (!carrier) {
        carrierMissing += 1;
        warn(`⑪ ${tc}（${auto}）未声明 carrier: 承载脚本路径`);
      } else if (!existsSync(join(root, carrier))) {
        err(`⑪ ${tc} 声明的 carrier 不存在：${carrier}`);
      } else {
        ok(`⑪ ${tc} carrier → ${carrier}`);
      }
    }
  }
  // ③ invariants 有 test/invariants 测试
  if (invariants && invariants !== "[]") {
    const invDirs = cfg.scanDirs.filter((d) => /invariant/i.test(d));
    const has =
      invDirs.length > 0 &&
      tests.some((t) => invDirs.some((d) => t.path.startsWith(`${d.replace(/\/+$/, "")}/`)));
    has ? ok(`③ ${id} invariants 有测试`) : err(`③ ${id} 有 invariants 但未找到对应测试目录的用例`);
  }
  // ⑥ prdVersion 一致（三方汇聚：PRD frontmatter ↔ rules 台账 ↔ 测试文件头）
  // 只比 test↔rules 会漏掉「PRD 升版而台账未同步」——那时三处一起偏离真实版本、门禁全绿。
  const prdPath = join(PRD_DIR, `${id}.md`);
  const prdVersion = existsSync(prdPath)
    ? ((readFileSync(prdPath, "utf-8").match(/^prdVersion:\s*(\d+)/m) || [])[1] ?? "")
    : "";
  if (!prdVersion) {
    // 无 PRD 的台账（如骨架/示例）不构成"版本漂移"，只提示、不判红。
    warn(`⑥ ${id} 无 PRD frontmatter 可锚定（${relative(root, prdPath)}），跳过 PRD 交叉校验`);
  } else if (yamlVersion && yamlVersion !== prdVersion) {
    err(`⑥ rules(${id})=${yamlVersion} ≠ PRD=${prdVersion}（PRD 升版而台账未同步）`);
  } else {
    ok(`⑥ rules(${id})=${yamlVersion || "?"} = PRD=${prdVersion} 一致`);
  }
  for (const t of tests.filter((t) => t.prd === id)) {
    if (yamlVersion && t.prdVersion && t.prdVersion !== yamlVersion) {
      err(
        `⑥ ${t.path} @prdVersion=${t.prdVersion} ≠ rules(${id})=${yamlVersion}（PRD=${prdVersion || "?"}）`,
      );
    } else {
      ok(`⑥ ${t.path} prdVersion=${t.prdVersion} 一致`);
    }
  }
}

ok(
  `⑨ 自动化类型声明：已声明且可识别 ${automationDeclared} 条 / 未声明或不可识别 ${automationBad} 条`,
);
if (carrierMissing > 0) {
  warn(
    `⑪ ${carrierMissing} 条非自动化类型判据未声明 carrier 承载脚本 —— 判据将无处复查；存量包按现状保留，新包应补`,
  );
}

// ② 测试 @prd 必须有 rules 归属
const ruleIds = yamlFiles.map((f) => f.replace(/\.ya?ml$/, ""));
for (const t of tests) {
  if (!t.prd) continue;
  ruleIds.includes(t.prd)
    ? ok(`② ${t.path} @prd=${t.prd} 有归属`)
    : err(`② ${t.path} @prd=${t.prd} 无 rules/${t.prd}.yaml`);
}

// ⑦ PRD 未冻结字样存活 = 禁进 test（对已建 rules 的 PRD 检查）
if (cfg.frozenWording) {
  const frozenRe = new RegExp(cfg.frozenWording, "g");
  for (const id of ruleIds) {
    const prdPath = join(PRD_DIR, `${id}.md`);
    if (!existsSync(prdPath)) continue;
    const prd = readFileSync(prdPath, "utf-8");
    const hits = prd.match(frozenRe) || [];
    const frozen = /^status:\s*frozen/m.test(prd) || /^gate2:\s*approved/m.test(prd);
    if (frozen && hits.length) {
      err(`⑦ PRD ${id} 已过 Gate2 但仍有 ${hits.length} 处「待裁定/或 HTTP」字样存活`);
    } else if (hits.length) {
      ok(`⑦ PRD ${id} 未冻结（${hits.length} 处待裁定，允许）`);
    } else {
      ok(`⑦ PRD ${id} 无存活待裁定字样`);
    }
  }
}

// ⑧ 反向检查：测试里的 @case 必须已在**对应台账**登记
// 与 ① 互补：① 只查「台账登记了、测试无载体」；⑧ 补上反方向。
// 包名由用例号前缀推出（TC-<包>-<序号>），到 rules/<包>.yaml 里找同号条目。
const registeredByPkg = new Map();
for (const yf of yamlFiles) {
  const text = readFileSync(join(RULES_DIR, yf), "utf-8");
  registeredByPkg.set(
    yf.replace(/\.ya?ml$/, ""),
    new Set([...text.matchAll(/^\s*-\s*id:\s*(TC-[\w-]+)/gm)].map((m) => m[1])),
  );
}
// 包名不能用正则从用例号里猜：段数不同。改为拿台账文件名做前缀匹配，取最长者。
const pkgNames = [...registeredByPkg.keys()].sort((a, b) => b.length - a.length);
const pkgOf = (tc) => pkgNames.find((p) => tc.startsWith(`TC-${p}-`)) ?? "";
let caseSeen = 0;
let caseRegistered = 0;
let caseUnregistered = 0;
let caseDynamic = 0;
// junit 载体与普通载体同等纳入反向对账，否则会给 junit 留一块"载体里有、台账里没有"的盲区。
for (const t of [...tests, ...javaTests]) {
  for (const m of t.text.matchAll(/@case\s+(TC-[\w-]*)/g)) {
    const line = t.text.slice(0, m.index).split("\n").length;
    // 模板字符串拼出的用例号无法静态对账：报"动态"而不报 ❌。
    if (t.text.slice(m.index + m[0].length).startsWith("${")) {
      caseDynamic += 1;
      caseSeen += 1;
      warn(`⑧b 动态用例号（无法静态校验）${t.path}:${line} —— 模板字符串生成，台账须从源文件显式列举`);
      continue;
    }
    const tc = m[1];
    caseSeen += 1;
    const pkg = pkgOf(tc);
    const ledger = pkg ? registeredByPkg.get(pkg) : undefined;
    if (!ledger) {
      caseUnregistered += 1;
      err(`⑧ ${t.path}:${line} ${tc} 无对应台账（rules/ 下无匹配的包）`);
    } else if (ledger.has(tc)) {
      caseRegistered += 1;
    } else {
      caseUnregistered += 1;
      err(`⑧ ${t.path}:${line} ${tc} 未在 rules/${pkg}.yaml 登记`);
    }
  }
}
ok(
  `⑧ 反向检查：测试 @case ${caseSeen} 条（已登记 ${caseRegistered} / 未登记 ${caseUnregistered} / 动态 ${caseDynamic}）`,
);

// ⑩ 台账头注释自述的计数必须与实际一致
// 「合计 N 条」「<类型>（N 条）」是给人/AI 读的摘要，不参与校验 ⇒ 台账增删后摘要会悄悄过期。
// 只校验能解析到的自述计数：写法有出入就跳过，不硬判红。
for (const yf of yamlFiles) {
  const id = yf.replace(/\.ya?ml$/, "");
  const text = readFileSync(join(RULES_DIR, yf), "utf-8");
  const head = text.slice(0, 2000);
  const declaredTotal = (head.match(/合计\s*\*{0,2}(\d+)\*{0,2}\s*条/) || [])[1];
  const actualIds = [...text.matchAll(/^\s*-\s*id:\s*(TC-[\w-]+)/gm)].map((m) => m[1]);
  const actualAuto = (tc) => (entryBlock(text, tc).match(/automation:\s*([^\s#]+)/) || [])[1] ?? "";
  const checks = [["合计", declaredTotal, actualIds.length]];
  for (const type of AUTOMATION_TYPES) {
    const declared = (head.match(new RegExp(`${escapeRe(type)}[^\\n]{0,20}?(\\d+)\\s*条`, "i")) || [])[1];
    if (declared === undefined) continue;
    checks.push([type, declared, actualIds.filter((tc) => actualAuto(tc) === type).length]);
  }
  const bad = checks.filter(([, d, a]) => d !== undefined && Number(d) !== a);
  if (bad.length === 0) {
    const parts = checks.filter(([, d]) => d !== undefined).map(([n, d]) => `${n}=${d}`);
    if (parts.length > 0) ok(`⑩ ${id} 台账头注释自述计数与实际一致（${parts.join(" / ")}）`);
  } else {
    for (const [name, d, a] of bad) err(`⑩ ${id} 台账头注释自述「${name} ${d} 条」≠ 实际 ${a} 条`);
  }
}

// ── 输出 ──
console.log(
  `\ncheck-rules：${oks.length} ✓ / ${errors.length} ❌` +
    (warns.length ? `（另有 ⚠ 可见提示 ${warns.length} 条，不计 ❌）` : "") +
    "\n",
);
warns.forEach((w) => console.log(w));
errors.forEach((e) => console.log(e));
if (errors.length) process.exit(1);
