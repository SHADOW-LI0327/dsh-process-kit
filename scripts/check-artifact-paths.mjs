#!/usr/bin/env node
/**
 * 过程产物落点门禁（零依赖，直接 `node` 运行）。
 *
 * 用途：规范只写了「该去哪」，没有任何门禁回答「有没有写错地方」⇒ 各角色自行发明路径。
 *       本门禁把「唯一合法写入根」从"理论上不该写"变成"跑一遍就知道"。
 *
 * 判定对象（三种模式，默认第一种）：
 *   · 默认：**未被 gitignore 的未跟踪文件**（`git ls-files --others --exclude-standard`）——
 *     这正是"会进下一次提交"的那一批。**但它有盲区**：`git add` 之后文件就不再是「未跟踪」，
 *     本模式会看不见它；产物一旦入库，更是永远看不见（"空放行"）。
 *   · `--staged`：**暂存区里新增的文件**（`git diff --cached --diff-filter=A`）—— 补上 `git add` 的盲区。
 *   · `--committed[=<rev>]`：**某个已入库提交新增的文件**（默认 `HEAD`，`git show --diff-filter=A`）——
 *     用于事后审计"这次交付提交有没有把产物放到越界位置"。
 *   后两种只取**新增**（A）不看修改：改 `README.md` / `package.json` 这类非产物文件是正常操作，
 *   判它不是本门禁的职责。
 *
 * 放行来源（"登记即放行"）：
 *   ① PROJECT.md「## 3. 产物属主表」的**可写路径**列（支持 `**` 通配）；
 *   ② 登记区（默认 `docs/process/tools/README.md` 的 `## 登记区` 小节）里以反引号
 *      **登记过的**仓库相对路径 —— 过程件与登记表同在载体侧，主流程文档只留规则。
 *
 * 用法：
 *   node scripts/process/check-artifact-paths.mjs [--staged | --committed[=<rev>]]
 *
 * 退出码：
 *   0 = 无越界落点；或**空转**（受检 0 个 —— 此时明确报 ⚠ 且**不打绿**，因为"没对象可判"不是"判过且过"）
 *   1 = 存在越界落点，或配置缺失（PROJECT.md 不存在 / §3 可写路径解析不到 / 非 git 仓库）
 *
 * 配置依赖（docs/process/PROJECT.md）：
 *   - 必需：「## 3. 产物属主表」表格，表头须含「可写路径」列；行内路径用反引号包裹，
 *           多个用 `、`/`,`/空格分隔；`**` 表示跨目录通配，`dir/` 表示目录下全部。
 *   - 可选：「## 4. 项目配置」里的 `登记区文件`（表格行 `| 登记区文件 | \`路径\` |` 或
 *           `登记区文件：路径`；默认 `docs/process/tools/README.md`）。
 *   解析不到**有效**可写路径时**报错退出 1，不静默放行**。
 *
 * 占位符纪律：§3 可写路径与登记区里含 `<` / `>` 的条目一律视为**未配置**（模板没被替换），
 * 直接丢弃并在输出里报告忽略条数；``` 代码块内部的示例行不参与解析。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  configValue,
  globToRegExp,
  isNumberedSection,
  isPlaceholder,
  parseTable,
  pathsInCell,
  readSection,
  scalarValue,
  stripFencedBlocks,
} from "./project-config.mjs";

const PROJECT_REL = "docs/process/PROJECT.md";
const DEFAULT_REGISTRY = "docs/process/tools/README.md";
/** 登记区标题：载体侧说明（随载体同目录，不进 git）里的登记表。 */
const REGISTRY_HEADING = "## 登记区";

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
  process.stderr.write(`[check-artifact-paths] 失败：${msg}\n`);
  process.exit(1);
}

/**
 * 临时件：由工具产生、核对完即删，**不是产物**，不参与落点判定。
 * 目前只有 `process_init(upgrade: true)` 的旧版备份 `<文件>.bak-<时间戳>` ——
 * 它和被覆盖的文件同目录，不认识它就会把升级本身判成越界（自伤）。
 *
 * 框架元数据：`docs/process/.process-kit.json` 是卸载清单，不是角色产物；
 * 不显式跳过的话，`process_init` 一落地就会被自己的门禁判越界。
 */
const TRANSIENT_RE = /\.bak-\d{8,}$/;
/** 框架卸载清单：是插件的元数据，不是过程产物；旧版门禁会把它判越界，所以显式跳过。 */
const FRAMEWORK_META_RE = /^docs\/process\/\.process-kit\.json$/;

/**
 * 跑一条 git 列举命令并切成路径数组。
 *
 * **必须用 `-z`**：git 默认 `core.quotePath=true`，会把非 ASCII 路径按八进制转义并加引号输出，
 * 于是 `FEAT-01-需求核对件.md` 变成 `"FEAT-01-\351\234\200\346\261\202..."` ——
 * 那串文本匹配不上任何通配，**所有中文命名的产物都会被误判越界**。
 * `-z` 以 NUL 分隔且不转义，顺带也解决了路径含空格 / 换行的情况。
 */
function gitZ(root, sub, args, what) {
  try {
    const out = execFileSync("git", [sub, "-z", ...args], { cwd: root, encoding: "utf8" });
    return out.split("\0").filter((l) => l !== "");
  } catch (err) {
    fail(
      `无法枚举${what}（${err.message}）。本脚本依赖 git，请确认仓库根存在 .git ` +
        `或在 git 仓库内运行。`,
    );
  }
}

/** 三种判定模式：默认未跟踪 / 暂存区新增 / 已入库提交新增。 */
const MODES = {
  untracked: {
    label: "未跟踪未忽略",
    list: (root) => gitZ(root, "ls-files", ["--others", "--exclude-standard"], "未跟踪文件"),
    emptyHint:
      "没有任何未跟踪文件可判（产物可能已全部入库，或已被 git add）⇒ " +
      "判暂存区用 `--staged`，事后审计已入库的提交用 `--committed[=<rev>]`",
  },
  staged: {
    label: "暂存区新增",
    list: (root) => gitZ(root, "diff", ["--cached", "--name-only", "--diff-filter=A"], "暂存区新增文件"),
    emptyHint: "暂存区里没有新增文件（只判新增，改已入库文件不在本门禁职责内）",
  },
  committed: {
    label: "已入库提交新增",
    list: (root, rev) =>
      gitZ(root, "show", ["--name-only", "--diff-filter=A", "--format=", rev], `提交 ${rev} 的新增文件`),
    // 合并提交 `git show` 默认不展开（列不出文件）—— 空转的原因必须写清，
    // 否则会被误读成「这个提交没有新增文件」。
    emptyHint: (root, rev) =>
      hasSecondParent(root, rev)
        ? `该提交是**合并提交**（\`git show\` 默认不展开合并的文件列表）⇒ 要看合并带入的新增，` +
          `请对具体分支提交单独审计（\`--committed=<rev>\`）`
        : "该提交没有新增文件（只判新增，改已入库文件不在本门禁职责内）",
  },
};

/** 该提交是不是合并提交（有第二个父提交）。`rev-parse` 不认 `-z`，故不走 gitZ。 */
function hasSecondParent(root, rev) {
  try {
    execFileSync("git", ["rev-parse", "-q", "--verify", `${rev}^2`], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** 解析命令行：`--staged` / `--committed[=<rev>]`，未给则默认模式。 */
function resolveMode() {
  const argv = process.argv.slice(2);
  if (argv.includes("--staged")) return { name: "staged" };
  const committed = argv.find((a) => a === "--committed" || a.startsWith("--committed="));
  if (committed) {
    const rev = committed.includes("=") ? committed.slice(committed.indexOf("=") + 1) : "HEAD";
    if (rev === "") fail("--committed= 需要一个版本号（如 --committed=HEAD~1 或 --committed=abc1234）");
    return { name: "committed", rev };
  }
  const unknown = argv.filter((a) => a !== "--committed");
  if (unknown.length > 0) {
    fail(`不认识的参数：${unknown.join(" ")}。可用：--staged / --committed[=<rev>]（不带参数 = 未跟踪未忽略）`);
  }
  return { name: "untracked" };
}

/** 从 PROJECT.md 解析「可写路径」列。 */
function loadAllowGlobs(projectText) {
  const sec = readSection(
    projectText,
    (level, title) =>
      level === 2 && (isNumberedSection(3, title) || title.includes("产物属主")),
  );
  if (!sec) {
    fail(
      `在 ${PROJECT_REL} 里找不到「## 3. 产物属主表」小节。\n` +
        `  期望形如：\n` +
        `    ## 3. 产物属主表\n` +
        `    | 角色 | 可写路径 | 禁止 |\n` +
        `    | ---- | -------- | ---- |\n` +
        `    | pm   | \`docs/process/prd/**\` | \`src/**\` |\n` +
        `  退出码：1（配置缺失，不放行任何路径）`,
    );
  }
  const rows = parseTable(sec.body);
  const header = rows.find((r) => r.some((c) => c.includes("可写路径")));
  if (!header) {
    fail(
      `「${sec.title}」表格里找不到含「可写路径」的表头列。\n` +
        `  请把表头写成：| 角色 | 可写路径 | 禁止 |\n  退出码：1（配置缺失，不放行）`,
    );
  }
  const col = header.findIndex((c) => c.includes("可写路径"));
  const globs = [];
  const seen = new Set();
  const ignored = [];
  for (const row of rows) {
    if (row === header || row.length <= col) continue;
    for (const p of pathsInCell(row[col] ?? "")) {
      // 含 `<`/`>` 的条目 = 模板占位符，一律按「未配置」丢弃，绝不当作放行规则。
      if (isPlaceholder(p)) {
        ignored.push(p);
        continue;
      }
      if (seen.has(p)) continue;
      seen.add(p);
      globs.push(p);
    }
  }
  if (globs.length === 0) {
    fail(
      `已找到「${sec.title}」表格，但「可写路径」列里没有任何**有效**条目。\n` +
        `  PROJECT.md §3 未填：所有条目都是占位符或被解析为空，请填入真实可写路径。\n` +
        (ignored.length > 0 ? `  （已忽略 ${ignored.length} 条占位符条目）\n` : "") +
        `  请用反引号标注路径，多个用、分隔，例如：\n` +
        `    | pm | \`docs/process/prd/**\`、\`docs/process/contracts/**\` | \`src/**\` |\n` +
        `  退出码：1（配置缺失，不放行任何路径）`,
    );
  }
  return { globs, ignored };
}

/**
 * 登记区里以反引号登记的仓库相对路径。
 * 只取该节正文 —— 不取全文，免得别处**顺带提到**的路径也算作登记（那会放宽门禁）。
 */
function registeredPaths(root, registryRel) {
  const file = join(root, registryRel);
  if (!existsSync(file)) return { file, set: new Set(), ignored: 0 };
  const text = readFileSync(file, "utf8");
  const start = text.indexOf(REGISTRY_HEADING);
  if (start === -1) return { file, set: new Set(), ignored: 0 };
  const rest = text.slice(start + REGISTRY_HEADING.length);
  const next = rest.search(/\n## /);
  // 代码块里的登记示例只是教学，不构成登记；含 `<`/`>` 的占位条目同样不算。
  const section = stripFencedBlocks(rest.slice(0, next === -1 ? rest.length : next));
  const set = new Set();
  let ignored = 0;
  for (const m of section.matchAll(/`([^`\s]+)`/g)) {
    const v = m[1].replace(/^\.\//, "").replace(/^\/+/, "");
    if (!v.includes("/") || /^https?:/.test(v)) continue;
    if (isPlaceholder(v)) {
      ignored += 1;
      continue;
    }
    set.add(v);
  }
  return { file, set, ignored };
}

function main() {
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
        `  落点门禁的「允许写入路径表」来自该文件 §3，缺配置即无法判定，故直接拒绝。\n` +
        `  请先创建工作区文档 docs/process/PROJECT.md 并补齐 §3 产物属主表。\n` +
        `  退出码：1（配置缺失，不放行任何路径）`,
    );
  }
  const projectText = readFileSync(projectFile, "utf8");
  const allow = loadAllowGlobs(projectText);
  const allowGlobs = allow.globs.map(globToRegExp);

  const sec4 = readSection(
    projectText,
    (level, title) => level === 2 && isNumberedSection(4, title),
  );
  let registryRel = DEFAULT_REGISTRY;
  if (sec4) {
    const v =
      configValue(sec4, "登记区文件") ??
      (sec4.body.match(/登记区文件\s*[:：]\s*`?([^\s`]+)`?/) ?? [])[1] ??
      null;
    registryRel = scalarValue(v) ?? DEFAULT_REGISTRY;
  }

  const registry = registeredPaths(root, registryRel);
  const registeredGlobs = [...registry.set].map(globToRegExp);
  const mode = resolveMode();
  const candidates = MODES[mode.name].list(root, mode.rev);
  const transient = candidates.filter((p) => TRANSIENT_RE.test(p));
  const frameworkMeta = candidates.filter((p) => FRAMEWORK_META_RE.test(p));
  const files = candidates.filter((p) => !TRANSIENT_RE.test(p) && !FRAMEWORK_META_RE.test(p));

  /** 命中任一可写路径或登记项即放行；否则给出正确去处提示。 */
  const violations = [];
  let ok = 0;
  for (const f of files) {
    if (allowGlobs.some((re) => re.test(f)) || registeredGlobs.some((re) => re.test(f))) {
      ok += 1;
      continue;
    }
    violations.push({
      path: f,
      hint:
        `未落在 PROJECT.md §3「可写路径」允许的根内，也未在登记区登记。` +
        `请改放到已授权目录，或先在 ${registryRel} 的「${REGISTRY_HEADING}」小节以反引号登记该路径`,
    });
  }

  const modeLabel = MODES[mode.name].label + (mode.rev !== undefined ? ` ${mode.rev}` : "");
  process.stdout.write(`落点门禁（${modeLabel}）：受检 ${files.length} 个（放行 ${ok}）\n`);
  process.stdout.write(`  放行来源：PROJECT.md §3 可写路径 ${allowGlobs.length} 条\n`);
  process.stdout.write(`  放行来源：登记区 ${registry.set.size} 条（${registryRel}）\n`);
  if (allow.ignored.length > 0) {
    process.stdout.write(
      `  ⚠ 已忽略 §3 占位符条目 ${allow.ignored.length} 条（含 \`<...>\`，视为未配置）：若是模板没替换，请换成真实路径；若是 \`<ID>\` 这类变量写法，请改用 \`*\` 通配或走登记区逐件登记\n`,
    );
  }
  if (transient.length > 0) {
    process.stdout.write(
      `  ⚠ 已排除临时件 ${transient.length} 个（\`*.bak-*\` 升级备份，不判落点）：核对无误后请删除\n`,
    );
  }
  if (frameworkMeta.length > 0) {
    process.stdout.write(`  · 已跳过框架元数据 ${frameworkMeta.length} 个（\`docs/process/.process-kit.json\`，不判落点）\n`);
  }
  if (registry.ignored > 0) {
    process.stdout.write(
      `  ⚠ 已忽略登记区占位符条目 ${registry.ignored} 条（含 \`<...>\`，登记不生效）\n`,
    );
  }
  if (!existsSync(registry.file)) {
    process.stdout.write(`  ⚠ 登记区不存在（${registryRel}）⇒ 未在 §3 内的新文件一律判 ❌\n`);
  }

  if (files.length === 0) {
    const hint =
      typeof MODES[mode.name].emptyHint === "function"
        ? MODES[mode.name].emptyHint(root, mode.rev)
        : MODES[mode.name].emptyHint;
    // **空转不打绿**：一条都没判过，就不能输出"无越界落点"这个结论（否则是拿无色当绿色）。
    process.stdout.write(
      `⚠ 空转：本次没有可判对象（${modeLabel}，受检 0 个）—— 这不是绿。\n` +
        `  ${hint}\n`,
    );
    process.exit(0);
  }
  if (violations.length === 0) {
    process.stdout.write("✓ 无越界落点\n");
    process.exit(0);
  }
  process.stdout.write(`❌ 越界 ${violations.length} 个：\n`);
  for (const v of violations) process.stdout.write(`   ${v.path}\n      → ${v.hint}\n`);
  process.exit(1);
}

main();
