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
 * 用法：node scripts/process/check-ui-prototype.mjs --pkg <ID> [--root .]
 * 退出码：0 = 通过（可有 ⚠）；1 = 有 ❌；2 = 用法 / 前置失败。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const USAGE = '用法: node check-ui-prototype.mjs [--root <仓库根>] [--pkg <ID>] [--prototypes <目录>] [--spec <目录>]';
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
				console.error(`缺少 ${a} 的值\n${USAGE}`);
				process.exit(2);
			}
			out[a.slice(2)] = argv[++i];
			continue;
		}
		console.error(`未知参数：${a}\n${USAGE}`);
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
let label = args.pkg ?? '（自动）';

function checklistFile() {
	const dir = join(root, 'docs/process/input');
	if (!existsSync(dir)) return null;
	const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f.includes('核对件'));
	if (args.pkg) return files.find((f) => f.startsWith(`${args.pkg}-`)) ? join(dir, files.find((f) => f.startsWith(`${args.pkg}-`))) : null;
	const required = files.filter((f) => /^uiDesign:\s*required\s*$/m.test(textOf(join(dir, f)) ?? ''));
	if (required.length === 1) return join(dir, required[0]);
	if (required.length > 1) {
		console.error(`找到多个 uiDesign: required 的包，请用 --pkg 指定：${required.join(' / ')}`);
		process.exit(2);
	}
	return null;
}

const checklist = checklistFile();
if (!checklist) {
	if (args.pkg) fail('适用性', `未找到 ${args.pkg} 的核对件（--pkg 指定了包，不能静默跳过）`);
	else ok('适用性', '未发现 uiDesign: required 的包，跳过');
	print();
}
const checklistText = textOf(checklist) ?? '';
if (!/^uiDesign:\s*required\s*$/m.test(checklistText)) {
	ok('适用性', `${args.pkg ?? '本包'} 的 uiDesign 不是 required，跳过`);
	print();
}
const id = args.pkg ?? (/^id:\s*([A-Za-z0-9_-]+)\s*$/m.exec(checklistText) ?? [])[1];
if (!id) {
	console.error('无法从核对件读出包 ID，请用 --pkg 指定。');
	process.exit(2);
}
label = args.pkg ?? id;

// 允许项目在 PROJECT.md §5 改「UI 原型目录」；模板占位符不生效。
const project = textOf(join(root, 'docs/process/PROJECT.md')) ?? '';
const configured = /^\|\s*UI 原型目录\s*\|\s*`([^`]+)`/m.exec(project);
if (args.prototypes === 'docs/process/prototypes' && configured && !/[<>]/.test(configured[1]) && existsSync(join(root, configured[1]))) {
	args.prototypes = configured[1];
}

const specPath = join(root, args.spec, `${id}-ui-spec.md`);
const spec = textOf(specPath);
if (!spec) {
	fail('① UI 规格', `缺少 ${specPath}`);
	print();
}
const uiIds = [...new Set([...spec.matchAll(/\bUI-\d{2,}\b/g)].map((m) => m[0]))].sort();
if (!uiIds.length) {
	fail('① UI 规格', `${specPath} 里没有 UI-NN`);
	print();
}
ok('① UI 规格', `${uiIds.length} 条 UI-NN`);

const protoDir = join(root, args.prototypes, id);
const htmlPath = join(protoDir, 'index.html');
const html = textOf(htmlPath);
if (!html) {
	fail('② HTML 入口', `缺少 ${htmlPath}（PNG/PSD 不能替代可打开的 HTML）`);
	print();
}
if (!/^\s*<!doctype\s+html/i.test(html)) fail('② HTML 入口', '缺少 <!doctype html>');
else ok('② HTML 入口', 'index.html 存在且含 doctype');
if (!/<meta\s+[^>]*name\s*=\s*["']viewport["']/i.test(html)) fail('② viewport', '缺少 viewport meta');
else ok('② viewport', '含 viewport meta');

const dataUi = [...new Set([...html.matchAll(/data-ui\s*=\s*["']([^"']+)["']/g)].map((m) => m[1].trim()))].sort();
const missing = uiIds.filter((x) => !dataUi.includes(x));
const extra = dataUi.filter((x) => !uiIds.includes(x));
if (missing.length) fail('③ data-ui 覆盖', `HTML 缺 ${missing.join(' / ')}`);
else ok('③ data-ui 覆盖', `${dataUi.length} 个 data-ui 覆盖全部 UI-NN`);
if (extra.length) fail('③ data-ui 越界', `HTML 有规格外 data-ui：${extra.join(' / ')}`);

const handoffPath = join(protoDir, 'handoff.md');
const handoff = textOf(handoffPath);
if (!handoff) fail('④ 交接表', `缺少 ${handoffPath}（dev 没有交接表无法无歧义落地）`);
else {
	const uncovered = uiIds.filter((x) => !handoff.includes(x));
	if (uncovered.length) fail('④ 交接表', `handoff.md 未覆盖 ${uncovered.join(' / ')}`);
	else ok('④ 交接表', `${uiIds.length} 条 UI-NN 均有交接`);
	if (!/\|\s*UI-NN\s*\|/i.test(handoff) || !/选择器/.test(handoff)) fail('④ 交接表', '缺「| UI-NN | … | 选择器 |」表头');
	else ok('④ 交接表结构', '含 UI-NN / 选择器表头');
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
		fail('⑤ 外部资源', `${f.slice(root.length + 1)} 引用外部 URL：${m[0].slice(0, 80)}`);
	}
	for (const m of t.matchAll(/(?:src|href)\s*=\s*["']((?:https?:)?\/\/[^"']+)/gi)) {
		if (!external(m[1])) continue;
		externalHits += 1;
		fail('⑤ 外部资源', `${f.slice(root.length + 1)} 引用外部 URL：${m[1].slice(0, 80)}`);
	}
	for (const m of t.matchAll(/url\(\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi)) {
		if (!external(m[1])) continue;
		externalHits += 1;
		fail('⑤ 外部资源', `${f.slice(root.length + 1)} 引用外部 URL：${m[1].slice(0, 80)}`);
	}
}
if (!externalHits) ok('⑤ 外部资源', '未发现外部网络引用');

const broken = [];
for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
	const v = m[1].trim();
	if (!v || /^(#|data:|mailto:|tel:|javascript:)/i.test(v) || external(v) || /^https?:\/\//i.test(v)) continue;
	const clean = v.split(/[?#]/)[0];
	if (clean && !existsSync(resolve(dirname(htmlPath), clean))) broken.push(v);
}
if (broken.length) fail('⑤ 本地链接', `HTML 引用的本地文件不存在：${broken.join(' / ')}`);
else ok('⑤ 本地链接', 'href/src 本地目标均存在');

if (!/data-state\s*=/.test(html)) warn('状态切换', 'HTML 未出现 data-state；状态矩阵非空时请提供 ?state= 或切换器');
else ok('状态切换', 'HTML 含 data-state 标记');
if (!/data-testid\s*=/.test(html)) warn('测试钩子', 'HTML 未出现 data-testid；建议与 data-ui 同时给出稳定测试钩子');
else ok('测试钩子', 'HTML 含 data-testid');

print();

function print() {
	console.log(`\nUI 原型门禁：${label}`);
	for (const r of results) {
		const mark = r.level === 'ok' ? '✓' : r.level === 'warn' ? '⚠' : '❌';
		console.log(`  ${mark} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
	}
	const n = { ok: 0, warn: 0, fail: 0 };
	for (const r of results) n[r.level] += 1;
	console.log(`\n结果：${n.ok} ✓ / ${n.warn} ⚠ / ${n.fail} ❌`);
	process.exit(n.fail ? 1 : 0);
}
