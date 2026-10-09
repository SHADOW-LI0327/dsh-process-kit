#!/usr/bin/env node
/**
 * 过程产物落点门禁（零依赖，直接 `node` 运行）。
 *
 * 用途：规范只写了「该去哪」，没有任何门禁回答「有没有写错地方」⇒ 各角色自行发明路径。
 *       本门禁把「唯一合法写入根」从"理论上不该写"变成"跑一遍就知道"。
 *
 * 判定对象：**未被 gitignore 的未跟踪文件**（`git ls-files --others --exclude-standard`）——
 *          这正是"会进下一次提交"的那一批，也是唯一真正会污染审核面的集合。
 *
 * 放行来源（"登记即放行"）：
 *   ① PROJECT.md「## 3. 产物属主表」的**可写路径**列（支持 `**` 通配）；
 *   ② 登记区（默认 `docs/process/tools/README.md` 的 `## 登记区` 小节）里以反引号
 *      **登记过的**仓库相对路径 —— 过程件与登记表同在载体侧，主流程文档只留规则。
 *
 * 用法：
 *   node scripts/process/check-artifact-paths.mjs
 *
 * 退出码：
 *   0 = 无越界落点
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
  isNumberedSection,
  isPlaceholder,
  parseTable,
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

/** 从一个单元格里抽出路径候选：优先反引号，其次按分隔符切分；占位符不返回。 */
function pathsInCell(cell) {
  const out = [];
  for (const m of cell.matchAll(/`([^`]+)`/g)) out.push(m[1].trim());
  if (out.length === 0) {
    for (const part of cell.split(/[、,，;；\s<>br]+/)) {
      const v = part.replace(/[（(].*?[)）]/g, "").trim();
      if (v) out.push(v);
    }
  }
  return out.filter((v) => v && !["—", "-", "/", "无", "N/A"].includes(v));
}

/** 把路径通配（支持 `**`）编译为正则。 */
function globToRegExp(glob) {
  let g = glob.trim().replace(/^\.\//, "").replace(/^\/+/, "");
  if (g.endsWith("/")) g += "**";
  const hasWildcard = /[*?]/.test(g);
  let re = "";
  for (let i = 0; i < g.length; i += 1) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        i += 1;
        if (g[i + 1] === "/") i += 1;
        re += ".*"; // `**` 跨目录，可匹配空
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  // 无通配的字面量同时视为目录前缀：`reports` 放行 `reports/子路径`
  return new RegExp(hasWildcard ? `^${re}$` : `^${re}(?:/.*)?$`);
}

/** 会进提交的未跟踪文件（已排除 gitignore 覆盖项）。 */
function untrackedNotIgnored(root) {
  try {
    // **必须用 `-z`**：git 默认 `core.quotePath=true`，会把非 ASCII 路径按八进制转义并加引号输出，
    // 于是 `FEAT-01-需求核对件.md` 变成 `"FEAT-01-\351\234\200\346\261\202..."` ——
    // 那串文本匹配不上任何通配，**所有中文命名的产物都会被误判越界**。
    // `-z` 以 NUL 分隔且不转义，顺带也解决了路径含空格 / 换行的情况。
    const out = execFileSync("git", ["ls-files", "-z", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    });
    return out.split("\0").filter((l) => l !== "");
  } catch (err) {
    fail(
      `无法枚举未跟踪文件（${err.message}）。本脚本依赖 git，请确认仓库根存在 .git ` +
        `或在 git 仓库内运行。`,
    );
  }
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
  const files = untrackedNotIgnored(root);

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

  process.stdout.write(`落点门禁：受检未跟踪文件 ${files.length} 个（放行 ${ok}）\n`);
  process.stdout.write(`  放行来源：PROJECT.md §3 可写路径 ${allowGlobs.length} 条\n`);
  process.stdout.write(`  放行来源：登记区 ${registry.set.size} 条（${registryRel}）\n`);
  if (allow.ignored.length > 0) {
    process.stdout.write(
      `  ⚠ 已忽略 §3 占位符条目 ${allow.ignored.length} 条（含 \`<...>\`，视为未配置）：若是模板没替换，请换成真实路径；若是 \`<ID>\` 这类变量写法，请改用 \`*\` 通配或走登记区逐件登记\n`,
    );
  }
  if (registry.ignored > 0) {
    process.stdout.write(
      `  ⚠ 已忽略登记区占位符条目 ${registry.ignored} 条（含 \`<...>\`，登记不生效）\n`,
    );
  }
  if (!existsSync(registry.file)) {
    process.stdout.write(`  ⚠ 登记区不存在（${registryRel}）⇒ 未在 §3 内的新文件一律判 ❌\n`);
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
