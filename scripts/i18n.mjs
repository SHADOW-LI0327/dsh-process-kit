/**
 * 语言判定与取词（零依赖，同步实现）。
 *
 * 双语的**唯一入口**：门禁脚本 / journal 工具 / 版本同步工具都从这里取「这个仓库用哪种语言」，
 * 免得每个脚本各写一套推断，出现「落点门禁说英文、台账门禁说中文」的分裂。
 *
 * 判定优先级（见 docs/I18N.md §1）：
 *   ① `PROCESS_KIT_LANG` 环境变量（显式覆盖，进程级）
 *   ② `docs/process/.process-kit.json` 的 `lang`（process_init 写入，仓库级真源）
 *   ③ `docs/process/PROJECT.md` 的 frontmatter `lang`（人改语言走这里）
 *   ④ 按 `AGENTS.md` / `README.md` 的 CJK 占比自动推断
 *   ⑤ 都没有 ⇒ `zh`（存量仓库零变化）
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 受支持的语言（只这两种；加语言要同时加模板与别名表）。 */
export const LANGS = ["zh", "en"];

/** 归一化语言取值：只认 zh / en，其余返回 null。 */
export function parseLang(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "zh" || v === "zh-cn" || v === "zh-hans" || v === "cn" || v === "chinese") return "zh";
  if (v === "en" || v === "en-us" || v === "en-gb" || v === "english") return "en";
  return null;
}

/**
 * 按文本的 CJK 占比推断语言。
 *
 * 判据：CJK 字符数 / 非空白字符数 ≥ 2% 即判 zh —— 技术英文文档里几乎不会出现汉字，
 * 而中文技术文档的汉字占比通常远超 2%（正文夹大量路径 / 代码也仍然远超）。
 */
export function detectLangFromText(text) {
  if (typeof text !== "string" || text === "") return null;
  const body = text.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, "");
  if (body === "") return null;
  const cjk = (body.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
  if (cjk === 0) return "en";
  return cjk / body.length >= 0.02 ? "zh" : "en";
}

/** 读文件；不存在或读失败返回 null。 */
function readMaybe(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** 取 markdown frontmatter 里的扁平 `key: value`（只认文件前 15 行）。 */
function frontmatterValue(text, key) {
  if (typeof text !== "string") return null;
  const lines = text.split(/\r?\n/);
  const limit = Math.min(lines.length, 15);
  let open = -1;
  for (let i = 0; i < limit; i += 1) {
    if (/^---\s*$/.test(lines[i])) {
      open = i;
      break;
    }
  }
  if (open === -1) return null;
  for (let i = open + 1; i < lines.length; i += 1) {
    if (/^---\s*$/.test(lines[i])) return null;
    const m = new RegExp(`^${key}\\s*:\\s*(.+?)\\s*(?:#.*)?$`).exec(lines[i]);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

/** 从 `docs/process/.process-kit.json` 读 `lang`。 */
export function langFromManifest(root, processRel = "docs/process") {
  const text = readMaybe(join(root, processRel, ".process-kit.json"));
  if (text === null) return null;
  try {
    const json = JSON.parse(text);
    return parseLang(json?.lang);
  } catch {
    return null;
  }
}

/** 从 `docs/process/PROJECT.md` frontmatter 读 `lang` / `locale`。 */
export function langFromProject(root, processRel = "docs/process") {
  const text = readMaybe(join(root, processRel, "PROJECT.md"));
  if (text === null) return null;
  return parseLang(frontmatterValue(text, "lang")) ?? parseLang(frontmatterValue(text, "locale"));
}

/**
 * 按仓库现有文档推断语言：`AGENTS.md` 优先（它最贴近「这个仓库跟 AI 用什么语言对话」），
 * 其次 `README.md`。两者都读不到或都无判据 ⇒ null。
 */
export function detectLangFromRepo(root) {
  for (const rel of ["AGENTS.md", ".dsh/AGENTS.md", "README.md"]) {
    const text = readMaybe(join(root, rel));
    const lang = detectLangFromText(text);
    if (lang !== null) return lang;
  }
  return null;
}

/** 解析仓库语言：优先级见文件头；**永不返回 null**（回退 zh）。 */
export function resolveLang(root, options = {}) {
  const explicit = parseLang(options.env ?? process.env.PROCESS_KIT_LANG);
  if (explicit !== null) return explicit;
  if (typeof root === "string" && root !== "") {
    const processRel = options.processRel ?? "docs/process";
    return langFromManifest(root, processRel) ?? langFromProject(root, processRel) ?? detectLangFromRepo(root) ?? "zh";
  }
  return detectLangFromRepo(process.cwd()) ?? "zh";
}

/**
 * 取词器：`msg("中文", "English")` 按语言取一条。
 *
 * 刻意做成**成对字面量**而不是 key 字典：
 *   - 成对写在一起，漏译在 diff 里一眼可见（key 字典最容易出现「加了一边忘了另一边」）；
 *   - 门禁脚本要保持零依赖单文件可读，不必跨文件跳转；
 *   - 变量插值直接用模板字符串，不需要额外的占位符运行时。
 */
export function makeMsg(lang) {
  const en = parseLang(lang) === "en";
  return (zh, english) => (en ? english : zh);
}

/** 工具函数：`lang === "en"` 的短写法。 */
export const isEn = (lang) => parseLang(lang) === "en";
