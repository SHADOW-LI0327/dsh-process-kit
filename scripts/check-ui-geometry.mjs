#!/usr/bin/env node
/**
 * check-ui-geometry —— UI 几何质量门禁（零依赖，直接 `node` 运行）。
 *
 * 为什么需要它：UI 评审的终局判据是「好不好看」，而那是主观的、且**需要眼睛**。
 * 但「好看」里有相当一部分其实是**系统性**而非品味 —— 重叠、过挤、没对齐、不居中、
 * 溢出画布、左右边距不对称。这些都能用包围盒算出来。
 * 本门禁就只判这一部分：主观的留给人在 Gate 上裁，客观的在这里钉死。
 *
 * 两条口径（纵深防御，不靠作者自觉）：
 *   ① **测量必须来自产物**：`geometry.json` 里的 `bounds` 只能由适配器从产物导出。
 *      缺 `source` 判 ❌（无法追溯）；缺 `adapter` 判 ⚠（可能是手写的）。
 *      **`source` 只是自述字符串，拦不住手写** —— 真正可机器验证的是 `artifact`：
 *      它必须指向一个**真实存在**的产物（不存在 ⇒ ❌）；再加 `--verify`，门禁会
 *      **重跑适配器并逐元素比 bounds**，把「测量来自产物」从声明变成验证。
 *   ② **意图由人声明**：哪些元素「应当居中」、内容区横向带在哪，属于作者意图，
 *      写在 `intent.json` 里。作者声明意图、工具测量结果，两者不得互相冒充。
 *   ③ **项目令牌必须真的用上**：`PROJECT.md` §4「UI 项目令牌」登记了项目自己的设计规范 /
 *      令牌源（CSS / HTML / 配置均可）时，⑩ 会从中**抽出色板**，再看画面主色是否都能由它
 *      推导出来（允许色板内两色按任意 α 叠加 —— 胶囊底那类写法很常见）。
 *      「必须照抄项目令牌」原本只是文档里的一句话承诺、**没有任何机器检查**；⑩ 把它变成判据。
 *      未配 ⇒ 只 ⚠ 提示（不少项目本来就没有设计规范），不判红。
 *
 *      ⚠️ **⑩ 的能力边界（别把它的绿当成"全都合规"）**：它只看**画面主色**（占比 ≥0.5%），
 *      也就是**主题层**——抓的是"用了整套别的色板"。占比更小的**小字 / 描边 / 图标用色它不管**，
 *      那一层由 **⑧ 对比度**（按渲染实测）兜。两者是**分工不是替代**：
 *      **⑩ 管「用没用你的色板」，⑧ 管「这个色看不看得清」。**
 *
 * 用法：
 *   node scripts/process/check-ui-geometry.mjs                      # 扫全部原型包
 *   node scripts/process/check-ui-geometry.mjs --id FEAT-001        # 只查一个包（缺失判 ❌）
 *   node scripts/process/check-ui-geometry.mjs --geometry <路径>     # 直接指定几何文件
 *   node scripts/process/check-ui-geometry.mjs --from-photocraft <psd> [--emit <路径>] [--intent <路径>]
 *                                                                   # 建议同时给 --emit 或 --intent：
 *                                                                   #   否则多屏包的 intent 配不上，⑤/⑥ 会空转
 *                                                                   # 从 PSD 现导几何再判定
 *   node scripts/process/check-ui-geometry.mjs --verify             # 再重导一次，逐元素比 bounds
 *
 * 降级行为（工具链是**可选**的，所以每条检查都要说清"做不了"时怎么办）：
 *   - ⑧ 对比度：拿不到适配器 / 采不到前景色 ⇒ **⚠ 跳过**，不判红（不因为没工具就把人卡死）。
 *     **但"文字与背景完全同色"不在此列** —— 那是最严重的失败（1:1），会逐像素复核后判 ❌。
 *     实测它抓到过「状态栏整块被导航栏底板盖住」：作者在图上看不出来，报告里还写了"已画状态栏"。
 *   - ⑨ 深验证：**只在显式 `--verify` 时执行**；此时适配器不可用 ⇒ **直接失败退出 1**。
 *     这是刻意的 —— 人明确要求了"验证"，做不到就必须说做不到，**静默放行等于给假保证**。
 *
 *     ⚠️ **⑨ 的能力边界（别过度信任它）**：⑨ 重跑适配器再比 bounds，证明的是「测量来自产物」，
 *       **不是**「测量像素级准确」—— 适配器对同尺寸的卡可能报同一个 bounds、实绘却差 1–2px。
 *       实测 PhotoCraft 0.5.0：`info` 报 `[246,y,1164,h]`（x1=1409），实绘边框在 1407。
 *       这类偏差 ⑨ 看不见，⑥/② 也已按「适配器偏差带」区分「测量偏差」与「设计走样」。
 *
 * 退出码：0 = 无 ❌（⚠ 不计入）；1 = 存在 ❌，或配置缺失（PROJECT.md 不存在）
 *
 * 配置依赖（docs/process/PROJECT.md §4）：
 *   - 必需：文件存在（缺失即报错退出 1）。
 *   - 可选：
 *       UI 原型目录：默认 `docs/process/prototypes`。每个包一个子目录 <目录>/<ID>/
 *       UI 几何网格：默认 8（仅用于 ⚠ 网格对齐提示）
 *       UI 文字最小间隙：默认 4（px；同列文字行盒垂直间隙低于此值判 ❌）
 *       UI 居中偏差上限：默认 1（px；声明 align 的元素居中偏差超过此值判 ❌）
 *       UI 边距对称容差：默认 1（px；内容区左右边距差超过此值判 ⚠）
 *       UI 对比度下限：默认 4.5（WCAG AA 正文；文字与背景的对比度低于此值判 ❌）
 *       UI 大字号对比度下限：默认 3.0（WCAG AA 大字号，≥24pt 适用）
 *       UI 项目令牌：默认不配（⑩ 会因未配而只提示）。项目自己的设计规范 / 令牌源路径，
 *                    多个用、分隔；配了它 ⑩ 就要求画面主色全部能由该色板推导出来。
 *
 * 为什么有对比度检查：几何门禁原本只管「位置」，但「看不清的文字等于没有文字」——
 * 那是可量化的，不该留给主观。`info` 不提供图层颜色，所以颜色**从产物像素采样**
 * （document.pixel 读合成结果，正好等于人眼看到的结果）。
 *
 * ⑧ 的已知偏差（**偏保守，宁可报出来让人看**）：它量的是**渲染后**的对比度。小字笔画窄，
 * 即使采样打到笔画中心也可能被抗锯齿冲淡，于是**报出的比值会低于用名义色值算出的比值**。
 * 这是刻意的取向 —— WCAG 的名义色值算法看不见「12px 中文糊成一团」，而人看得见。
 *
 * 占位符纪律：§4 里含 `<` / `>` 的取值一律视为**未配置**，回落内置默认值。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { configValue, isNumberedSection, parseList, readSection, scalarValue } from "./project-config.mjs";

const PROJECT_REL = "docs/process/PROJECT.md";
const GEOMETRY_FILE = "geometry.json";
const INTENT_FILE = "intent.json";

const errors = [];
const oks = [];
const warns = [];
const err = (m) => errors.push(`❌ ${m}`);
const ok = (m) => oks.push(`✓ ${m}`);
// ⚠ 通道：可见但不计 ❌（用于"检查器自身的盲区"与"主观看法的客观征兆"）
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
  process.stderr.write(`[check-ui-geometry] 失败：${msg}\n`);
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

// 适配器 bounds 对「带 1px 描边的形状」比 PNG 实绘范围约宽这么多 px（实测 PhotoCraft 0.5.0：
// 报 [246,y,1164,h] ⇒ x1=1409，实绘边框在 1407）。用于把「测量偏差」和「设计走样」区分开，
// 免得 ⑥/② 拿一个 2px 的测量误差去指控设计。
const ADAPTER_BOUNDS_BIAS = 2;
// ⑧「可疑层逐像素复核」每一层的点数上限。逐像素最坏情况 = 整块面积那么大
// （1920×1080 的文字层就是 200 万点：全量入内存 + 上千次 execFileSync，足以拖死门禁）。
// 超上限按面积等比降采样 —— 复核变粗，但至少跑得完。
const DENSE_SAMPLE_CAP = 40000;
// ⑩ 令牌源的两道上限。令牌源可能被登记成**打包后的整份样式表**（千级色值），
// 展开是 N²×α 量级：5000 色 ⇒ 5000 万条目、几百 MB，门禁直接挂死。
// 色值多到这个地步，⑩ 也早已失去意义（什么颜色都能"推导"出来）—— 与其算不完，
// 不如明说跳过。
const MAX_TOKEN_FILE_BYTES = 4 * 1024 * 1024;
const MAX_PALETTE_COLORS = 200;
const PALETTE_EXPAND_CAP = 1500000;

const DEFAULTS = {
  prototypesDir: "docs/process/prototypes",
  grid: 8,
  minGap: 4,
  centerTol: 1,
  marginTol: 1,
  contrast: 4.5,
  contrastLarge: 3.0,
};

const args = parseArgs(process.argv.slice(2));

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
      `  几何门禁需要它来确定原型目录与阈值（§4 项目配置）。缺失即无法判定，故直接拒绝。\n` +
      `  退出码：1（配置缺失）`,
  );
}
// ⚠️ 必须写成 `(level, title) => level === 2 && isNumberedSection(4, title)`。
// 曾经写成 `isNumberedSection.bind(null, 4)` —— readSection 按 `match(level, title)` 调用，
// 于是变成 `isNumberedSection(4, level)`：拿层级 "2" 当标题匹配，**永远返回 null**，
// §4 的全部 UI 配置键被静默忽略、一律回落默认值。因为默认值恰好等于文档承诺的默认值，
// 表面一切正常，**只有把某个键改成非默认值才看得出来**（回归测试 6n 就是干这个的）。
const sec4 = readSection(
  readFileSync(projectFile, "utf8"),
  (level, title) => level === 2 && isNumberedSection(4, title),
);
const num = (v, dflt) => {
  const s = scalarValue(v);
  // 注意 Number(null) === 0：不显式挡掉，`未配置` 就会被读成阈值 0（门禁当场失灵）。
  if (s === null) return dflt;
  const n = Number(s);
  return Number.isFinite(n) ? n : dflt;
};
const cfg = {
  prototypesDir: scalarValue(configValue(sec4, "UI 原型目录")) ?? DEFAULTS.prototypesDir,
  grid: num(configValue(sec4, "UI 几何网格"), DEFAULTS.grid),
  minGap: num(configValue(sec4, "UI 文字最小间隙"), DEFAULTS.minGap),
  centerTol: num(configValue(sec4, "UI 居中偏差上限"), DEFAULTS.centerTol),
  marginTol: num(configValue(sec4, "UI 边距对称容差"), DEFAULTS.marginTol),
  contrast: num(configValue(sec4, "UI 对比度下限"), DEFAULTS.contrast),
  contrastLarge: num(configValue(sec4, "UI 大字号对比度下限"), DEFAULTS.contrastLarge),
  // 「UI 项目令牌」是 L0：项目自己的设计规范 / 令牌源。可多个，用、分隔。
  // 含 `<`/`>` 的条目视为未替换的占位符（与落点门禁同一套纪律）。
  tokenFiles: (parseList(configValue(sec4, "UI 项目令牌")) ?? [])
    .map((p) => String(p).trim())
    .filter((p) => p && !p.includes("<") && !p.includes(">"))
    .map((p) => (isAbsolute(p) ? p : join(root, p))),
};
const protosDir = resolve(root, args.prototypes ?? cfg.prototypesDir);
const relOf = (p) => relative(root, p).split(sep).join("/");
/** 显示用标签：仓库内用相对路径，仓库外用绝对路径（`../..` 对外部文件没有意义）。 */
const labelOf = (p) => (relOf(p).startsWith("..") ? resolve(p) : relOf(p));
const EPS = 1e-6; // 浮点分类容差，与可配置阈值正交（阈值不该被借来当 epsilon 用）

// ── 几何模型 ──
// bounds 一律 [x, y, w, h]（与 PhotoCraft `info` 的口径一致）。
// kind: text（文字）· container（容器/卡片）· control（交互控件）· decoration（装饰，不参与判定）
const KINDS = new Set(["text", "container", "control", "decoration"]);

function rectOf(el) {
  const [x, y, w, h] = el.bounds;
  return { x0: x, y0: y, x1: x + w, y1: y + h, w, h };
}
const overlapX = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
const overlapY = (a, b) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);

/** 读一个几何文件；返回 { geo, warnings } 或抛错。 */
function loadGeometry(file, label) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    err(`① ${label} 不是合法 JSON：${e.message}`);
    return null;
  }
  const els = Array.isArray(raw.elements) ? raw.elements : null;
  if (!els) {
    err(`① ${label} 缺 elements 数组`);
    return null;
  }
  for (const el of els) {
    if (!el.name) el.name = "(未命名)";
    if (!KINDS.has(el.kind)) el.kind = "decoration";
    if (!Array.isArray(el.bounds) || el.bounds.length !== 4 || !el.bounds.every(Number.isFinite)) {
      err(`① ${label} 元素 ${el.name} 的 bounds 必须是 4 个数字 [x,y,w,h]`);
      return null;
    }
  }
  return raw;
}

/** 合并作者意图（intent.json）：只允许补充 band / align，不得改写 bounds。 */
function mergeIntent(geo, intent) {
  if (!intent) return geo;
  if (intent.band) geo.band = intent.band;
  if (intent.align && typeof intent.align === "object") {
    for (const el of geo.elements) {
      const a = intent.align[el.name];
      if (a) el.align = a;
    }
  }
}

/**
 * 容器归属：每个 text 归到**最小的**包住它的 container。
 * 这是测量得出的几何事实，不该由作者手填 —— 手填就会出现「归属写对了、bounds 没改」的假绿。
 * intent 显式指定 container 时以 intent 为准（少数视觉分组与几何嵌套不一致的场合）。
 */
function linkContainers(geo) {
  const boxes = geo.elements.filter((el) => el.kind === "container");
  for (const el of geo.elements) {
    if (el.kind !== "text" && el.kind !== "control") continue;
    if (el.container) continue;
    const r = rectOf(el);
    let best = null;
    for (const b of boxes) {
      const rb = rectOf(b);
      const inside =
        rb.x0 - EPS <= r.x0 && rb.y0 - EPS <= r.y0 && rb.x1 + EPS >= r.x1 && rb.y1 + EPS >= r.y1;
      if (!inside) continue;
      const area = rb.w * rb.h;
      if (!best || area < best.area) best = { name: b.name, area };
    }
    if (best) el.container = best.name;
  }
}

/** ① 可追溯性：bounds 必须来自产物，不能是自述。 */
function checkProvenance(geo, label) {
  if (typeof geo.source !== "string" || geo.source.trim() === "" || /[<>]/.test(geo.source)) {
    err(
      `① ${label} 缺可追溯的 source —— 几何必须由适配器从产物导出，` +
        `手写 bounds 只能证明「你写了它」，不能证明「产物长这样」`,
    );
    return false;
  }
  if (typeof geo.adapter !== "string" || geo.adapter.trim() === "") {
    warn(`① ${label} 未标 adapter —— 该几何可能是手写的，provenance 只能算弱证据`);
  }
  // `source` 是个自述字符串，编一个看起来很专业的它就能过 —— 所以它**不构成证据**。
  // 真正可机器验证的是 `artifact`：必须指向一个真实存在的产物。
  // （更进一步的一致性由 `--verify` 重导比 bounds 来证。）
  if (typeof geo.artifact !== "string" || geo.artifact.trim() === "" || /[<>]/.test(geo.artifact)) {
    warn(
      `① ${label} 未标 artifact —— 无法机器校验产物真实存在；` +
        `source 只是自述字符串，编一个也能过，故 provenance 只算弱证据`,
    );
    return true;
  }
  const art = resolve(root, geo.artifact);
  if (!existsSync(art)) {
    err(
      `① ${label} artifact 指向的产物不存在：${geo.artifact} —— ` +
        `几何必须真的来自产物；source 字符串本身不构成证据`,
    );
    return false;
  }
  ok(`① ${label} 来源可追溯：${geo.source}（adapter=${geo.adapter}｜artifact 存在 ✓）`);
  return true;
}

/** ② 画布溢出。 */
function checkOverflow(geo, label) {
  const W = geo.canvas?.width;
  const H = geo.canvas?.height;
  if (!Number.isFinite(W) || !Number.isFinite(H)) {
    warn(`② ${label} 未声明 canvas.width/height —— 跳过溢出检查`);
    return;
  }
  const bad = geo.elements.filter((el) => {
    const r = rectOf(el);
    return r.x0 < 0 || r.y0 < 0 || r.x1 > W || r.y1 > H;
  });
  bad.length === 0
    ? ok(`② ${label} 无元素溢出画布 ${W}×${H}`)
    : bad.forEach((el) => err(`② ${label} 元素 ${el.name} 溢出画布 ${W}×${H}：${JSON.stringify(el.bounds)}`));
}

/** ③ 文字真实重叠（矩形相交即判）—— 判定只在 text 之间。 */
function checkOverlap(geo, label) {
  const texts = geo.elements.filter((el) => el.kind === "text");
  const hits = [];
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = rectOf(texts[i]);
      const b = rectOf(texts[j]);
      if (overlapX(a, b) > 0 && overlapY(a, b) > 0) hits.push([texts[i].name, texts[j].name]);
    }
  }
  hits.length === 0
    ? ok(`③ ${label} ${texts.length} 个文字层无重叠`)
    : hits.forEach(([a, b]) => err(`③ ${label} 文字重叠：${a} ✕ ${b}`));
  return hits.length;
}

/** ④ 同列文字过挤：水平有交集的文字对，垂直间隙须 ≥ minGap。 */
function checkCrowding(geo, label, minGap) {
  const texts = geo.elements.filter((el) => el.kind === "text");
  const tight = [];
  let minSeen = Infinity;
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = rectOf(texts[i]);
      const b = rectOf(texts[j]);
      if (overlapX(a, b) <= 0) continue;
      const gap = a.y1 <= b.y0 ? b.y0 - a.y1 : b.y1 <= a.y0 ? a.y0 - b.y1 : -1;
      if (gap < 0) continue; // 重叠已由 ③ 判过，不重复报
      minSeen = Math.min(minSeen, gap);
      if (gap < minGap) tight.push([texts[i].name, texts[j].name, gap]);
    }
  }
  tight.length === 0
    ? ok(
        `④ ${label} 同列文字最小间隙 ${Number.isFinite(minSeen) ? `${minSeen}px` : "n/a"}（阈值 ${minGap}px）`,
      )
    : tight.forEach(([a, b, g]) => err(`④ ${label} 文字过挤：${a} ↕ ${b} 间隙 ${g}px < ${minGap}px`));
}

/** ⑤ 声明 align 的元素须在其容器内居中。 */
function checkCentering(geo, label, tol) {
  const byName = new Map(geo.elements.map((el) => [el.name, el]));
  const declared = geo.elements.filter((el) => el.align);
  if (declared.length === 0) {
    warn(`⑤ ${label} 无元素声明 align —— 居中未被判定（意图需写进 ${INTENT_FILE}）`);
    return;
  }
  let bad = 0;
  for (const el of declared) {
    const box = el.container ? byName.get(el.container) : null;
    if (!box) {
      err(`⑤ ${label} ${el.name} 声明了 align=${el.align} 但找不到容器 ${el.container ?? "(未声明)"}`);
      bad += 1;
      continue;
    }
    const a = rectOf(el);
    const b = rectOf(box);
    const dx = Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2);
    const dy = Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
    const ex = el.align === "center" || el.align === "center-x" ? dx : 0;
    const ey = el.align === "center" || el.align === "center-y" ? dy : 0;
    if (ex > tol || ey > tol) {
      err(`⑤ ${label} ${el.name} 在 ${el.container} 内未居中：水平偏 ${ex.toFixed(1)}px / 垂直偏 ${ey.toFixed(1)}px > ${tol}px`);
      bad += 1;
    }
  }
  if (bad === 0) ok(`⑤ ${label} ${declared.length} 个声明居中的元素偏差均 ≤ ${tol}px`);
}

/** ⑥ 内容区左右边距对称（需要 band：内容横向带，如 {left:240,right:1280}）。 */
function checkMargins(geo, label, tol) {
  const band = geo.band;
  if (!band || !Number.isFinite(band.left) || !Number.isFinite(band.right)) {
    warn(`⑥ ${label} 未声明 band —— 跳过边距对称检查（意图需写进 ${INTENT_FILE}）`);
    return;
  }
  const cw = Number(geo.canvas?.width);
  const ch = Number(geo.canvas?.height);
  const W = Number.isFinite(cw) && cw > 0 ? cw : band.right;
  // ⚠️ 画布高度未知时**不能拿 Infinity 当边界**：`r.y1 >= Infinity - EPS` 恒为 false，
  // 于是满幅的背景板会被误报成「跨 band 噪声」⚠。高度未知就只按横向判满幅。
  const heightKnown = Number.isFinite(ch) && ch > 0;
  // 满幅元素（铺满画布的底色/背景板）天然横跨一切，不应被当成"跨带噪声"。
  const fullBleed = (r) =>
    r.x0 <= EPS && r.x1 >= W - EPS && (!heightKnown || (r.y0 <= EPS && r.y1 >= ch - EPS));
  // 只有"盒子"参与边距判定；纯文字与装饰不构成版心。
  const boxes = geo.elements.filter(
    (el) => (el.kind === "container" || el.kind === "control") && rectOf(el).x1 > band.left + EPS,
  );
  if (boxes.length === 0) {
    warn(`⑥ ${label} band 内无可判定的盒子（container/control）—— 跳过边距检查`);
    return;
  }
  const left = Math.min(...boxes.map((el) => rectOf(el).x0));
  const right = Math.max(...boxes.map((el) => rectOf(el).x1));
  const lm = left - band.left;
  const rm = W - right;
  // 跨带元素（一部分在带左边）会成为版心噪声，单独提示
  const straddle = geo.elements.filter((el) => {
    const r = rectOf(el);
    return r.x0 < band.left - EPS && r.x1 > band.left + EPS && !fullBleed(r);
  });
  for (const el of straddle) warn(`⑥ ${label} 元素 ${el.name} 跨越 band 左界 ${band.left}，可能干扰版心判定`);
  const diff = Math.abs(lm - rm);
  if (diff <= tol) {
    ok(`⑥ ${label} 内容区边距对称：左 ${lm}px / 右 ${rm}px`);
  } else if (diff <= tol + ADAPTER_BOUNDS_BIAS) {
    // 差落在「适配器偏差带」内 ⇒ **不足以断定设计不对称**。
    // 实测（PhotoCraft 0.5.0）：`info` 对带 1px 描边的形状报的 bounds 比 PNG 实绘范围约宽 2px
    // （报 `[246,y,1164,h]` ⇒ x1=1409，而实绘边框在 1407）。这是**测量**偏差，不是设计走样。
    // 注意 ⑨ 抓不到它 —— ⑨ 比的是「适配器 vs 适配器」，只能证明"测量来自产物"，不能证明像素级准确。
    warn(
      `⑥ ${label} 内容区边距左 ${lm}px / 右 ${rm}px（差 ${diff}px）—— ` +
        `**落在适配器 bounds 偏差带内（≤${tol + ADAPTER_BOUNDS_BIAS}px），不足以断定设计不对称**；` +
        `请对着 PNG 逐像素复核后再下结论`,
    );
  } else {
    warn(`⑥ ${label} 内容区边距不对称：左 ${lm}px / 右 ${rm}px（差 ${diff}px > ${tol}px）`);
  }
}

/** ⑦ 网格对齐（仅 ⚠）：盒子类元素是否落在网格上。
 *  只报"符合率"并推断实际遵循的网格 —— 逐个列名字会变成噪声（真实设计普遍混用 4/8px）。
 *  容差 1px：产物导出的包围盒会向外取整，不能拿它当严格网格凭证。 */
function checkGrid(geo, label, grid) {
  if (!(grid > 0)) return;
  const boxes = geo.elements.filter((el) => el.kind === "container" || el.kind === "control");
  if (boxes.length === 0) return;
  const hits = (g) =>
    boxes.filter((el) => el.bounds.every((v) => Math.abs(v - Math.round(v / g) * g) <= 1)).length;
  const n = hits(grid);
  if (n === boxes.length) {
    ok(`⑦ ${label} ${boxes.length} 个盒子全部落在 ${grid}px 网格上（容差 1px）`);
    return;
  }
  const best = [8, 4, 2, 1].filter((g) => g <= grid && hits(g) >= boxes.length * 0.9)[0];
  warn(
    `⑦ ${label} ${grid}px 网格符合率 ${((n / boxes.length) * 100).toFixed(0)}%（${n}/${boxes.length}）` +
      (best && best !== grid ? `；该设计实际更接近 ${best}px 网格` : "") +
      `（仅提示，可调 §4「UI 几何网格」）`,
  );
}

// ── ⑨ 深验证：重跑适配器、逐元素比 bounds ──
// `source` 和 `artifact` 都还是「声明 + 存在性」。只有重导一遍，才能证明
// **提交的这些 bounds 就是该产物当前的测量值**（而不是随手编的、或是别的版本的）。
function checkVerified(geo, label) {
  if (typeof geo.artifact !== "string" || geo.artifact.trim() === "") {
    warn(`⑨ ${label} 无 artifact，--verify 无从重导（跳过深验证）`);
    return;
  }
  const art = resolve(root, geo.artifact);
  if (!existsSync(art)) return; // ① 已判红，不重复报
  let fresh;
  try {
    fresh = deriveFromPhotocraft(art);
  } catch (e) {
    err(`⑨ ${label} 重导几何失败：${String(e.message).split("\n")[0]}`);
    return;
  }
  const a = new Map(geo.elements.map((e) => [e.name, e.bounds.join(",")]));
  const b = new Map(fresh.elements.map((e) => [e.name, e.bounds.join(",")]));
  const missing = [...b.keys()].filter((n) => !a.has(n));
  const extra = [...a.keys()].filter((n) => !b.has(n));
  const diff = [...a.keys()].filter((n) => b.has(n) && a.get(n) !== b.get(n));
  if (missing.length || extra.length || diff.length) {
    err(
      `⑨ ${label} 几何与产物不一致：缺 ${missing.length} / 多 ${extra.length} / bounds 不符 ${diff.length} 层` +
        `（不符：${diff.slice(0, 3).join("、") || "无"}）—— ` +
        `提交的 bounds 不是该产物当前的测量值`,
    );
  } else {
    ok(`⑨ ${label} 几何与产物逐元素一致（${a.size} 层）—— 测量确实来自该产物`);
  }
}

// ── ⑧ 对比度：几何判定「在哪」，对比度判定「看不看得见」 ──
// `info` 不给图层颜色，所以颜色只能从产物像素采样。document.pixel 读的是**合成结果** ——
// 正好，人看到的也是合成结果。采样是批量的：1300 次采样实测耗时 ≈ 0s。
const LARGE_TEXT_PT = 24; // WCAG 大字号阈值（≥24pt 时对比度要求放宽到 3:1）

/** sRGB 相对亮度（WCAG 定义）。 */
const relLuminance = ([r, g, b]) => {
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrastRatio = (a, b) => {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const rgbKey = (p) => p.slice(0, 3).map((c) => Math.round(c * 255)).join(",");
const keyToRgb = (k) => k.split(",").map((v) => Number(v) / 255);
const hexOf = (k) => `#${k.split(",").map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;

/**
 * 批量读合成像素。
 * 必须**分批**：每个采样点是 2 个 argv 项，上万个点会直接撞 ARG_MAX（实测报 E2BIG）。
 * 2000 点/批 ≈ 4000 个 argv 项，远在安全区内。
 */
const SAMPLE_CHUNK = 2000;
/**
 * 把底层报错压成一行短语。
 *
 * `execFileSync` 的错误信息里带着**完整命令行** —— ⑧ 的采样点动辄几千个
 * `--cmd ... --params ...`，直接拼进 ⚠ 会把门禁输出刷出十几 KB，人根本读不了。
 * 所以统一截断，只留最前面一段。
 */
function briefErr(e) {
  const one = String(e?.message ?? e).replace(/\s+/g, " ").trim();
  return one.length > 160 ? `${one.slice(0, 160)}…（已截断）` : one;
}

function samplePixels(artifact, points) {
  if (points.length === 0) return [];
  const px = [];
  for (let i = 0; i < points.length; i += SAMPLE_CHUNK) {
    const chunk = points.slice(i, i + SAMPLE_CHUNK);
    const argv = ["run", artifact];
    for (const pt of chunk) {
      argv.push("--cmd", "document.pixel", "--params", JSON.stringify({ x: Math.round(pt.x), y: Math.round(pt.y) }));
    }
    const out = execFileSync(findPhotocraft(), argv, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
    for (const line of out.split("\n")) {
      const s = line.trim();
      if (!s.startsWith("{")) continue;
      try {
        const d = JSON.parse(s);
        if (Array.isArray(d.result) && d.result.length >= 3) px.push(d.result);
      } catch {
        /* 非 JSON 行忽略 */
      }
    }
  }
  return px;
}

/** bbox 外侧一圈：文字周围那圈必然是它的背景（比在 bbox 内猜背景准）。 */
function ringPoints(r, m) {
  const pts = [];
  for (const x of [r.x0 - m, r.x0 + r.w / 2, r.x1 + m]) {
    for (const y of [r.y0 - m, r.y0 + r.h / 2, r.y1 + m]) {
      const inside = x >= r.x0 - 0.5 && x <= r.x1 + 0.5 && y >= r.y0 - 0.5 && y <= r.y1 + 0.5;
      if (!inside) pts.push({ x, y });
    }
  }
  return pts;
}

/** bbox 内按面积自适应步长：小字逐像素（避免漏掉笔画），大字跳跃，约 1200 点/层封顶。
 *  `forceStep` 用于「可疑层逐像素复核」——大盒子平时是抽样的，补采时才强制 step=1。 */
function gridPoints(r, forceStep) {
  const step =
    forceStep ?? Math.max(1, Math.round(Math.sqrt((r.w * r.h) / 1200)));
  const pts = [];
  for (let y = r.y0; y < r.y1; y += step) {
    for (let x = r.x0; x < r.x1; x += step) pts.push({ x, y });
  }
  return pts;
}

/** 众数（返回出现最多的 key 与其次数）。 */
function modeOf(samples) {
  const counts = new Map();
  for (const p of samples) {
    const k = rgbKey(p);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let key = null;
  let best = -1;
  for (const [k, c] of counts) {
    if (c > best) {
      best = c;
      key = k;
    }
  }
  return { key, count: best, counts };
}

function checkContrast(geo, label, tol, tolLarge) {
  const texts = geo.elements.filter((el) => el.kind === "text");
  if (texts.length === 0) return;
  if (typeof geo.artifact !== "string" || geo.artifact.trim() === "") {
    warn(`⑧ ${label} 无 artifact，跳过对比度检查（颜色只能从产物像素采样）`);
    return;
  }
  const art = resolve(root, geo.artifact);
  if (!existsSync(art)) return; // ① 已判红

  // 越界坐标**不报错**，而是返回 [0,0,0,0]（透明黑）—— 贴边元素的外圈采样点会落到画布外，
  // 若不剔除就会把「纯黑」算进背景众数，对比度当场算错。所以按画布范围过滤。
  const W = Number.isFinite(geo.canvas?.width) ? geo.canvas.width : Infinity;
  const H = Number.isFinite(geo.canvas?.height) ? geo.canvas.height : Infinity;
  const inCanvas = (p) => p.x >= 0 && p.y >= 0 && p.x < W && p.y < H;
  const bgsPer = texts.map((t) => ringPoints(rectOf(t), 3).filter(inCanvas));
  const fgsPer = texts.map((t) => gridPoints(rectOf(t)).filter(inCanvas));
  const flatBg = bgsPer.flat();
  const flatFg = fgsPer.flat();
  let bgPx;
  let fgPx;
  try {
    bgPx = samplePixels(art, flatBg);
    fgPx = samplePixels(art, flatFg);
  } catch (e) {
    warn(`⑧ ${label} 采样失败（${briefErr(e)}），跳过对比度检查`);
    return;
  }
  if (bgPx.length !== flatBg.length || fgPx.length !== flatFg.length) {
    warn(
      `⑧ ${label} 采样点数与请求不符（背景 ${bgPx.length}/${flatBg.length}、` +
        `前景 ${fgPx.length}/${flatFg.length}），跳过对比度检查`,
    );
    return;
  }

  const fails = [];
  const ratios = [];
  let bi = 0;
  let fi = 0;
  // 与背景完全同色的层：可能是大盒子抽样太疏漏掉细笔画，也可能是**文字真的看不见**。
  // 先挂起，最后统一逐像素复核再下结论（见本函数末尾）。
  const suspects = [];
  for (let k = 0; k < texts.length; k += 1) {
    const t = texts[k];
    const bg = bgPx.slice(bi, bi + bgsPer[k].length);
    bi += bgsPer[k].length;
    const fg = fgPx.slice(fi, fi + fgsPer[k].length);
    fi += fgsPer[k].length;

    const bgMode = modeOf(bg);
    if (!bgMode.key) continue;
    const bgRgb = keyToRgb(bgMode.key);
    const bgLum = relLuminance(bgRgb);

    // 前景 = 与背景亮度差最大、且**至少出现 2 次**的颜色
    //（出现 1 次的是抗锯齿孤立像素，会把对比度算高、放走真问题）
    const fgCounts = modeOf(fg).counts;
    let fgKey = bgMode.key;
    let fgDist = 0;
    for (const [k2, c] of fgCounts) {
      if (c < 2) continue;
      const d = Math.abs(relLuminance(keyToRgb(k2)) - bgLum);
      if (d > fgDist) {
        fgDist = d;
        fgKey = k2;
      }
    }
    if (fgKey === bgMode.key) {
      // 与背景完全同色。小盒子本来就是逐像素采的；大盒子是抽样的，可能只是网格太疏。
      // 一并留到末尾复核 —— 但**不能像以前那样静默跳过**：1:1 是最严重的对比度失败。
      suspects.push({ t, bgMode });
      continue;
    }

    const ratio = contrastRatio(bgRgb, keyToRgb(fgKey));
    const size = Number.isFinite(t.sizePt) ? t.sizePt : 0;
    const need = size >= LARGE_TEXT_PT ? tolLarge : tol;
    ratios.push(ratio);
    if (ratio < need) {
      fails.push({ name: t.name, size, ratio, need, fg: hexOf(fgKey), bg: hexOf(bgMode.key) });
    }
  }
  // ── 可疑层复核：与背景同色的层，逐像素再采一次 ──
  // 采到了字形 ⇒ 只是网格太疏，按真实前景色正常判；
  // 逐像素仍只有一种颜色 ⇒ **文字根本没显示出来**（被上层遮住 / 字色与底色相同），判红。
  // 这类失败以前被静默跳过，恰恰是最该管的一种：看不见的文字连"模糊"都算不上。
  if (suspects.length > 0) {
    const densePts = [];
    const spans = [];
    for (const s of suspects) {
      const r = rectOf(s.t);
      let pts = gridPoints(r, 1).filter(inCanvas);
      if (pts.length > DENSE_SAMPLE_CAP) {
        pts = gridPoints(r, Math.ceil(Math.sqrt(pts.length / DENSE_SAMPLE_CAP))).filter(inCanvas);
      }
      spans.push(pts.length);
      for (const p of pts) densePts.push(p);
    }
    // ⚠️ **采样失败必须和「真的只有一种颜色」分开**：以前 catch 成 `[]` 之后没有长度校验，
    // 于是切片全空 ⇒ 每个 suspect 都判 ❌「文字完全不可见」——**把工具故障变成了假红**，
    // 而假红会让人去改一个根本没问题的地方。长度不符或抛错都只降级为 ⚠ 并跳过本段判定。
    let densePx = [];
    let denseOk = true;
    try {
      const got = samplePixels(art, densePts);
      if (got.length === densePts.length) densePx = got;
      else {
        denseOk = false;
        warn(
          `⑧ ${label} 逐像素复核返回点数不符（期望 ${densePts.length}，实得 ${got.length}）` +
            `⇒ 跳过「文字完全不可见」判定（不改判红）`,
        );
      }
    } catch (e) {
      denseOk = false;
      warn(`⑧ ${label} 逐像素复核采样失败：${briefErr(e)} ⇒ 跳过「文字完全不可见」判定（不改判红）`);
    }
    let di = 0;
    for (let i = 0; i < suspects.length; i += 1) {
      if (!denseOk) break;
      const s = suspects[i];
      const slice = densePx.slice(di, di + spans[i]);
      di += spans[i];
      const bgLum = relLuminance(keyToRgb(s.bgMode.key));
      const counts = modeOf(slice).counts;
      let key = s.bgMode.key;
      let dist = 0;
      for (const [k2, c] of counts) {
        if (c < 2) continue;
        const d = Math.abs(relLuminance(keyToRgb(k2)) - bgLum);
        if (d > dist) {
          dist = d;
          key = k2;
        }
      }
      const size = Number.isFinite(s.t.sizePt) ? s.t.sizePt : 0;
      const need = size >= LARGE_TEXT_PT ? tolLarge : tol;
      if (key === s.bgMode.key || dist === 0) {
        ratios.push(1);
        fails.push({
          name: s.t.name,
          size,
          ratio: 1,
          need,
          fg: hexOf(s.bgMode.key),
          bg: hexOf(s.bgMode.key),
          invisible: true,
        });
        continue;
      }
      const ratio = contrastRatio(keyToRgb(s.bgMode.key), keyToRgb(key));
      ratios.push(ratio);
      if (ratio < need) {
        fails.push({
          name: s.t.name,
          size,
          ratio,
          need,
          fg: hexOf(key),
          bg: hexOf(s.bgMode.key),
        });
      }
    }
  }
  if (ratios.length === 0) {
    warn(`⑧ ${label} 未能采到有效前景色，跳过对比度检查`);
    return;
  }
  if (fails.length === 0) {
    ok(
      `⑧ ${label} ${ratios.length} 个文字层对比度均达标（最低 ${Math.min(...ratios).toFixed(2)}:1，` +
        `阈值 ${tol}:1／大字号 ${tolLarge}:1）`,
    );
    return;
  }
  for (const f of fails.slice(0, 8)) {
    if (f.invisible) {
      err(
        `⑧ ${label} 文字 ${f.name} **完全不可见**：逐像素复核整块区域只有 ${f.bg} 一种颜色` +
          ` —— 被上层遮住，或字色与底色相同（对比度 1:1）`,
      );
      continue;
    }
    err(
      `⑧ ${label} 文字 ${f.name} 对比度仅 ${f.ratio.toFixed(2)}:1 < ${f.need}:1` +
        `（${f.fg} on ${f.bg}${f.size ? `，${f.size}pt` : ""}）—— 看不清的文字等于没有文字`,
    );
  }
  if (fails.length > 8) err(`⑧ ${label} 另有 ${fails.length - 8} 个文字层对比度不足（略）`);
}

// ── ⑩ 项目令牌一致性：配了「UI 项目令牌」就必须真的用上 ──
//
// 为什么需要它：`UI 项目令牌` 原本只是**一句话的承诺** —— 文档让 ui-designer「必须照抄」，
// 但没有任何机器检查它到底抄了没有（与「溯源只声明不验证」是同一类问题）。
// 好在真实项目的设计规范通常以 CSS 变量/色值形式存在，**色板是可机器抽取的**，于是这条可以判。
//
// 判据刻意宽松：只要求「画面主色**能从声明的色板推导出来**」——允许色板内任意两色按任意 α 叠加
// （胶囊底 = 语义色 @0.18 叠在卡片白上这类写法很常见，不能因此判红）。
// 于是它抓的是「用了整套别的色板」这种硬伤（实测能一眼识破：深色默认主题 vs 浅色项目规范）。

// 只处理 6 位色值：唯一调用方 `extractPaletteKeys` 的正则就是 `#([0-9A-Fa-f]{6})\b`。
const hexToKey = (hex) => {
  const n = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)).join(",");
};

/** 从令牌源文件里抽出所有 6 位色值（css 变量与散落色值一并收）。 */
function extractPaletteKeys(files) {
  const map = new Map(); // key → 首个出现的文件
  for (const f of files) {
    let text;
    try {
      if (statSync(f).size > MAX_TOKEN_FILE_BYTES) {
        warn(
          `⑩ 令牌源 ${f} 超过 ${Math.round(MAX_TOKEN_FILE_BYTES / 1024 / 1024)}MB，` +
            `不太可能是令牌文件（多半指向了打包后的整份样式表）⇒ 跳过该文件`,
        );
        continue;
      }
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(/#([0-9A-Fa-f]{6})\b/g)) {
      const k = hexToKey(m[1]);
      if (!map.has(k)) map.set(k, f);
    }
  }
  return map;
}

/** 允许的色集合 = 色板本身 ∪ 色板内任意两色按 α∈[0.02,1] 的叠加结果。 */
function expandPalette(keys) {
  // ⚠️ 必须先落成数组再消费两次。曾经直接传 `map.keys()`（迭代器）进来：
  // `new Set(keys)` 先把迭代器耗尽，随后的 `[...keys]` 拿到空数组，
  // 于是**一条叠加色都没生成**，⑩ 退化成只认精确相等 —— 真实设计普遍用淡色底，
  // 会变成见谁咬谁。正向夹具（胶囊 = #F24F63 @0.18 叠白）当场暴露了它。
  const list = [...keys];
  const set = new Set(list);
  const arr = list.map(keyToRgb);
  // 色对数 × α 档数不能无限涨：色板越大 α 档越粗（色板 ≤200 时最粗也只到 25 档）。
  const pairs = arr.length * arr.length;
  let aStep = 2;
  while (pairs * (100 / aStep) > PALETTE_EXPAND_CAP && aStep < 100) aStep += 2;
  for (const fg of arr) {
    for (const bg of arr) {
      for (let a = 2; a <= 100; a += aStep) {
        const t = a / 100;
        set.add(
          [0, 1, 2]
            .map((i) => Math.round(fg[i] * t * 255 + bg[i] * (1 - t) * 255))
            .join(","),
        );
      }
    }
  }
  return set;
}

function checkTokens(geo, label, files) {
  if (files.length === 0) {
    warn(
      `⑩ ${label} 未配置「UI 项目令牌」⇒ 跳过令牌一致性检查 —— ` +
        `配色是否照抄项目规范只能靠人看；` +
        `若项目本来就有设计规范 / 令牌源，请在 PROJECT.md §4「UI 项目令牌」登记其路径`,
    );
    return;
  }
  // ⚠️ 必须 `resolve(root, …)`：脚本用 findRepoRoot 明确支持从子目录运行，
  // 不解析的话相对 artifact 会对着 **cwd** 去找 —— 从 `docs/` 跑就静默降级成
  // 「无 artifact，跳过令牌一致性检查」，⑩ 整个不判了，而且**看起来一切正常**。
  // 同文件的 ①/⑧/⑨ 都这么做了，⑩ 当初漏了。
  const artifact = typeof geo.artifact === "string" ? resolve(root, geo.artifact) : null;
  if (!artifact || !existsSync(artifact)) {
    warn(`⑩ ${label} 无 artifact，跳过令牌一致性检查`);
    return;
  }
  const missing = files.filter((f) => !existsSync(f));
  const palette = extractPaletteKeys(files.filter((f) => existsSync(f)));
  if (palette.size === 0) {
    warn(
      `⑩ ${label} 已配「UI 项目令牌」（${files.join("、")}）但读不出任何色值` +
        `${missing.length ? `（有路径不存在：${missing.join("、")}）` : ""} ⇒ 跳过`,
    );
    return;
  }
  if (palette.size > MAX_PALETTE_COLORS) {
    warn(
      `⑩ ${label} 令牌源抽出 ${palette.size} 个色值（上限 ${MAX_PALETTE_COLORS}）` +
        `⇒ 令牌源太泛（多半是打包后的整份样式表），色板一泛 ⑩ 就失去意义（什么颜色都能"推导"出来）；` +
        `请把它指向**真正的令牌文件**（如 CSS 变量表 / 设计令牌 JSON），本次跳过令牌一致性检查`,
    );
    return;
  }
  const W = Number(geo.canvas?.width);
  const H = Number(geo.canvas?.height);
  if (!Number.isFinite(W) || !Number.isFinite(H)) {
    warn(`⑩ ${label} 未声明 canvas 尺寸，跳过令牌一致性检查`);
    return;
  }
  // 全画布网格采样：约 4000 点，够看清「主色」，又不至于慢
  const step = Math.max(1, Math.round(Math.sqrt((W * H) / 4000)));
  const pts = [];
  for (let y = Math.floor(step / 2); y < H; y += step) {
    for (let x = Math.floor(step / 2); x < W; x += step) pts.push({ x, y });
  }
  let px;
  try {
    px = samplePixels(artifact, pts);
  } catch (e) {
    warn(`⑩ ${label} 采样失败（${String(e.message).split("\n")[0]}），跳过令牌一致性检查`);
    return;
  }
  if (px.length === 0) {
    warn(`⑩ ${label} 采样为空，跳过令牌一致性检查`);
    return;
  }
  const counts = new Map();
  for (const p of px) {
    const k = rgbKey(p);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const allowed = expandPalette(palette.keys());
  // 只看「主色」：占比 ≥0.5% 的。抗锯齿产生的中间色占比极低，天然被排除。
  const dom = [...counts.entries()]
    .filter(([, c]) => c / px.length >= 0.005)
    .sort((a, b) => b[1] - a[1]);
  const bad = dom.filter(([k]) => !allowed.has(k));
  if (bad.length === 0) {
    ok(
      `⑩ ${label} 画面主色 ${dom.length} 种**全部**取自项目令牌` +
        `（令牌源 ${palette.size} 个色值，来自 ${[...new Set(palette.values())].length} 个文件）`,
    );
    return;
  }
  for (const [k, c] of bad.slice(0, 6)) {
    err(
      `⑩ ${label} 画面主色 ${hexOf(k)}（占 ${((c / px.length) * 100).toFixed(1)}%）` +
        `**不在项目令牌里** —— 配了「UI 项目令牌」就必须用它，` +
        `不得改回通用默认或自创配色（令牌源：${files.join("、")}）`,
    );
  }
  if (bad.length > 6) err(`⑩ ${label} 另有 ${bad.length - 6} 种主色不在项目令牌里（略）`);
}

// ── 适配器：PhotoCraft PSD → 几何 JSON ──
function findPhotocraft() {
  if (typeof args.photocraft === "string") return args.photocraft;
  if (process.env.PHOTOCRAFT_CLI) return process.env.PHOTOCRAFT_CLI;
  return "photocraft-cli";
}

function deriveFromPhotocraft(psd) {
  const bin = findPhotocraft();
  let out;
  try {
    out = execFileSync(bin, ["info", psd, "--compact"], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (e) {
    fail(
      `无法调用 PhotoCraft CLI（${bin}）：${e.message}\n` +
        `  可用 --photocraft <路径> 或环境变量 PHOTOCRAFT_CLI 指定；` +
        `也可先用别的工具导出 geometry.json，再用 --geometry 判定。`,
    );
  }
  const doc = JSON.parse(out);
  const flat = [];
  const walk = (ls) => {
    for (const l of ls ?? []) {
      flat.push(l);
      walk(l.children);
    }
  };
  walk(doc.layers);

  const texts = flat.filter((l) => l.kind === "Type" && Array.isArray(l.bounds));
  const enclosesText = (l) => {
    const [x, y, w, h] = l.bounds;
    return texts.some((t) => {
      const [tx, ty, tw, th] = t.bounds;
      return tx >= x - 1 && ty >= y - 1 && tx + tw <= x + w + 1 && ty + th <= y + h + 1;
    });
  };
  const elements = flat
    .filter((l) => Array.isArray(l.bounds))
    .map((l) => {
      let kind = "decoration";
      if (l.kind === "Type") kind = "text";
      else if (l.kind === "Shape") kind = enclosesText(l) ? "container" : "decoration";
      const el = { name: l.name ?? `layer-${l.id}`, kind, bounds: l.bounds };
      // 字号用于对比度的「大字号」判定；`info` 只对 Type 层给 sizePt
      if (kind === "text" && Number.isFinite(l.text?.sizePt)) el.sizePt = l.text.sizePt;
      return el;
    });
  const abs = resolve(psd);
  const relArt = relOf(abs);
  return {
    source: `${bin} info → ${labelOf(abs)}`,
    adapter: "photocraft-cli",
    // 机器可验的产物指针（source 只是给人看的自述字符串）
    artifact: relArt.startsWith("..") ? abs : relArt,
    canvas: { width: doc.width, height: doc.height },
    elements,
  };
}

// ── 收集待判定的几何 ──
// 一个包通常有**多个屏幕**，所以几何文件支持 `geometry.json` 与 `geometry.<屏幕名>.json` 并存。
// 每个屏幕的**作者意图**优先取同名的 `intent.<屏幕名>.json`，退回共用的 `intent.json`。
const INTENT_STEM = INTENT_FILE.replace(/\.json$/, "");
function geometryFilesIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^geometry(\..+)?\.json$/.test(n))
    .sort((a, b) => {
      if (a === GEOMETRY_FILE) return -1;
      if (b === GEOMETRY_FILE) return 1;
      return a.localeCompare(b);
    })
    .map((n) => join(dir, n));
}
function intentFor(geoFile) {
  // 注意：必须在 **basename** 上取后缀。对完整路径用 /^geometry/ 永远匹配不到
  // （开头是 `/private/tmp/...`），于是每一屏都会静默退回共用的 intent.json。
  const suffix = basename(geoFile)
    .replace(/^geometry/, "")
    .replace(/\.json$/, ""); // "" 或 ".统计"
  const own = join(dirname(geoFile), `${INTENT_STEM}${suffix}.json`);
  if (suffix && existsSync(own)) return own;
  const shared = join(dirname(geoFile), INTENT_FILE);
  return existsSync(shared) ? shared : null;
}

const targets = []; // {label, file, geo}
if (typeof args.geometry === "string") {
  const f = resolve(root, args.geometry);
  if (!existsSync(f)) fail(`--geometry 指定的文件不存在：${relOf(f)}`);
  targets.push({ label: labelOf(f), file: f });
} else if (typeof args["from-photocraft"] === "string") {
  const psd = resolve(root, args["from-photocraft"]);
  if (!existsSync(psd)) fail(`--from-photocraft 指定的文件不存在：${relOf(psd)}`);
  const geo = deriveFromPhotocraft(psd);
  if (typeof args.emit === "string") {
    const out = resolve(root, args.emit);
    writeFileSync(out, `${JSON.stringify(geo, null, 2)}\n`);
    ok(`已导出几何 → ${relOf(out)}`);
  }
  // ⚠️ 这里也要带上 intent，否则 --from-photocraft 会**静默丢掉作者意图**：
  // ⑤ 居中 / ⑥ 边距那两条只认 intent.json，拿不到就整条空转，
  // 而作者看到的是"这条命令跑过了、没有报错" —— 比直接报错更危险。
  // 配对规则（按优先级）：
  //   ① 显式 `--intent <路径>`；
  //   ② 给了 `--emit` ⇒ 按它推（`geometry.看板.json` → `intent.看板.json`，多屏命名自然对上）；
  //   ③ 都没有 ⇒ 退回 PSD 同目录的共用 `intent.json`。
  //      （从 `管理看板-FEAT-01.psd` 推不出屏幕短名「看板」，所以多屏包请显式给 --intent 或 --emit。）
  const intentPath =
    typeof args.intent === "string"
      ? resolve(root, args.intent)
      : intentFor(typeof args.emit === "string" ? resolve(root, args.emit) : psd);
  targets.push({
    label: `${labelOf(psd)}（现导）`,
    file: null,
    geo,
    intent: intentPath,
  });
} else if (typeof args.id === "string") {
  const dir = join(protosDir, String(args.id));
  const files = geometryFilesIn(dir);
  if (files.length === 0) {
    err(
      `① 指定了 --id ${args.id} 但找不到 ${relOf(dir)} 下的 ${GEOMETRY_FILE} —— ` +
        `该包声明需要 UI 设计却没有几何证据；请先由适配器导出（不能手写）`,
    );
  } else {
    for (const f of files) targets.push({ label: labelOf(f), file: f });
  }
} else {
  if (existsSync(protosDir)) {
    for (const e of readdirSync(protosDir).sort()) {
      const d = join(protosDir, e);
      if (!statSync(d).isDirectory()) continue;
      for (const f of geometryFilesIn(d)) targets.push({ label: labelOf(f), file: f });
    }
  }
  if (targets.length === 0) {
    warn(`未在 ${relOf(protosDir)} 下发现任何 ${GEOMETRY_FILE} —— UI 设计未启用或尚未产出（不算红）`);
  }
}

// ── 判定 ──
let provenanceOk = 0;
for (const t of targets) {
  const geo = t.geo ?? loadGeometry(t.file, t.label);
  if (!geo) continue;
  const intentFile = t.intent !== undefined ? t.intent : t.file ? intentFor(t.file) : null;
  if (intentFile && existsSync(intentFile)) {
    try {
      mergeIntent(geo, JSON.parse(readFileSync(intentFile, "utf8")));
      ok(`① ${t.label} 已合并作者意图 ${basename(intentFile)}`);
    } catch (e) {
      err(`① ${t.label} 的 ${INTENT_FILE} 不是合法 JSON：${e.message}`);
    }
  }
  linkContainers(geo);
  if (!checkProvenance(geo, t.label)) continue;
  provenanceOk += 1;
  checkOverflow(geo, t.label);
  checkOverlap(geo, t.label);
  checkCrowding(geo, t.label, cfg.minGap);
  checkCentering(geo, t.label, cfg.centerTol);
  checkMargins(geo, t.label, cfg.marginTol);
  checkGrid(geo, t.label, cfg.grid);
  checkContrast(geo, t.label, cfg.contrast, cfg.contrastLarge);
  checkTokens(geo, t.label, cfg.tokenFiles);
  if (args.verify) checkVerified(geo, t.label);
}

// ── 输出 ──
console.log(
  `\ncheck-ui-geometry：${oks.length} ✓ / ${errors.length} ❌` +
    (warns.length ? `（另有 ⚠ 可见提示 ${warns.length} 条，不计 ❌）` : "") +
    `\n判定包 ${provenanceOk}/${targets.length}   阈值：网格 ${cfg.grid}px · 最小间隙 ${cfg.minGap}px · 居中 ${cfg.centerTol}px · 边距容差 ${cfg.marginTol}px\n`,
);
oks.forEach((o) => console.log(o));
warns.forEach((w) => console.log(w));
errors.forEach((e) => console.log(e));
if (errors.length) process.exit(1);
