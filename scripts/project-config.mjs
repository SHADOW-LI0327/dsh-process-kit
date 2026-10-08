/**
 * PROJECT.md / 登记区的公共解析件（零依赖）。
 *
 * 供 check-artifact-paths / check-rules / check-uat-readiness / sync-prd-version 共用，
 * 让四者对「占位符」「代码块」「表格」的口径完全一致 —— 分成四份就一定会有一份漏改。
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
 * 占位符单元格按「未配置」返回 null（调用方自然回落到内置默认值）。
 */
export function configValue(sec, key) {
  if (!sec) return null;
  for (const line of stripFencedBlocks(sec.body).split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("|")) {
      const cells = t
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
      if (cells.length >= 2 && cells[0].replace(/[*`]/g, "") === key) {
        return isPlaceholder(cells[1]) ? null : cells[1];
      }
      continue;
    }
    const m = new RegExp(`^\\s*[-*]?\\s*\\**${escapeRe(key)}\\**\\s*[:：]\\s*(.+)$`).exec(t);
    if (m) return isPlaceholder(m[1]) ? null : m[1];
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
