#!/usr/bin/env node
/**
 * check-ui-prototype.mjs — UI 原型「HTML 交付」门禁（零依赖）
 *
 * `uiDesign: required` 的包必须交可打开的 HTML 原型，而不是 PNG / PSD：
 *   ① ui-spec 存在且含 UI-NN；
 *   ② prototypes/<ID>/index.html 存在，含 doctype 与 viewport；
 *   ③ 每个 UI-NN 在 HTML 里有 data-ui，且没有规格外 data-ui；
 *   ④ handoff.md 存在，含 UI-NN → 选择器交接表，且覆盖全部 UI-NN；
 *   ⑤ 不引用外部网络；本地 href/src 目标真实存在。
 *
 * 只判交接完整性；审美、渲染、状态好不好仍归人和 UAT。
 *
 * 检查项名字也走 `msg(中文, English)` 成对取词：英文仓库只出现英文，中文仓库只出现中文。
 *
 * 用法：node scripts/process/check-ui-prototype.mjs --pkg <ID> [--root .]
 * 退出码：0 = 通过（可有 ⚠）；1 = 有 ❌；2 = 用法 / 前置失败。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { CONFIG_KEYS, SECTION, configValue, readSection, scalarValue } from './project-config.mjs';
import { detectLangFromRepo, makeMsg, resolveLang } from './i18n.mjs';

/**
 * 用法：`--help` 与参数报错直接给**双语两行**（英文一行 + 中文一行）——
 * 这时还没解析出 `--root`，无从判定仓库语言，索性两句都给。
 */
const USAGE =
	'Usage: node check-ui-prototype.mjs [--root <repo root>] [--pkg <ID>] [--prototypes <dir>] [--spec <dir>]\n' +
	'用法: node check-ui-prototype.mjs [--root <仓库根>] [--pkg <ID>] [--prototypes <目录>] [--spec <目录>]';

/**
 * 取词器：`msg(中文, English)`。`--root` 解析出来之前先按 cwd 推断语言，
 * `root` 确定后立刻切成仓库语言（双语文档见 docs/I18N.md）。
 */
let msg = makeMsg(detectLangFromRepo(process.cwd()));

/**
 * 参数阶段的取词：`argsOf` 报错时 `root` 还没定。
 * 能从 argv 里看出 `--root` 就先按它判语言，否则按 cwd（**走完整优先级**，不只文档推断）——
 * 否则英文仓库里打错一个参数就会蹦出中文提示。
 */
function langForArgs(argv) {
	const i = argv.findIndex((a) => a === '--root' || a.startsWith('--root='));
	const raw = i < 0 ? null : argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1];
	return resolveLang(raw ? resolve(raw) : process.cwd());
}

const results = [];
const ok = (name, detail = '') => results.push({ level: 'ok', name, detail });
const warn = (name, detail = '') => results.push({ level: 'warn', name, detail });
const fail = (name, detail = '') => results.push({ level: 'fail', name, detail });

function argsOf(argv) {
	const out = { root: '.', pkg: null, prototypes: 'docs/process/prototypes', spec: 'docs/process/prd' };
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '-h' || a === '--help') {
			console.log(USAGE);
			process.exit(0);
		}
		const kv = /^--(root|pkg|prototypes|spec)=(.*)$/.exec(a);
		if (kv) {
			out[kv[1]] = kv[2];
			continue;
		}
		if (['--root', '--pkg', '--prototypes', '--spec'].includes(a)) {
			if (!argv[i + 1]) {
				msg = makeMsg(langForArgs(argv));
				console.error(msg(`缺少 ${a} 的值\n${USAGE}`, `missing value for ${a}\n${USAGE}`));
				process.exit(2);
			}
			out[a.slice(2)] = argv[++i];
			continue;
		}
		msg = makeMsg(langForArgs(argv));
		console.error(msg(`未知参数：${a}\n${USAGE}`, `unknown argument: ${a}\n${USAGE}`));
		process.exit(2);
	}
	return out;
}

const textOf = (f) => {
	try {
		return readFileSync(f, 'utf8');
	} catch {
		return null;
	}
};

const args = argsOf(process.argv.slice(2));
const root = resolve(args.root);
// root 已确定 ⇒ 立刻按仓库语言取词（环境变量 / .process-kit.json / PROJECT.md frontmatter / 文档推断）
msg = makeMsg(resolveLang(root));
let label = args.pkg ?? msg('（自动）', '(auto)');

/** 核对件的权威判据：frontmatter `kind: requirement-check`（中英一致，见 docs/I18N.md §2）。 */
const REQUIREMENT_CHECK_FM = /^kind:\s*requirement-check\s*$/m;

/**
 * 是否是需求核对件。
 * 权威判据是 frontmatter `kind: requirement-check`；文件名只作存量兜底：
 * 中文「…需求核对件.md」与英文「…-check.md」/「…-checklist.md」都认。
 * 模板（`_` 开头）一律排除 —— 英文后缀 `-check` 会把 `_CHECK_TEMPLATE.md` 误认成核对件。
 */
function isChecklistFile(dir, f) {
	if (!f.endsWith('.md') || f.startsWith('_')) return false;
	if (REQUIREMENT_CHECK_FM.test(textOf(join(dir, f)) ?? '')) return true;
	return /(?:核对件|-check(?:list)?)\.md$/i.test(f);
}

function checklistFile() {
	const dir = join(root, 'docs/process/input');
	if (!existsSync(dir)) return null;
	const files = readdirSync(dir).filter((f) => isChecklistFile(dir, f));
	if (args.pkg) return files.find((f) => f.startsWith(`${args.pkg}-`)) ? join(dir, files.find((f) => f.startsWith(`${args.pkg}-`))) : null;
	const required = files.filter((f) => /^uiDesign:\s*required\s*$/m.test(textOf(join(dir, f)) ?? ''));
	if (required.length === 1) return join(dir, required[0]);
	if (required.length > 1) {
		console.error(
			msg(
				`找到多个 requirement check（uiDesign: required），请用 --pkg 指定：${required.join(' / ')}`,
				`multiple requirement checks with uiDesign: required; pick one with --pkg: ${required.join(' / ')}`,
			),
		);
		process.exit(2);
	}
	return null;
}

const checklist = checklistFile();
if (!checklist) {
	if (args.pkg) {
		fail(
			msg('适用性', 'applicability'),
			msg(
				`未找到 ${args.pkg} 的核对件（--pkg 指定了包，不能静默跳过）`,
				`no requirement check found for ${args.pkg} (--pkg names a package, so it must not be skipped silently)`,
			),
		);
	}
	else ok(msg('适用性', 'applicability'), msg('未发现 uiDesign: required 的包，跳过', 'no package with uiDesign: required found, skipped'));
	print();
}
const checklistText = textOf(checklist) ?? '';
if (!/^uiDesign:\s*required\s*$/m.test(checklistText)) {
	ok(
		msg('适用性', 'applicability'),
		msg(
			`${args.pkg ?? msg('本包', 'this package')} 的 uiDesign 不是 required，跳过`,
			`uiDesign is not required for ${args.pkg ?? msg('本包', 'this package')}, skipped`,
		),
	);
	print();
}
const id = args.pkg ?? (/^id:\s*([A-Za-z0-9_-]+)\s*$/m.exec(checklistText) ?? [])[1];
if (!id) {
	console.error(msg('无法从核对件读出包 ID，请用 --pkg 指定。', 'cannot read the package ID from the requirement check; specify it with --pkg.'));
	process.exit(2);
}
label = args.pkg ?? id;

// 允许项目在 PROJECT.md §4 改「UI 原型目录 / UI prototypes dir」；模板占位符不生效（docs/I18N.md §3）。
// 键名走 CONFIG_KEYS 别名（中英都认），表格行与 `- 键：值` 两种写法都读；缺行 / 占位符 / 目录不存在 ⇒ 用默认值。
const project = textOf(join(root, 'docs/process/PROJECT.md')) ?? '';
const configured = scalarValue(
	configValue(readSection(project, SECTION.projectConfig), CONFIG_KEYS.uiPrototypesDir),
);
if (args.prototypes === 'docs/process/prototypes' && configured && !/[<>]/.test(configured) && existsSync(join(root, configured))) {
	args.prototypes = configured;
}

const specPath = join(root, args.spec, `${id}-ui-spec.md`);
const spec = textOf(specPath);
if (!spec) {
	fail(msg('① UI 规格', '① UI spec'), msg(`缺少 ${specPath}`, `missing ${specPath}`));
	print();
}
const uiIds = [...new Set([...spec.matchAll(/\bUI-\d{2,}\b/g)].map((m) => m[0]))].sort();
if (!uiIds.length) {
	fail(msg('① UI 规格', '① UI spec'), msg(`${specPath} 里没有 UI-NN`, `no UI-NN in ${specPath}`));
	print();
}
ok(msg('① UI 规格', '① UI spec'), msg(`${uiIds.length} 条 UI-NN`, `${uiIds.length} UI-NN`));

const protoDir = join(root, args.prototypes, id);
const htmlPath = join(protoDir, 'index.html');
const html = textOf(htmlPath);
if (!html) {
	fail(
		msg('② HTML 入口', '② HTML entry'),
		msg(`缺少 ${htmlPath}（PNG/PSD 不能替代可打开的 HTML）`, `missing ${htmlPath} (PNG/PSD cannot replace an openable HTML)`),
	);
	print();
}
if (!/^\s*<!doctype\s+html/i.test(html)) fail(msg('② HTML 入口', '② HTML entry'), msg('缺少 <!doctype html>', 'missing <!doctype html>'));
else ok(msg('② HTML 入口', '② HTML entry'), msg('index.html 存在且含 doctype', 'index.html exists and has a doctype'));
if (!/<meta\s+[^>]*name\s*=\s*["']viewport["']/i.test(html)) fail(msg('② 视口', '② viewport'), msg('缺少 viewport meta', 'missing the viewport meta'));
else ok(msg('② 视口', '② viewport'), msg('含 viewport meta', 'has the viewport meta'));

const dataUi = [...new Set([...html.matchAll(/data-ui\s*=\s*["']([^"']+)["']/g)].map((m) => m[1].trim()))].sort();
const missing = uiIds.filter((x) => !dataUi.includes(x));
const extra = dataUi.filter((x) => !uiIds.includes(x));
if (missing.length) fail(msg('③ data-ui 覆盖', '③ data-ui coverage'), msg(`HTML 缺 ${missing.join(' / ')}`, `HTML is missing ${missing.join(' / ')}`));
else ok(msg('③ data-ui 覆盖', '③ data-ui coverage'), msg(`${dataUi.length} 个 data-ui 覆盖全部 UI-NN`, `${dataUi.length} data-ui marker(s) cover every UI-NN`));
if (extra.length) {
	fail(
		msg('③ data-ui 越界', '③ unexpected data-ui'),
		msg(`HTML 有规格外 data-ui：${extra.join(' / ')}`, `HTML has data-ui outside the spec: ${extra.join(' / ')}`),
	);
}

const handoffPath = join(protoDir, 'handoff.md');
const handoff = textOf(handoffPath);
if (!handoff) {
	fail(
		msg('④ 交接表', '④ handoff table'),
		msg(`缺少 ${handoffPath}（dev 没有交接表无法无歧义落地）`, `missing ${handoffPath} (without a handoff table dev cannot land it unambiguously)`),
	);
} else {
	const uncovered = uiIds.filter((x) => !handoff.includes(x));
	if (uncovered.length) fail(msg('④ 交接表', '④ handoff table'), msg(`handoff.md 未覆盖 ${uncovered.join(' / ')}`, `handoff.md does not cover ${uncovered.join(' / ')}`));
	else ok(msg('④ 交接表', '④ handoff table'), msg(`${uiIds.length} 条 UI-NN 均有交接`, `all ${uiIds.length} UI-NN are handed off`));
	if (!/\|\s*UI-NN\s*\|/i.test(handoff) || !(/选择器/.test(handoff) || /selector/i.test(handoff))) {
		fail(
			msg('④ 交接表', '④ handoff table'),
			msg('缺「| UI-NN | … | 选择器 |」表头', 'missing the "| UI-NN | … | selector |" header'),
		);
	}
	else ok(msg('④ 交接表结构', '④ handoff table shape'), msg('含 UI-NN / 选择器表头', 'has the UI-NN / selector header'));
}

const files = [];
(function walk(dir) {
	if (!existsSync(dir)) return;
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) {
			if (name !== 'node_modules') walk(p);
		} else if (['.html', '.css', '.js', '.mjs', '.svg'].includes(extname(name).toLowerCase())) files.push(p);
	}
})(protoDir);

const external = (v) => /^(?:https?:)?\/\//i.test(v) && !/^https?:\/\/www\.w3\.org\//i.test(v);
let externalHits = 0;
for (const f of files) {
	const t = textOf(f) ?? '';
	for (const m of t.matchAll(/https?:\/\/[^\s"'<>)]+/gi)) {
		if (!external(m[0])) continue;
		externalHits += 1;
		fail(
			msg('⑤ 外部资源', '⑤ external resources'),
			msg(
				`${f.slice(root.length + 1)} 引用外部 URL：${m[0].slice(0, 80)}`,
				`${f.slice(root.length + 1)} references an external URL: ${m[0].slice(0, 80)}`,
			),
		);
	}
	for (const m of t.matchAll(/(?:src|href)\s*=\s*["']((?:https?:)?\/\/[^"']+)/gi)) {
		if (!external(m[1])) continue;
		externalHits += 1;
		fail(
			msg('⑤ 外部资源', '⑤ external resources'),
			msg(
				`${f.slice(root.length + 1)} 引用外部 URL：${m[1].slice(0, 80)}`,
				`${f.slice(root.length + 1)} references an external URL: ${m[1].slice(0, 80)}`,
			),
		);
	}
	for (const m of t.matchAll(/url\(\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi)) {
		if (!external(m[1])) continue;
		externalHits += 1;
		fail(
			msg('⑤ 外部资源', '⑤ external resources'),
			msg(
				`${f.slice(root.length + 1)} 引用外部 URL：${m[1].slice(0, 80)}`,
				`${f.slice(root.length + 1)} references an external URL: ${m[1].slice(0, 80)}`,
			),
		);
	}
}
if (!externalHits) ok(msg('⑤ 外部资源', '⑤ external resources'), msg('未发现外部网络引用', 'no external network reference found'));

const broken = [];
for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
	const v = m[1].trim();
	if (!v || /^(#|data:|mailto:|tel:|javascript:)/i.test(v) || external(v) || /^https?:\/\//i.test(v)) continue;
	const clean = v.split(/[?#]/)[0];
	if (clean && !existsSync(resolve(dirname(htmlPath), clean))) broken.push(v);
}
if (broken.length) {
	fail(msg('⑤ 本地链接', '⑤ local links'), msg(`HTML 引用的本地文件不存在：${broken.join(' / ')}`, `local files referenced by the HTML do not exist: ${broken.join(' / ')}`));
}
else ok(msg('⑤ 本地链接', '⑤ local links'), msg('href/src 本地目标均存在', 'every local href/src target exists'));

if (!/data-state\s*=/.test(html)) {
	warn(
		msg('状态切换', 'state switching'),
		msg(
			'HTML 未出现 data-state；状态矩阵非空时请提供 ?state= 或切换器',
			'HTML has no data-state; if the state matrix is non-empty, provide ?state= or a switcher',
		),
	);
}
else ok(msg('状态切换', 'state switching'), msg('HTML 含 data-state 标记', 'HTML carries data-state markers'));
if (!/data-testid\s*=/.test(html)) {
	warn(
		msg('测试钩子', 'test hooks'),
		msg(
			'HTML 未出现 data-testid；建议与 data-ui 同时给出稳定测试钩子',
			'HTML has no data-testid; provide a stable test hook together with data-ui',
		),
	);
}
else ok(msg('测试钩子', 'test hooks'), msg('HTML 含 data-testid', 'HTML carries data-testid'));

print();

function print() {
	console.log(msg(`\nUI 原型门禁：${label}`, `\nUI prototype gate: ${label}`));
	for (const r of results) {
		const mark = r.level === 'ok' ? '✓' : r.level === 'warn' ? '⚠' : '❌';
		console.log(`  ${mark} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
	}
	const n = { ok: 0, warn: 0, fail: 0 };
	for (const r of results) n[r.level] += 1;
	console.log(
		msg(
			`\n结果：${n.ok} ✓ / ${n.warn} ⚠ / ${n.fail} ❌`,
			`\nresult: ${n.ok} ✓ / ${n.warn} ⚠ / ${n.fail} ❌`,
		),
	);
	process.exit(n.fail ? 1 : 0);
}
