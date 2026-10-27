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
 *   ⑫ 越界事后判定：改动集里某文件的归属角色 ≠ 该包 journal 末条环节，且无 approve 覆盖
 *
 * 用法：
 *   node scripts/process/check-rules.mjs
 *   node scripts/process/check-rules.mjs --id FEAT-001   # 指定需求包（⑫ 判越界用；不给则从改动集推断）
 *
 * 退出码：
 *   0 = 无 ❌（⚠ 不计入）；1 = 存在 ❌，或配置缺失（PROJECT.md 不存在）
 *
 * ⚠️ 「脚本没法干活」与「干了活但这一条没判据」是两回事，退出码上必须分开：
 *   - **脚本级前置条件**（找不到仓库根 / 无 docs/process/ / 无 PROJECT.md）⇒ **exit 1**，
 *     此时 ①~⑫ 全部未判定。给 0 就是把空转报成绿（CI 会把「没查」当成「合格」）。
 *   - **⑫ 判据级 fail-open**（下列情况只让 ⑫ 跳过：⚠ 明说 + 不计 ❌，①~⑪ 照跑）：
 *     §3 属主表解析不到有效条目（未配置 / 全是 `<...>` 占位符）· git 不可用或取不到改动集 ·
 *     定不了唯一的需求包 ID · journal 缺失 / 没有环节 / 环节名认不出 · 属主表里找不到该文件的类别。
 *     来由：⑫ 是**判定不是拦截**，判不了时若判红，就是拿「没查」冒充「有问题」——
 *     假红会把人指去改一个根本没问题的地方（比不判更糟）。
 *
 * 配置依赖（docs/process/PROJECT.md）：
 *   - 必需：文件存在（缺失即报错退出 1 —— 脚本级前置条件，见上）。
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
 *
 * ⑫ 越界事后判定（为什么需要它）：
 *   角色边界是**提示词层面**的（角色管效率，交付质量由人在 Gate 上裁定），于是「越界改了不该改的
 *   文件」在机器侧**一点痕迹都没有**，只有人碰巧翻 diff 才发现。⑫ 把**机械可判**的那部分
 *   暴露出来，供人在 Gate 摘要的 ❓ 栏里裁定：
 *     · 改动集（`git diff --name-only` + `git diff --name-only --cached`，`-z` 分隔）里某文件的
 *       归属角色（据 PROJECT.md §3 产物属主表解析）与该包 journal 的末条环节不一致；
 *     · 且 journal 里没有任何一条 `approve` 点名覆盖它（覆盖口径：`files` 精确 / 目录 / `*` 通配）。
 *   ⑫a 是最优先、最确定的一条：**dev 环节的改动集里出现测试文件**（测试归 test 环节）——
 *   「运动员不吹裁判的哨」在文件层面唯一能机械判定的形态。
 *   **它是判定不是拦截**：只让越界可见，绝不阻断（人裁定后照旧放行）。
 *   判不了就跳过（⚠ + 说明），绝不判红 —— 见上面那条 fail-open 约定。
 *   **判定边界（只判流程目录之外）**：`docs/process/**` 整棵树**豁免**（PRD 状态位 / 设计稿 /
 *   规则表 / 契约 / 总纲 / 调度手册 / PROJECT.md / journal 及其旁挂件 / tools / prototypes …），
 *   只判 `docs/process/` 之外的交付物：源码、`<test-dir>/**`（⑫a 的主力）、`<e2e-dir>/**`、
 *   `reports/**`、`scripts/**`（**含** `scripts/process/**`：它在流程目录之外，按本判据的边界照判；
 *   若 §3 把它归 orchestrator，dev 环节动它会被判红 —— 那正是"谁在 dev 环节换了裁判的哨子"）。
 *   为什么整棵树都豁免（"恒红"推理）：§3 示例把 `docs/process/prd/**` 归 pm，而流程要求主控
 *   每次 Gate 后先改 `prd/<ID>.md` 的 frontmatter 状态位 ⇒ dev 环节的改动集几乎必然带着它，
 *   属主 pm ≠ 环节 dev 又无 approve 点名 ⇒ **每包每次必红**。恒红项会被人练成习惯性忽略，
 *   ⑫a 也跟着失效（违反总纲 §5 第 4 条「恒红的门禁项必须修掉或显式豁免」）⇒ 显式豁免。
 *   ⚠️ **代价（明说）**：流程目录**内部**的越界（如 dev 直接改 PRD / 改规则表）⑫ **不判**，
 *   那靠 Gate 上人看 diff。⑫ 不假装自己管得住那一层。
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { detectLangFromRepo, makeMsg, resolveLang } from "./i18n.mjs";
import {
  CONFIG_KEYS,
  HEADER,
  MARKER,
  SECTION,
  configValue,
  escapeRe,
  globToRegExp,
  isNumberedSection,
  isPlaceholder,
  parseList,
  parseTable,
  pathsInCell,
  readMarkedSection,
  readSection,
} from "./project-config.mjs";

const PROJECT_REL = "docs/process/PROJECT.md";
// 流程目录（与 findRepoRoot 向上找的 `docs/process` 同一个硬口径）：⑫ 的豁免边界。
const PROCESS_DIR_REL = "docs/process";

/** 取词器：`text(["中文", "English"])`；`root` 确定后按仓库语言切换（docs/I18N.md）。 */
let msg = makeMsg(detectLangFromRepo(process.cwd()));
const text = (pair) => msg(pair[0], pair[1]);

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

/**
 * 脚本级前置条件不满足 ⇒ **直接失败退出 1**（配置缺失，不放行、不假装查过）。
 * 与 ⑫ 的**判据级** fail-open（判不了就 ⚠ 跳过）刻意分开：脚本整个没法干活时给 0，
 * 就是把空转报成绿。
 */
function fail(message) {
  process.stderr.write(`[check-rules] ${text(["失败：", "FAILED: "])}${message}\n`);
  process.exit(1);
}

// ── 参数 ──
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

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
  // 冻结后不得存活的「待裁定」字样：中文原文 + 英文常用写法（docs/I18N.md）
  frozenWording: "以 Q-\\d+ 裁定为准|或 HTTP \\d+|pending Q-\\d+|see Q-\\d+|or HTTP \\d+",
  rulesDir: "docs/process/rules",
  prdDir: "docs/process/prd",
};

const root = findRepoRoot(process.cwd());
if (!root) {
  fail(
    msg(
      `从 ${process.cwd()} 向上找不到仓库根（既无 docs/process/ 也无 .git）。\n` +
        `  请在仓库内运行，或先创建 docs/process/ 目录。`,
      `cannot find the repo root above ${process.cwd()} (neither docs/process/ nor .git exists).\n` +
        `  Run inside the repository, or create the docs/process/ directory first.`,
    ),
  );
}
msg = makeMsg(resolveLang(root));
// 脚本级前置条件：没有流程配置就一条判据都判不了 ⇒ 直接失败（不假装查过）。
if (!existsSync(join(root, "docs", "process"))) {
  fail(
    msg(
      `目标仓库没有 docs/process/（流程未初始化）：${root}\n` +
        `  请先 process_init 落地流程骨架；缺失即无法判定，故直接拒绝。\n` +
        `  退出码：1（配置缺失）`,
      `the target repository has no docs/process/ (process not initialized): ${root}\n` +
        `  Run process_init to scaffold the process first; without it nothing can be judged, so this is refused.\n` +
        `  Exit code: 1 (missing configuration)`,
    ),
  );
}
const projectFile = join(root, PROJECT_REL);
if (!existsSync(projectFile)) {
  fail(
    msg(
      `找不到流程配置 ${PROJECT_REL}（仓库根：${root}）。\n` +
        `  台账门禁需要它来确定测试扫描目录与 import 白名单（§4 项目配置）。\n` +
        `  请先创建 docs/process/PROJECT.md；缺失即无法判定，故直接拒绝。\n` +
        `  退出码：1（配置缺失）`,
      `cannot find the process config ${PROJECT_REL} (repo root: ${root}).\n` +
        `  The rules ledger gate needs it to resolve the test scan dirs and the import allowlist (§4 project config).\n` +
        `  Create docs/process/PROJECT.md first; without it nothing can be judged, so this is refused.\n` +
        `  Exit code: 1 (missing configuration)`,
    ),
  );
}
const projectText = readFileSync(projectFile, "utf8");
const sec4 = readSection(projectText, SECTION.projectConfig);
const cfg = {
  scanDirs: parseList(configValue(sec4, CONFIG_KEYS.testScanDirs)) ?? DEFAULTS.scanDirs,
  testSuffixes: parseList(configValue(sec4, CONFIG_KEYS.testSuffixes)) ?? DEFAULTS.testSuffixes,
  flowDirs: parseList(configValue(sec4, CONFIG_KEYS.flowTestDirs)),
  packageDirs: parseList(configValue(sec4, CONFIG_KEYS.packageTestDirs)) ?? DEFAULTS.packageDirs,
  importWhitelist: parseList(configValue(sec4, CONFIG_KEYS.importAllowlist)) ?? DEFAULTS.importWhitelist,
  automationTypes: parseList(configValue(sec4, CONFIG_KEYS.automationTypes)) ?? DEFAULTS.automationTypes,
  carrierTypes: parseList(configValue(sec4, CONFIG_KEYS.caseCarrierTypes)) ?? DEFAULTS.carrierTypes,
  junitDir: (parseList(configValue(sec4, CONFIG_KEYS.junitDirs)) ?? [])[0] ?? DEFAULTS.junitDir,
  frozenWording: (parseList(configValue(sec4, CONFIG_KEYS.pendingPatterns)) ?? [DEFAULTS.frozenWording])[0],
  rulesDir: (parseList(configValue(sec4, CONFIG_KEYS.rulesDir)) ?? [DEFAULTS.rulesDir])[0],
  prdDir: (parseList(configValue(sec4, CONFIG_KEYS.prdDir)) ?? [DEFAULTS.prdDir])[0],
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
  if (bad.length) {
    err(
      msg(
        `④ import 白名单外 [${t.path}]: ${bad.join(", ")}`,
        `④ import outside the allowlist [${t.path}]: ${bad.join(", ")}`,
      ),
    );
  }
}
ok(
  msg(
    `④ import 白名单扫描 ${flowTests.length} 个流程测试文件（白名单 ${IMPORT_OK.length} 条正则）`,
    `④ import allowlist scanned ${flowTests.length} flow test file(s) (${IMPORT_OK.length} allowlist regex(es))`,
  ),
);

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
      err(
        msg(
          `⑨ ${tc} 未声明 automation（须显式声明：${[...AUTOMATION_TYPES].join("/")}）`,
          `⑨ ${tc} declares no automation (must declare explicitly: ${[...AUTOMATION_TYPES].join("/")})`,
        ),
      );
    } else if (!AUTOMATION_TYPES.has(auto)) {
      // 词表精确匹配，不做基类型归一：容忍 `cdp(UI)` 这类特殊写法会演变成漏洞。
      automationBad += 1;
      const base = auto.replace(/\(.*\)$/, "");
      const hint = AUTOMATION_TYPES.has(base)
        ? msg(`（词表为精确匹配，请改为 ${base}）`, ` (the vocabulary is matched exactly; use ${base})`)
        : msg(
            `（词表：${[...AUTOMATION_TYPES].join("/")}）`,
            ` (vocabulary: ${[...AUTOMATION_TYPES].join("/")})`,
          );
      err(
        msg(
          `⑨ ${tc} automation 取值不可识别：${auto}${hint}`,
          `⑨ ${tc} automation type is not recognized: ${auto}${hint}`,
        ),
      );
    } else {
      automationDeclared += 1;
    }
    const holder = CARRIER_TYPES.has(auto)
      ? carriersOf(auto).find((t) => t.cases.includes(tc))
      : undefined;
    if (holder) {
      ok(`① ${tc} → ${holder.path}`);
    } else if (CARRIER_TYPES.has(auto)) {
      err(
        msg(
          `① ${tc} 标 ${auto} 但源码载体里无此 @case`,
          `① ${tc} is marked ${auto} but no such @case exists in the source case carriers`,
        ),
      );
    } else {
      // ① 非自动化类型（cdp 等）免 @case，但仍报一次归属，保持 ✓ 计数稳定
      // automation 缺失时同样的空括号陷阱：渲染成「① TC-x → 未声明 automation」而不是「→ （…」。
      ok(
        msg(
          auto === ""
            ? `① ${tc} → 未声明 automation（免 @case）`
            : `① ${tc} → ${auto}（非自动化类型，免 @case）`,
          auto === ""
            ? `① ${tc} → automation not declared (@case not required)`
            : `① ${tc} → ${auto} (non-automation type, @case not required)`,
        ),
      );
      // ⑪ 但它们没有 @case 可锚，若台账不声明承载脚本，判据就只活在某个一次性脚本里。
      const carrier = (blk.match(/carrier:\s*([^\s#]+)/) || [])[1]?.replace(/^["']|["']$/g, "");
      if (!carrier) {
        carrierMissing += 1;
        // automation 缺失时不要渲染空括号（旧文案会变成「⑪ TC-x（）未声明 carrier」）。
        warn(
          msg(
            auto === ""
              ? `⑪ ${tc} 未声明 carrier: 承载脚本路径`
              : `⑪ ${tc}（${auto}）未声明 carrier: 承载脚本路径`,
            auto === ""
              ? `⑪ ${tc} declares no carrier: path to the carrying script`
              : `⑪ ${tc} (${auto}) declares no carrier: path to the carrying script`,
          ),
        );
      } else if (!existsSync(join(root, carrier))) {
        err(
          msg(
            `⑪ ${tc} 声明的 carrier 不存在：${carrier}`,
            `⑪ ${tc} declares a carrier that does not exist: ${carrier}`,
          ),
        );
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
    has
      ? ok(msg(`③ ${id} invariants 有测试`, `③ ${id} invariants have tests`))
      : err(
          msg(
            `③ ${id} 有 invariants 但未找到对应测试目录的用例`,
            `③ ${id} declares invariants but no case was found under the matching test dir`,
          ),
        );
  }
  // ⑥ prdVersion 一致（三方汇聚：PRD frontmatter ↔ rules 台账 ↔ 测试文件头）
  // 只比 test↔rules 会漏掉「PRD 升版而台账未同步」——那时三处一起偏离真实版本、门禁全绿。
  const prdPath = join(PRD_DIR, `${id}.md`);
  const prdVersion = existsSync(prdPath)
    ? ((readFileSync(prdPath, "utf-8").match(/^prdVersion:\s*(\d+)/m) || [])[1] ?? "")
    : "";
  if (!prdVersion) {
    // 无 PRD 的台账（如骨架/示例）不构成"版本漂移"，只提示、不判红。
    warn(
      msg(
        `⑥ ${id} 无 PRD frontmatter 可锚定（${relative(root, prdPath)}），跳过 PRD 交叉校验`,
        `⑥ ${id} has no PRD frontmatter to anchor on (${relative(root, prdPath)}), skipping the PRD cross-check`,
      ),
    );
  } else if (yamlVersion && yamlVersion !== prdVersion) {
    err(
      msg(
        `⑥ rules(${id})=${yamlVersion} ≠ PRD=${prdVersion}（PRD 升版而台账未同步）`,
        `⑥ rules(${id})=${yamlVersion} ≠ PRD=${prdVersion} (the PRD version was bumped but the ledger was not synced)`,
      ),
    );
  } else {
    ok(
      msg(
        `⑥ rules(${id})=${yamlVersion || "?"} = PRD=${prdVersion} 一致`,
        `⑥ rules(${id})=${yamlVersion || "?"} = PRD=${prdVersion} consistent`,
      ),
    );
  }
  for (const t of tests.filter((t) => t.prd === id)) {
    if (yamlVersion && t.prdVersion && t.prdVersion !== yamlVersion) {
      err(
        msg(
          `⑥ ${t.path} @prdVersion=${t.prdVersion} ≠ rules(${id})=${yamlVersion}（PRD=${prdVersion || "?"}）`,
          `⑥ ${t.path} @prdVersion=${t.prdVersion} ≠ rules(${id})=${yamlVersion} (PRD=${prdVersion || "?"})`,
        ),
      );
    } else {
      ok(
        msg(
          `⑥ ${t.path} prdVersion=${t.prdVersion} 一致`,
          `⑥ ${t.path} prdVersion=${t.prdVersion} consistent`,
        ),
      );
    }
  }
}

ok(
  msg(
    `⑨ 自动化类型声明：已声明且可识别 ${automationDeclared} 条 / 未声明或不可识别 ${automationBad} 条`,
    `⑨ automation type declarations: ${automationDeclared} declared and recognized / ${automationBad} missing or unrecognized`,
  ),
);
if (carrierMissing > 0) {
  warn(
    msg(
      `⑪ ${carrierMissing} 条非自动化类型判据未声明 carrier 承载脚本 —— 判据将无处复查；存量包按现状保留，新包应补`,
      `⑪ ${carrierMissing} non-automation criteria declare no carrier script — there will be nowhere to re-check them; existing packages may stay as-is, new packages should add one`,
    ),
  );
}

// ② 测试 @prd 必须有 rules 归属
const ruleIds = yamlFiles.map((f) => f.replace(/\.ya?ml$/, ""));
for (const t of tests) {
  if (!t.prd) continue;
  ruleIds.includes(t.prd)
    ? ok(msg(`② ${t.path} @prd=${t.prd} 有归属`, `② ${t.path} @prd=${t.prd} has an owning ledger`))
    : err(
        msg(
          `② ${t.path} @prd=${t.prd} 无 rules/${t.prd}.yaml`,
          `② ${t.path} @prd=${t.prd} has no rules/${t.prd}.yaml`,
        ),
      );
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
      err(
        msg(
          `⑦ PRD ${id} 已过 Gate2 但仍有 ${hits.length} 处「待裁定/或 HTTP」字样存活`,
          `⑦ PRD ${id} passed Gate2 but ${hits.length} pending-ruling wording(s) are still alive`,
        ),
      );
    } else if (hits.length) {
      ok(
        msg(
          `⑦ PRD ${id} 未冻结（${hits.length} 处待裁定，允许）`,
          `⑦ PRD ${id} is not frozen (${hits.length} pending-ruling wording(s), allowed)`,
        ),
      );
    } else {
      ok(
        msg(
          `⑦ PRD ${id} 无存活待裁定字样`,
          `⑦ PRD ${id} has no live pending-ruling wording`,
        ),
      );
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
      warn(
        msg(
          `⑧b 动态用例号（无法静态校验）${t.path}:${line} —— 模板字符串生成，台账须从源文件显式列举`,
          `⑧b dynamic case id (cannot be checked statically) ${t.path}:${line} — generated from a template string; the ledger must list it explicitly from the source file`,
        ),
      );
      continue;
    }
    const tc = m[1];
    caseSeen += 1;
    const pkg = pkgOf(tc);
    const ledger = pkg ? registeredByPkg.get(pkg) : undefined;
    if (!ledger) {
      caseUnregistered += 1;
      err(
        msg(
          `⑧ ${t.path}:${line} ${tc} 无对应台账（rules/ 下无匹配的包）`,
          `⑧ ${t.path}:${line} ${tc} has no matching ledger (no package under rules/ matches)`,
        ),
      );
    } else if (ledger.has(tc)) {
      caseRegistered += 1;
    } else {
      caseUnregistered += 1;
      err(
        msg(
          `⑧ ${t.path}:${line} ${tc} 未在 rules/${pkg}.yaml 登记`,
          `⑧ ${t.path}:${line} ${tc} is not registered in rules/${pkg}.yaml`,
        ),
      );
    }
  }
}
ok(
  msg(
    `⑧ 反向检查：测试 @case ${caseSeen} 条（已登记 ${caseRegistered} / 未登记 ${caseUnregistered} / 动态 ${caseDynamic}）`,
    `⑧ reverse check: ${caseSeen} @case annotation(s) in tests (${caseRegistered} registered / ${caseUnregistered} unregistered / ${caseDynamic} dynamic)`,
  ),
);

// ⑩ 台账头注释自述的计数必须与实际一致
// 「合计 N 条」「<类型>（N 条）」是给人/AI 读的摘要，不参与校验 ⇒ 台账增删后摘要会悄悄过期。
// 只校验能解析到的自述计数：写法有出入就跳过，不硬判红。
for (const yf of yamlFiles) {
  const id = yf.replace(/\.ya?ml$/, "");
  const text = readFileSync(join(RULES_DIR, yf), "utf-8");
  const head = text.slice(0, 2000);
  const declaredTotal = (head.match(/(?:合计|total)\s*\*{0,2}(\d+)\*{0,2}\s*(?:条|cases?|tests?)?/i) || [])[1];
  const actualIds = [...text.matchAll(/^\s*-\s*id:\s*(TC-[\w-]+)/gm)].map((m) => m[1]);
  const actualAuto = (tc) => (entryBlock(text, tc).match(/automation:\s*([^\s#]+)/) || [])[1] ?? "";
  const checks = [[msg("合计", "total"), declaredTotal, actualIds.length]];
  for (const type of AUTOMATION_TYPES) {
    const declared = (head.match(new RegExp(`${escapeRe(type)}[^\\n]{0,20}?(\\d+)\\s*(?:条|cases?|tests?)`, "i")) || [])[1];
    if (declared === undefined) continue;
    checks.push([type, declared, actualIds.filter((tc) => actualAuto(tc) === type).length]);
  }
  const bad = checks.filter(([, d, a]) => d !== undefined && Number(d) !== a);
  if (bad.length === 0) {
    const parts = checks.filter(([, d]) => d !== undefined).map(([n, d]) => `${n}=${d}`);
    if (parts.length > 0) {
      ok(
        msg(
          `⑩ ${id} 台账头注释自述计数与实际一致（${parts.join(" / ")}）`,
          `⑩ ${id} the ledger header comment's self-declared counts match the actual ones (${parts.join(" / ")})`,
        ),
      );
    }
  } else {
    for (const [name, d, a] of bad) {
      err(
        msg(
          `⑩ ${id} 台账头注释自述「${name} ${d} 条」≠ 实际 ${a} 条`,
          `⑩ ${id} the ledger header comment declares "${name} ${d}" ≠ actual ${a}`,
        ),
      );
    }
  }
}

// ── ⑫ 越界事后判定（role boundary post-hoc check）的公共件 ──

/**
 * 角色 / 环节名归一：§3 属主表写 `dev`，journal 里却可能写 `subagent:dev-agent` 或 `role-dev`
 * —— 不归一会把同一个人算成两个角色，⑫ 见谁咬谁（假红）。
 */
function roleKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/^subagent:/, "")
    .replace(/^role-/, "")
    .replace(/-agent$/, "")
    .replace(/[（(].*$/, "")
    .trim();
}

/** 角色别名：技能名 `product-manager` 与 §3 里的 `pm` 是同一个人。 */
const ROLE_ALIAS = { "product-manager": "pm" };

/** 环节与归属角色是否算同一个：`review` 环节兼容 code-review / logic-review / security-review。 */
function sameRole(a, b) {
  const x = ROLE_ALIAS[a] ?? a;
  const y = ROLE_ALIAS[b] ?? b;
  if (!x || !y) return false;
  if (x === y) return true;
  if (x === "review") return y.endsWith("-review");
  if (y === "review") return x.endsWith("-review");
  return false;
}

/** 角色单元格 → 角色名列表（支持 `a · b`、反引号逐个列出）。 */
function roleTokens(cell) {
  const ticked = [...String(cell).matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const raw = ticked.length > 0 ? ticked : String(cell).split(/[\s、,，;；·|]+/);
  return [...new Set(raw.map(roleKey).filter(Boolean))];
}

/**
 * §3 产物属主表 → [{ roles, globs }]。
 * 占位符行 / 条目一律丢弃（含 `<` `>` = 模板没被替换 ⇒ **未配置**，绝不能变成生效规则）。
 */
function loadOwnerRows(ownerText) {
  const sec = readMarkedSection(ownerText, MARKER.ownerTable, SECTION.ownerTable);
  if (!sec) return [];
  const rows = parseTable(sec.body);
  const header = rows.find((r) => r.some((c) => HEADER.writablePaths.test(c)));
  if (!header) return [];
  const col = header.findIndex((c) => HEADER.writablePaths.test(c));
  const out = [];
  for (const row of rows) {
    if (row === header || row.length <= col) continue;
    const globs = pathsInCell(row[col] ?? "").filter((p) => !isPlaceholder(p));
    if (globs.length === 0) continue;
    const roles = roleTokens(row[0] ?? "");
    if (roles.length === 0) continue;
    out.push({ roles, globs });
  }
  return out;
}

/** ⑫ 的改动集：工作区未提交改动 + 已暂存改动；git 不可用 / 非仓库返回 null（调用方跳过）。 */
function gitChangedPaths() {
  const out = new Set();
  for (const argv of [
    ["diff", "--name-only", "-z"],
    ["diff", "--name-only", "--cached", "-z"],
  ]) {
    let text;
    try {
      text = execFileSync("git", argv, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      return null;
    }
    // **必须用 `-z`**：git 默认 core.quotePath=true 会把非 ASCII 路径按八进制转义加引号输出，
    // 那串文本匹配不上任何属主通配 ⇒ 中文路径会被当成「无归属」或干脆漏判。
    // `-z` 同时解决了含空格 / 换行的路径被拆成多条。
    for (const p of text.split("\0")) if (p !== "") out.add(p);
  }
  // ⚠️ 已知边界：**未跟踪又未暂存**的新文件不在这两条命令的输出里（`git diff` 只管已跟踪文件）。
  // 这不是遗漏：那一批由落点门禁 check-artifact-paths 负责；⑫ 只管「相对 HEAD 的改动」。
  return [...out];
}

/** 该包的 journal（逐行 JSON.parse）；文件不存在返回 null。坏行不参与判定。 */
function readJournalLines(id) {
  const file = join(root, cfg.prdDir, `${id}.journal.jsonl`);
  if (!existsSync(file)) return null;
  const entries = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    try {
      entries.push(JSON.parse(t));
    } catch {
      /* journal-append 有锁与指纹兜底；这里坏行只是不参与判定 */
    }
  }
  return entries;
}

/** journal 的「当前环节」：末条带 step 的记录；全都没有 step 时回落末条 actor；都没有 ⇒ null。 */
function lastStep(entries) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const s = typeof entries[i]?.step === "string" ? entries[i].step.trim() : "";
    if (s !== "") return { label: s, key: roleKey(s) };
  }
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const a = typeof entries[i]?.actor === "string" ? entries[i].actor.trim() : "";
    if (a !== "") {
      return {
        label: msg(`${a}（无 step，按 actor 判）`, `${a} (no step; judged by actor)`),
        key: roleKey(a),
      };
    }
  }
  return null;
}

/**
 * journal 里是否有 approve 点名覆盖该文件。
 * 口径（只取机械可判的那部分）：`action: approve`，且 `files` 里有条目精确 / 目录前缀 / `*` 通配命中。
 * · **不看 actor**：谁批的（人 / 主控）由人在 Gate 上读 journal 裁定，机器只答「有没有被点名认领」。
 * · **没有 files 的 approve 不算覆盖** —— 它没点名任何东西，覆盖范围无从判定（宁可不判）。
 */
function approveCovers(entries, file) {
  return entries.some((e) => {
    if (String(e?.action ?? "").trim().toLowerCase() !== "approve") return false;
    const files = Array.isArray(e?.files) ? e.files : typeof e?.files === "string" ? [e.files] : [];
    return files.some((f) => globToRegExp(String(f)).test(file));
  });
}

/**
 * ⑫ 的豁免判据：是不是**流程目录**（`docs/process/**`）下的改动。
 *
 * 【为什么整棵树都豁免（这是"恒红"推理，不是宽容）】
 *   ① 模板 `scaffold/PROJECT.md` §3 属主表把 `docs/process/prd/**` 归 **pm**；
 *   ② 流程本身要求主控**每次 Gate 与人签后先改 frontmatter 状态位**（`gate2: approved` /
 *      `status: implementing` …），改的就是 `docs/process/prd/<ID>.md`；
 *   ③ 于是 dev 环节的改动集里几乎必然带着 `docs/process/prd/<ID>.md`：属主 pm ≠ 环节 dev，
 *      且主控**不会**给自己的状态位更新记一条 approve 去点名它 ⇒ 判红；
 *   ④ 那不是"偶尔噪音"而是**每包每次必红**。恒红的门禁项会被人练成习惯性忽略，
 *      ⑫a（dev 动测试）这条真正有价值的判据会跟着一起被忽略 —— 违反总纲 §5 第 4 条
 *      「恒红的门禁项必须修掉或显式豁免」。故**显式豁免**流程目录整棵树。
 *
 * 口径：`docs/process/**` 一律豁免（PRD 状态位 / 设计稿 / 规则表 / 契约 / 总纲 / 调度手册 /
 * PROJECT.md / journal 及其旁挂件 / tools / prototypes …）—— 流程目录是**流程自己的载体**，
 * 不是交付物；谁在何时动它属于流程运转，不属于角色越界。原 journal 专项豁免被这一条吸收
 * （8j 保留作回归：它现在是本豁免的真子集）。
 *
 * ⚠️ **本判据的边界与代价（明说，不含糊）**：流程目录**内部**的越界（例如 dev 直接改 PRD、
 * 改规则表冒充别人）⑫ **不判** —— 那靠 Gate 上人看 diff。⑫ 只判流程目录**之外**的交付物。
 *
 * 实现注意：改动集来自 git（仓库根相对、`/` 分隔），但别被 `../` 或大小写绕过 ——
 * 绝对路径 / 含 `..` 上跳一律**不豁免**（认不出来就不判，交给人看）；大小写按不敏感比
 * （macOS/Windows 的 FS 大小写不敏感，真实目录可能写成 `Docs/Process/`；而"小写后落在
 * `docs/process/` 下"的路径本来就在流程树里，放宽这一层放不走流程目录之外的交付物）。
 */
function isProcessBookkeeping(relPath) {
  const p = String(relPath).replace(/\\/g, "/").replace(/^\.\//, "");
  if (p === "" || p.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(p)) return false;
  return p.toLowerCase().startsWith(`${PROCESS_DIR_REL}/`);
}

/**
 * 定需求包 ID：`--id` / `--pkg` 显式指定优先；否则从改动集推断（journal / 台账 / PRD 文件名，
 * 以及改动过的测试文件头 `@prd`）。定不了**唯一**包 ⇒ 返回 error，调用方跳过 —— 不猜、不乱判。
 */
function candidatePackageIds(changed) {
  const explicit = [args.id, args.pkg].find((v) => typeof v === "string" && v !== "");
  if (explicit) return { id: explicit };
  const found = new Set();
  const prdRe = new RegExp(`^${escapeRe(cfg.prdDir)}/([^/]+?)(?:\\.journal\\.jsonl.*|\\.md)$`);
  const rulesRe = new RegExp(`^${escapeRe(cfg.rulesDir)}/([^/]+?)\\.ya?ml$`);
  for (const f of changed) {
    for (const re of [prdRe, rulesRe]) {
      const m = f.match(re);
      // `_TEMPLATE.md` / `_DESIGN_TEMPLATE.md` 这类骨架文件不是需求包（scaffold 的命名约定）
      if (m && !m[1].startsWith("_")) found.add(m[1].replace(/-(?:design|arch|ui-spec)$/, ""));
    }
    // 测试文件头的 @prd：随批新增的用例是「改了测试」的主战场，文件名常常看不出包
    const abs = join(root, f);
    if (cfg.testSuffixes.some((s) => f.endsWith(s)) && existsSync(abs) && statSync(abs).isFile()) {
      const m = readFileSync(abs, "utf8").match(/@prd\s+([\w-]+)/);
      if (m) found.add(m[1]);
    }
  }
  const list = [...found].filter(Boolean).sort();
  if (list.length === 1) return { id: list[0] };
  if (list.length === 0) {
    return {
      error: msg(
        "未指定需求包 ID（--id <ID>），且从改动集里推断不出包 —— 没有包就没有 journal，" +
          "无法判定「当前环节」",
        "no requirement package ID given (--id <ID>), and none can be inferred from the change set — " +
          "no package means no journal, so the current step cannot be judged",
      ),
    };
  }
  return {
    error: msg(
      `改动集涉及多个需求包（${list.join(" / ")}），请用 --id <ID> 指定要判哪一个`,
      `the change set touches multiple requirement packages (${list.join(" / ")}); use --id <ID> to pick the one to judge`,
    ),
  };
}

// ── ⑫ 越界事后判定（role boundary post-hoc check）──
//
// 【为什么需要它】角色边界是**提示词层面**的（角色管效率，交付质量由人在 Gate 上裁定），
// 于是「越界改了不该改的文件」在机器侧**一点痕迹都没有** —— 只有人碰巧翻 diff 才发现。
// 本判据把**机械可判**的那部分暴露出来，供人在 Gate 摘要的 ❓ 栏里裁定：
//   · 改动集里某文件的归属角色（据 §3 产物属主表解析）与该包 journal 的末条环节不一致；
//   · 且 journal 里没有任何一条 `approve` 点名覆盖它。
// ⑫a 是最优先、最确定的一条：**dev 环节的改动集里出现测试文件**（测试归 test 环节）——
// 「运动员不吹裁判的哨」在文件层面唯一能机械判定的形态。
//
// 【这是判定不是拦截】它只让越界**可见**，绝不阻断：人裁定后照旧放行。
//
// 【fail-open（判据级）】判不了就跳过（⚠ + 说明），绝不判红：取不到改动集 / §3 未配置 /
// 定不了唯一包 ID / journal 缺失或没有 step / 属主表里找不到该文件的类别。理由：假红会把人指去
// 改一个根本没问题的地方，比不判更糟；「无法判定」与「查到越界」必须是两件事。
// ⚠️ 这只是**判据级**的跳过：脚本级前置条件（无 docs/process / 无 PROJECT.md）仍旧 exit 1。
//
// 【豁免：判定边界 = 只判流程目录之外】`docs/process/**` 整棵树不参与判定（既不算越界，也不算
// 「无法判定」）—— 它是**流程自己的载体**，不是交付物。原 journal 专项豁免被这一条吸收
// （8j 保留作回归）。为什么整棵树（"恒红"推理）：§3 示例把 `docs/process/prd/**` 归 pm，
// 流程又要求主控每次 Gate 后先改 `prd/<ID>.md` 的 frontmatter 状态位 ⇒ dev 环节的改动集几乎
// 必然带着它，属主 pm ≠ 环节 dev 且无 approve 点名 ⇒ 每包每次必红；恒红项会被练成习惯性忽略，
// ⑫a 跟着失效（违反总纲 §5 第 4 条）。详见 isProcessBookkeeping 的注释。
// ⚠️ 代价（明说）：流程目录**内部**的越界（dev 直接改 PRD / 改规则表）⑫ **不判**，靠 Gate 上人看 diff。
// 照判的是流程目录之外的一切：源码、`<test-dir>/**`（⑫a 主力）、`<e2e-dir>/**`、`reports/**`、
// `scripts/**`（**含** `scripts/process/**`，它在流程目录之外）。
// 注意：豁免是「这一条不判」，不是「整轮没跑」—— 改动集只含流程簿记文件时，⑫ 也不得打「跳过」。
{
  const changed = gitChangedPaths();
  const ownerRows = loadOwnerRows(projectText);
  if (changed === null) {
    warn(
      msg(
        "⑫ 跳过：取不到 git 改动集（非 git 仓库，或 git 命令不可用）—— 无法判定越界",
        "⑫ skipped: cannot obtain the git change set (not a git repository, or the git command is unavailable) — out-of-bounds cannot be judged",
      ),
    );
  } else if (changed.length === 0) {
    warn(
      msg(
        "⑫ 跳过：改动集为空（工作区与暂存区都无改动）—— 没有可判的越界（这不等于「查过了」）",
        "⑫ skipped: the change set is empty (nothing changed in the worktree or the index) — there is no out-of-bounds change to judge (this does not mean it was checked)",
      ),
    );
  } else if (ownerRows.length === 0) {
    warn(
      msg(
        `⑫ 跳过：PROJECT.md §3 解析不到**有效**归属条目（未配置 / 全是 \`<...>\` 占位符 / ` +
          `表头缺「可写路径」列）—— 无法判定 ${changed.length} 个改动文件归谁`,
        `⑫ skipped: no **valid** owner entry could be parsed from PROJECT.md §3 (unconfigured / all \`<...>\` ` +
          `placeholders / the header lacks a write-paths column) — cannot judge which role owns the ` +
          `${changed.length} changed file(s)`,
      ),
    );
  } else {
    const picked = candidatePackageIds(changed);
    const journal = picked.error ? null : readJournalLines(picked.id);
    const step = journal === null ? null : lastStep(journal);
    if (picked.error) {
      warn(msg(`⑫ 跳过：${picked.error}`, `⑫ skipped: ${picked.error}`));
    } else if (journal === null) {
      warn(
        msg(
          `⑫ 跳过：找不到 ${cfg.prdDir}/${picked.id}.journal.jsonl —— 没有 journal 就没有「当前环节」可对`,
          `⑫ skipped: cannot find ${cfg.prdDir}/${picked.id}.journal.jsonl — without a journal there is no current step to compare against`,
        ),
      );
    } else if (step === null) {
      warn(
        msg(
          `⑫ 跳过：${cfg.prdDir}/${picked.id}.journal.jsonl 里没有任何带 step / actor 的记录 —— 判不了当前环节`,
          `⑫ skipped: ${cfg.prdDir}/${picked.id}.journal.jsonl has no record with a step / actor — the current step cannot be determined`,
        ),
      );
    } else if (step.key === "") {
      // 环节名归一后为空（如 step 写成「（人）」这类纯标注）⇒ 拿空串去比会"见谁咬谁"，
      // 全是假红。判不了就不判。
      warn(
        msg(
          `⑫ 跳过：journal 末条环节「${step.label}」归一后为空 —— 认不出是哪个角色/环节`,
          `⑫ skipped: the journal's last step "${step.label}" normalizes to empty — cannot tell which role/step it is`,
        ),
      );
    } else {
      const violations = [];
      const noOwner = [];
      let consistent = 0;
      let covered = 0;
      let exempt = 0;
      for (const f of changed) {
        // 流程目录（`docs/process/**`）整棵树先豁免掉 —— 它是流程自己的载体，不是交付物
        // （"恒红"推理见 isProcessBookkeeping 的注释）。既不算越界、也不算「无法判定」；
        // 这是「这一条不判」，不是「整轮没跑」—— 其余判据照判。
        if (isProcessBookkeeping(f)) {
          exempt += 1;
          continue;
        }
        const hits = ownerRows.filter((r) => r.globs.some((g) => globToRegExp(g).test(f)));
        // 属主表里找不到类别 ⇒ 不判（不猜）：它可能只是没登记进 §3，不等于越界。
        if (hits.length === 0) {
          noOwner.push(f);
          continue;
        }
        const roles = [...new Set(hits.flatMap((r) => r.roles))];
        if (roles.some((r) => sameRole(step.key, r))) {
          consistent += 1;
          continue;
        }
        if (approveCovers(journal, f)) {
          covered += 1;
          continue;
        }
        violations.push({ path: f, roles });
      }
      for (const f of noOwner) {
        warn(
          msg(
            `⑫ 无法判定 ${f} 的归属（§3 属主表里没有匹配的类别）—— 按 fail-open 不判`,
            `⑫ cannot determine who owns ${f} (no matching category in the §3 owner table) — not judged, per fail-open`,
          ),
        );
      }
      for (const v of violations) {
        const isTest =
          cfg.testSuffixes.some((s) => v.path.endsWith(s)) ||
          cfg.scanDirs.some((d) => v.path.startsWith(`${d.replace(/\/+$/, "")}/`)) ||
          v.roles.some((r) => r === "test" || r.startsWith("test-"));
        if (isTest && sameRole(step.key, "dev")) {
          err(
            msg(
              `⑫a ${v.path} 是测试文件（§3 归属 ${v.roles.join(" / ")}），但 ${picked.id} 的 journal ` +
                `末条环节是「${step.label}」且无 approve 覆盖 —— dev 环节不得改测试` +
                `（裁定后请在 journal 里 approve 并点名该文件）`,
              `⑫a ${v.path} is a test file (§3 owner ${v.roles.join(" / ")}), but the last step recorded in ` +
                `${picked.id}'s journal is "${step.label}" and no approve covers it — dev must not change tests ` +
                `(after the ruling, add an approve to the journal naming that file)`,
            ),
          );
        } else {
          err(
            msg(
              `⑫ ${v.path} 归属 ${v.roles.join(" / ")}，与 ${picked.id} 的 journal 末条环节「${step.label}」` +
                `不一致，且无 approve 覆盖 —— 越界或环节记录缺失，请在 Gate 的 ❓ 栏裁定`,
              `⑫ ${v.path} is owned by ${v.roles.join(" / ")}, which does not match the last step ` +
                `"${step.label}" recorded in ${picked.id}'s journal, and no approve covers it — ` +
                `an out-of-bounds change or a missing step record; rule on it in the Gate's ❓ section`,
            ),
          );
        }
      }
      ok(
        msg(
          `⑫ 越界事后判定（包 ${picked.id} / 环节 ${step.label}）：改动 ${changed.length} 个 · ` +
            `流程簿记豁免 ${exempt} · 归属一致 ${consistent} · approve 覆盖 ${covered} · ` +
            `越界 ${violations.length} · 无法判定 ${noOwner.length}`,
          `⑫ role boundary post-hoc check (package ${picked.id} / step ${step.label}): ` +
            `${changed.length} changed · ${exempt} process bookkeeping exempt · ` +
            `${consistent} owner-consistent · ${covered} approve-covered · ` +
            `${violations.length} out-of-bounds · ${noOwner.length} undeterminable`,
        ),
      );
    }
  }
}

// ── 输出 ──
console.log(
  msg(
    `\ncheck-rules：${oks.length} ✓ / ${errors.length} ❌` +
      (warns.length ? `（另有 ⚠ 可见提示 ${warns.length} 条，不计 ❌）` : "") +
      "\n",
    `\ncheck-rules: ${oks.length} ✓ / ${errors.length} ❌` +
      (warns.length ? ` (plus ${warns.length} visible ⚠ notice(s), not counted as ❌)` : "") +
      "\n",
  ),
);
errors.forEach((e) => console.log(e));
warns.forEach((w) => console.log(w));
// 通过明细：一条 ✓ 说清「哪条判据、看到了什么」。只报计数不报明细时，
// 「N ✓」既不可抽查也无法与 journal 记录对账 —— 与「空转不打绿」同一条纪律。
if (oks.length > 0) {
  console.log(msg(`\n通过明细（${oks.length} 条）：`, `\nPassed checks (${oks.length}):`));
  oks.forEach((o) => console.log(`  ${o}`));
  console.log("");
}
if (errors.length) process.exit(1);
