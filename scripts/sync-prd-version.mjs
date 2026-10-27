#!/usr/bin/env node
/**
 * 一键同步 `prdVersion`（零依赖，直接 `node` 运行）。
 *
 * 用途：把"当前生效版本"的五个声明位改成同一个值。手工同步必然漏（真实教训：改了 PRD 却漏了
 *       rules 与测试头，台账门禁随后报不一致）。改动范围**严格限定声明位**，绝不碰历史叙述。
 *
 * 声明位：
 *   - `docs/process/prd/<ID>.md`          —— 仅 frontmatter 的 `prdVersion:` 字段行
 *   - `docs/process/prd/<ID>-design.md`   —— 同上（与 PRD 同源，常被漏改）
 *   - `docs/process/prd/<ID>-arch.md`     —— 同上（架构设计与取舍，有则同步）
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
import { CONFIG_KEYS, SECTION, configValue, parseList, readSection } from "./project-config.mjs";
import { detectLangFromRepo, makeMsg, resolveLang } from "./i18n.mjs";

const PROJECT_REL = "docs/process/PROJECT.md";
const SELF_DIR = dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
  testSuffixes: [".test.ts", ".test.mjs", ".test.js"],
  packageDirs: ["test/packages"],
  rulesDir: "docs/process/rules",
  prdDir: "docs/process/prd",
};

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
  console.error(`[sync-prd-version] ✗ ${message}`);
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
        `  版本同步需要它来确定测试目录与文件后缀（§4 项目配置）。\n` +
        `  请先创建 docs/process/PROJECT.md；缺失即无法定位声明位，故直接拒绝。\n` +
        `  退出码：1（配置缺失）`,
      `cannot find the process config ${PROJECT_REL} (repo root: ${root}).\n` +
        `  Version sync needs it to resolve the test dirs and file suffixes (§4 project config).\n` +
        `  Create docs/process/PROJECT.md first; without it the declaration sites cannot be located, so it refuses outright.\n` +
        `  exit code: 1 (missing config)`,
    ),
  );
}
const projectText = readFileSync(projectFile, "utf8");
const sec4 = readSection(projectText, SECTION.projectConfig);
const cfg = {
  testSuffixes: parseList(configValue(sec4, CONFIG_KEYS.testSuffixes)) ?? DEFAULTS.testSuffixes,
  packageDir: (parseList(configValue(sec4, CONFIG_KEYS.packageTestDirs)) ?? DEFAULTS.packageDirs)[0],
  rulesDir: (parseList(configValue(sec4, CONFIG_KEYS.rulesDir)) ?? [DEFAULTS.rulesDir])[0],
  prdDir: (parseList(configValue(sec4, CONFIG_KEYS.prdDir)) ?? [DEFAULTS.prdDir])[0],
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
      msg(
        "用法：node scripts/process/sync-prd-version.mjs <ID> [--to N] [--check] [--header-only]",
        "Usage: node scripts/process/sync-prd-version.mjs <ID> [--to N] [--check] [--header-only]",
      ),
    );
  }
  const id = args[0];
  const check = args.includes("--check");
  const scope = args.includes("--header-only") ? "header" : "all";
  const toIdx = args.indexOf("--to");
  const target = toIdx >= 0 ? args[toIdx + 1] : undefined;
  if (toIdx >= 0 && !/^\d+$/.test(target ?? "")) fail(msg("--to 需要一个整数", "--to needs an integer"));

  const prdRel = join(cfg.prdDir, `${id}.md`);
  const prdPath = join(root, prdRel);
  const rulesRel = join(cfg.rulesDir, `${id}.yaml`);
  const rulesPath = join(root, rulesRel);
  const designRel = join(cfg.prdDir, `${id}-design.md`);
  const designPath = join(root, designRel);
  const archRel = join(cfg.prdDir, `${id}-arch.md`);
  const archPath = join(root, archRel);
  const testDir = join(root, cfg.packageDir, id);

  const prd = readIfExists(prdPath);
  if (prd === null) fail(msg(`找不到 PRD：${prdRel}`, `cannot find the PRD: ${prdRel}`));
  const prdBefore = matchFieldVersion(prd);
  if (prdBefore === null) {
    fail(
      msg(
        `PRD frontmatter 里没有 prdVersion 字段行：${prdRel}`,
        `no prdVersion field line in the PRD frontmatter: ${prdRel}`,
      ),
    );
  }

  const want = target ?? prdBefore;
  const sites = [];
  /** 「产物存在、但没有 prdVersion 字段行」= 不一致（不是跳过）。实测踩过：从件缺字段被当跳过，CI 抓不到。 */
  const missingField = [];

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
      console.warn(
        msg(
          `  ✗ ${rulesRel} 里没有 prdVersion 字段行 —— 判**不一致**（不判跳过），文末汇总`,
          `  ✗ no prdVersion field line in ${rulesRel} — judged **inconsistent** (not skipped); summarised at the end`,
        ),
      );
      missingField.push({ label: msg("rules 台账", "rules ledger"), path: rulesPath });
    } else if (before !== want) {
      rulesAfter = replaceFieldVersion(rules, want);
      sites.push({ path: rulesPath, label: msg("rules 台账", "rules ledger"), before });
    }
  } else {
    console.warn(msg(`  ⚠ 找不到 rules 台账：${rulesRel}，跳过`, `  ⚠ no rules ledger found: ${rulesRel}, skipped`));
  }

  // 3) 设计与说明（与 PRD 同源，常被漏改）
  let designAfter = null;
  const design = readIfExists(designPath);
  if (design !== null) {
    const before = matchFieldVersion(design);
    if (before === null) {
      console.warn(
        msg(
          `  ✗ ${designRel} 里没有 prdVersion 字段行 —— 判**不一致**（不判跳过），文末汇总`,
          `  ✗ no prdVersion field line in ${designRel} — judged **inconsistent** (not skipped); summarised at the end`,
        ),
      );
      missingField.push({ label: msg("设计与说明", "design notes"), path: designPath });
    } else if (before !== want) {
      designAfter = replaceFieldVersion(design, want);
      sites.push({ path: designPath, label: msg("设计与说明", "design notes"), before });
    }
  }

  // 4) 架构设计与取舍（有则同步；与 PRD 同源，缺字段同样判不一致）
  let archAfter = null;
  const arch = readIfExists(archPath);
  if (arch !== null) {
    const before = matchFieldVersion(arch);
    if (before === null) {
      console.warn(
        msg(
          `  ✗ ${archRel} 里没有 prdVersion 字段行 —— 判**不一致**（不判跳过），文末汇总`,
          `  ✗ no prdVersion field line in ${archRel} — judged **inconsistent** (not skipped); summarised at the end`,
        ),
      );
      missingField.push({ label: msg("架构设计与取舍", "architecture design & trade-offs"), path: archPath });
    } else if (before !== want) {
      archAfter = replaceFieldVersion(arch, want);
      sites.push({ path: archPath, label: msg("架构设计与取舍", "architecture design & trade-offs"), before });
    }
  }

  // 5) 测试文件里的 @prdVersion
  const testFiles = existsSync(testDir)
    ? readdirSync(testDir)
        .filter((f) => cfg.testSuffixes.some((s) => f.endsWith(s)))
        .map((f) => join(testDir, f))
    : [];
  if (testFiles.length === 0) {
    console.warn(
      msg(
        `  ⚠ 测试目录为空或不存在：${relative(root, testDir)}`,
        `  ⚠ test dir is empty or missing: ${relative(root, testDir)}`,
      ),
    );
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
    if (stale.length > 0) {
      staleInlineReport.push(
        msg(`${rel}（用例内 ${stale.join("/")}）`, `${rel} (inside cases: ${stale.join("/")})`),
      );
    }
    if (!headerNeeds && stale.length === 0) continue;

    const parts = [];
    if (headerNeeds) parts.push(msg(`头 ${before}→${want}`, `header ${before}→${want}`));
    if (stale.length > 0) {
      parts.push(
        scope === "all"
          ? msg(`用例内 ${stale.join("/")}→${want}`, `inside cases ${stale.join("/")}→${want}`)
          : msg(`用例内 ${stale.join("/")}=未动`, `inside cases ${stale.join("/")}=untouched`),
      );
    }
    const replaced = replaceVersions(text, want, scope);
    if (replaced !== text) {
      testAfter.set(p, replaced);
      sites.push({
        path: p,
        label: msg(
          `测试 ${rel}（${parts.join("；")}）`,
          `tests ${rel} (${parts.join("; ")})`,
        ),
        before,
      });
    }
  }

  if (missingHeader.length > 0) {
    console.warn(
      msg(
        `  ⚠ ${missingHeader.length} 个测试文件没有文件级 @prdVersion 头（本脚本不静默注入，请手工补）：`,
        `  ⚠ ${missingHeader.length} test file(s) have no file-level @prdVersion header (this script does not inject it silently; add it by hand):`,
      ),
    );
    for (const p of missingHeader) console.warn(`      ${p}`);
  }
  if (staleInlineReport.length > 0 && scope === "header") {
    console.warn(
      msg(
        `  ⚠ ${staleInlineReport.length} 个文件的**用例内** @prdVersion 仍是旧值（--header-only 未处理，也不影响门禁）：`,
        `  ⚠ ${staleInlineReport.length} file(s) still carry the old **in-case** @prdVersion (--header-only left them, and they do not affect the gates):`,
      ),
    );
    for (const p of staleInlineReport) console.warn(`      ${p}`);
  }

  if (missingField.length > 0) {
    console.warn(
      msg(
        `  ✗ ${missingField.length} 处产物**存在但没有 prdVersion 字段行**（判不一致，不判跳过）：`,
        `  ✗ ${missingField.length} artifact(s) **exist but have no prdVersion field line** (judged inconsistent, not skipped):`,
      ),
    );
    for (const s2 of missingField) {
      console.warn(msg(`      ${s2.label}：${relative(root, s2.path)}`, `      ${s2.label}: ${relative(root, s2.path)}`));
    }
    console.warn(
      msg(
        "      本脚本不静默注入字段行，请手工补上（PRD 本体缺字段一直就是判红的）",
        "      This script does not inject field lines silently; add them by hand (a missing field in the PRD itself has always been red)",
      ),
    );
  }
  if (sites.length === 0) {
    if (missingHeader.length > 0 || missingField.length > 0) process.exitCode = 1;
    console.log(
      missingField.length > 0
        ? msg(
            `✗ ${id} 的 prdVersion 声明位不齐：${missingField.length} 处缺字段行（= ${want}）`,
            `✗ prdVersion declaration sites for ${id} are incomplete: ${missingField.length} place(s) missing the field line (= ${want})`,
          )
        : msg(
            `✓ ${id} 的文件级头已全部一致（= ${want}）`,
            `✓ all file-level headers for ${id} already agree (= ${want})`,
          ),
    );
    return;
  }

  console.log(
    msg(
      `${check ? "【检查模式，不写入】" : ""}目标版本：${want}`,
      `${check ? "[check mode, nothing written] " : ""}target version: ${want}`,
    ),
  );
  for (const s of sites) {
    console.log(
      msg(
        `  ${check ? "✗ 不一致" : "→ 同步"}：${s.label}`,
        `  ${check ? "✗ inconsistent" : "→ syncing"}: ${s.label}`,
      ),
    );
  }

  if (check) {
    console.log(msg(`\n✗ 共 ${sites.length} 处需要同步到 ${want}。`, `\n✗ ${sites.length} place(s) need syncing to ${want}.`));
    process.exit(1);
  }

  if (prdAfter !== prd) writeFileSync(prdPath, prdAfter);
  if (rulesAfter !== null) writeFileSync(rulesPath, rulesAfter);
  if (designAfter !== null) writeFileSync(designPath, designAfter);
  if (archAfter !== null) writeFileSync(archPath, archAfter);
  for (const [p, text] of testAfter) writeFileSync(p, text);

  console.log(
    msg(
      `\n${missingField.length > 0 ? "⚠" : "✓"} 已同步 ${sites.length} 处声明位。`,
      `\n${missingField.length > 0 ? "⚠" : "✓"} synced ${sites.length} declaration site(s).`,
    ),
  );
  if (missingField.length > 0) process.exitCode = 1;
  console.log(
    msg(
      "  下一步：node scripts/process/check-rules.mjs 应显示 ⑥ 全绿。",
      "  next: node scripts/process/check-rules.mjs should show ⑥ all green.",
    ),
  );

  // 顺手跑一次 rules 校验，把"改完是否自洽"当场暴露出来
  try {
    const out = execFileSync(process.execPath, [join(SELF_DIR, "check-rules.mjs")], {
      cwd: root,
      encoding: "utf-8",
    });
    // 摘要行前缀是 `check-rules：`（zh）/ `check-rules:`（en）—— 两种冒号都认，
    // 否则英文仓库里这一段会静默变成空行（docs/I18N.md §3「锚点两种语言都认」）。
    const summary = out.split("\n").find((l) => /check-rules[:：]/.test(l)) ?? "";
    const bad = out.split("\n").filter((l) => l.trim().startsWith("❌"));
    console.log(`\n${summary.trim()}`);
    for (const l of bad) console.log(l);
  } catch {
    console.warn(
      msg(
        "\n⚠ check-rules 未能执行或返回非零，请手工复核",
        "\n⚠ check-rules could not run or returned non-zero; review by hand",
      ),
    );
  }
}

main();
