/**
 * PROJECT.md / 登记区的公共解析件（零依赖）。
 *
 * 供 check-artifact-paths / check-rules / check-uat-readiness / sync-prd-version 共用，
 * 让四者对「占位符」「代码块」「表格」的口径完全一致 —— 分成四份就一定会有一份漏改。
 * §3「可写路径」列的解析（pathsInCell）与通配编译（globToRegExp）也在这里：前者把单元格切成
 * 路径表、后者把通配编译成正则。落点放行与越界归属必须共用同一份实现 ——
 * 分开写就会出现「同一个文件在两道门禁里有两个归属」。
 *
 * 两条硬口径（纵深防御，不靠模板自觉）：
 *   ① 含 `<` 或 `>` 的值一律视为**未配置**（回落默认值 / 走缺配置分支）——
 *      否则模板里没被替换的 `<目录>`、`<正则>` 会变成真配置。
 *   ② ``` / ~~~ 围栏代码块内部**不参与解析** —— 模板把示例搬进代码块后，
 *      块里的示例路径绝不能被当成表格行 / 配置行读进来。
 */

/** 占位符判据：含 `<` 或 `>` 即视为没填。 */
export function isPlaceholder(v) {
  return typeof v === "string" && /[<>]/.test(v);
}

export function escapeRe(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/** 读 markdown 的某个二级小节正文（到下一个同级/更高级标题为止）。 */
export function readSection(text, match) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    if (!match(level, m[2].trim())) continue;
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const h = /^(#{1,6})\s+/.exec(lines[j]);
      if (h && h[1].length <= level) break;
      body.push(lines[j]);
    }
    return { title: m[2].trim(), body: body.join("\n") };
  }
  return null;
}

/** 是否是第 n 节的标题（排除 `n.1` 这类子节）。 */
export function isNumberedSection(n, title) {
  return new RegExp(`^${n}([.、\\s:：]|$)`).test(title) && !new RegExp(`^${n}\\.\\d`).test(title);
}

/* ------------------------------------------------------------------ *
 * 双语锚点（见 docs/I18N.md §3）
 *
 * 口径：**机器认标记，人读文字**。模板在关键小节标题上方放 HTML 注释标记，
 * 门禁优先按标记定位；标记缺失（存量仓库 / 人手改过的文件）才回退标题别名。
 * 任何新增锚点都必须同时给「标记 + 中文别名 + 英文别名」，只加中文等于没做完。
 * ------------------------------------------------------------------ */

/** HTML 注释标记：不得翻译、不得改写。 */
export const MARKER = {
  ownerTable: "<!-- process:owner-table -->",
  registry: "<!-- process:registry -->",
};

/** 二级小节标题匹配器（标记缺失时的兜底；中英都认）。 */
export const SECTION = {
  /** §3 产物属主表 / Artifact ownership */
  ownerTable: (level, title) =>
    level === 2 && (isNumberedSection(3, title) || title.includes("产物属主") || /ownership/i.test(title)),
  /** §4 项目配置 / Project config */
  projectConfig: (level, title) =>
    level === 2 && (isNumberedSection(4, title) || title.includes("项目配置") || /project\s+config/i.test(title)),
  /** §5 UAT 前置自检 / UAT preflight */
  uatPreflight: (level, title) =>
    level === 2 && (isNumberedSection(5, title) || title.includes("UAT 前置") || /UAT\s+preflight/i.test(title)),
  /** §4 规则表（check-rules 的规则台账总表约定） */
  rulesTable: (level, title) =>
    level === 2 && (isNumberedSection(4, title) || title.includes("规则表") || /rules?\s+table/i.test(title)),
};

/** 表头列别名：属主表的「可写路径」列。 */
export const HEADER = {
  writablePaths: /可写路径|writable\s*paths?/i,
};

/** 登记区标题（两种语言，大小写不敏感）。 */
export const REGISTRY_HEADINGS = ["登记区", "registry"];

/** 按标记定位小节；标记缺失时回退到标题匹配器。 */
export function readMarkedSection(text, marker, fallbackMatch) {
  const lines = text.split(/\r?\n/);
  const at = typeof marker === "string" && marker !== "" ? lines.findIndex((line) => line.includes(marker)) : -1;
  if (at >= 0) {
    for (let i = at + 1; i < lines.length; i += 1) {
      const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
      if (!m) continue;
      const level = m[1].length;
      const body = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const h = /^(#{1,6})\s+/.exec(lines[j]);
        if (h && h[1].length <= level) break;
        body.push(lines[j]);
      }
      return { title: m[2].trim(), body: body.join("\n") };
    }
  }
  return readSection(text, fallbackMatch);
}

/**
 * 配置键别名表：`CONFIG_KEYS.<用途>` ⇒ `[中文键, English key]`。
 *
 * 脚本一律用这里的用途名取键，**不再散落中文字面量** —— 散落就会出现
 * 「一个脚本改了英文别名、另一个没改」的半双语状态。
 */
export const CONFIG_KEYS = {
  // §4 项目配置
  testScanDirs: ["测试扫描目录", "Test scan dirs"],
  testSuffixes: ["测试文件后缀", "Test file suffixes"],
  flowTestDirs: ["流程测试目录", "Flow test dirs"],
  packageTestDirs: ["需求包测试目录", "Package test dirs"],
  importAllowlist: ["import 白名单", "Import allowlist"],
  automationTypes: ["自动化类型", "Automation types"],
  caseCarrierTypes: ["@case 载体类型", "@case carrier types"],
  junitDirs: ["junit 测试目录", "JUnit test dirs"],
  pendingPatterns: ["待裁定字样", "Pending-decision patterns"],
  rulesDir: ["台账目录", "Rules dir"],
  prdDir: ["PRD 目录", "PRD dir"],
  registryFile: ["登记区文件", "Registry file"],
  uiProjectTokens: ["UI 项目令牌", "UI project tokens"],
  uiPrototypesDir: ["UI 原型目录", "UI prototypes dir"],
  // §5 UAT 前置自检
  coreBackend: ["core 后端", "Core backend"],
  webFrontend: ["web 前端", "Web frontend"],
  mobile: ["移动端", "Mobile"],
  uatAccount: ["验收账号", "UAT account"],
  uatPassword: ["验收口令", "UAT password"],
  targetEndpoints: ["目标端点", "Target endpoints"],
  apiPrefix: ["端点前缀", "API prefix"],
  loginPath: ["登录路径", "Login path"],
  tokenField: ["令牌字段", "Token field"],
  deviceCdp: ["真机 CDP", "Device CDP"],
  checklistDir: ["清单目录", "Checklist dir"],
  evidenceDir: ["证据目录", "Evidence dir"],
};

/** 取别名表里的全部写法（去重、保序）。 */
export function keyAliases(key) {
  if (Array.isArray(key)) return key.filter((k) => typeof k === "string" && k !== "");
  if (typeof key === "string" && key !== "") return [key];
  return [];
}

/** 键名归一化：去反引号/加粗、折叠空白、大小写不敏感（中英一致口径）。 */
function normKey(value) {
  return String(value ?? "")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 抹掉围栏代码块（含围栏行本身），返回剩余正文。 */
export function stripFencedBlocks(body) {
  const out = [];
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (m) {
        fence = m[1][0];
        continue;
      }
      out.push(line);
    } else if (m && m[1][0] === fence) {
      fence = null;
    }
  }
  return out.join("\n");
}

/**
 * 从某小节取配置值：支持 `| 配置项 | 值 |` 表格行与 `- 配置项：值` 行。
 *
 * `key` 可以是单个键名，也可以是别名数组（如 `CONFIG_KEYS.registryFile`），
 * 任一写法命中即取；键名比较**大小写不敏感、空白折叠**（中文键不受影响）。
 * 占位符单元格按「未配置」返回 null（调用方自然回落到内置默认值）。
 */
export function configValue(sec, key) {
  if (!sec) return null;
  const aliases = keyAliases(key).map(normKey);
  if (aliases.length === 0) return null;
  for (const line of stripFencedBlocks(sec.body).split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("|")) {
      const cells = t
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
      if (cells.length >= 2 && aliases.includes(normKey(cells[0]))) {
        return isPlaceholder(cells[1]) ? null : cells[1];
      }
      continue;
    }
    for (const alias of keyAliases(key)) {
      const m = new RegExp(`^\\s*[-*]?\\s*\\**${escapeRe(alias)}\\**\\s*[:：]\\s*(.+)$`).exec(t);
      if (m) return isPlaceholder(m[1]) ? null : m[1];
    }
  }
  return null;
}

/** 把配置值切成列表：去反引号，按中英文分隔符切分，丢弃占位项。 */
export function parseList(v) {
  if (v === null || v === undefined) return null;
  const parts = v
    .replace(/\*\*/g, "")
    .split(/[、,，;；]+|\s+/)
    .map((s) => s.replace(/`/g, "").trim())
    .filter(Boolean)
    .filter((s) => !isPlaceholder(s));
  return parts.length > 0 ? parts : null;
}

/** 取标量配置值：去反引号，取第一个分隔项；占位符按未配置返回 null。 */
export function scalarValue(v) {
  if (v === null || v === undefined) return null;
  const t = v.replace(/\*\*/g, "").replace(/`/g, "").trim();
  const first = t.split(/[、,，;；\s]+/).filter(Boolean)[0];
  return first === undefined || isPlaceholder(first) ? null : first;
}

/** 解析 markdown 表格为行列数组（跳过对齐分隔行与代码块内部）。 */
export function parseTable(body) {
  const rows = [];
  for (const line of stripFencedBlocks(body).split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const cells = t
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.every((c) => c === "" || /^:?-{2,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

/**
 * 从一个单元格里抽出路径候选：优先反引号，其次按分隔符切分；占位符不返回。
 * 供 §3 属主表的「可写路径」列共用（check-artifact-paths 用它算「能否写入」，
 * check-rules 用它算「归谁」）—— 两处口径必须一致，否则同一个文件在两道门禁里会有两个归属。
 */
export function pathsInCell(cell) {
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

/**
 * 把路径通配（支持 `**`）编译为正则：`**` 跨目录、`*` 不跨。
 * 与 pathsInCell 同属一回：一处解析路径、一处解析通配，分家就会出现「放行口径 ≠ 归属口径」。
 */
export function globToRegExp(glob) {
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
