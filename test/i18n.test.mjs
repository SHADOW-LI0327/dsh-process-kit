/**
 * 双语（zh / en）回归测试：契约见 `docs/I18N.md`。
 *
 * 钉死四件事，任何一项漏改就红：
 *   ① 两套骨架**文件清单一致**（少了文件 = 英文仓库缺产物；多了文件 = 只有一种语言有）；
 *   ② 英文骨架/技能/AGENTS 模板**零中日韩字符**（除机器标记，它们本来就是 ASCII）；
 *   ③ **机器标记与配置键别名一致**：`docs/I18N.md` 的对照表 ↔ `CONFIG_KEYS` ↔ 两套 PROJECT.md；
 *   ④ 英文仓库里两道门禁**真的能跑**：合法落点放行、越界判红，且输出是英文（不夹中文）。
 *
 * 用法：node test/i18n.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_KEYS, HEADER, MARKER, REGISTRY_HEADINGS, SECTION } from '../scripts/project-config.mjs';
import { detectLangFromText, parseLang, resolveLang } from '../scripts/i18n.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

const temps = [];
async function tempRepo() {
	const root = await mkdtemp(join(tmpdir(), 'pk-i18n-'));
	temps.push(root);
	return root;
}

/** 递归列出目录下所有文件（相对路径，排序）。 */
function walk(dir, base = dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(abs, base));
		else out.push(abs.slice(base.length + 1));
	}
	return out.sort();
}

function runGate(cwd, script, args = [], env = {}) {
	try {
		const out = execFileSync(process.execPath, [join(cwd, 'scripts/process', script), ...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, PROCESS_KIT_LANG: '', ...env },
		});
		return { status: 0, out };
	} catch (err) {
		return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
	}
}

// ── 1. 两套骨架文件清单一致 ─────────────────────────────────────────────
{
	const zh = walk(join(PKG, 'scaffold')).filter((rel) => !rel.startsWith('en/'));
	const en = walk(join(PKG, 'scaffold/en'));
	assert.deepEqual(en, zh, `scaffold/en 必须与 scaffold 逐文件对应：\n  zh=${zh.join(',')}\n  en=${en.join(',')}`);
	console.log(`✓ 1 双语骨架文件清单一致（${zh.length} 个文件）`);
}

// ── 2. 英文骨架零 CJK ──────────────────────────────────────────────────
{
	const offenders = [];
	for (const rel of walk(join(PKG, 'scaffold/en'))) {
		const text = readFileSync(join(PKG, 'scaffold/en', rel), 'utf8');
		const n = (text.match(CJK) ?? []).length;
		if (n > 0) offenders.push(`${rel}: ${n}`);
	}
	assert.deepEqual(offenders, [], `英文骨架里不得残留中文：\n  ${offenders.join('\n  ')}`);
	console.log('✓ 2 英文骨架零中日韩字符');
}

// ── 3. 机器标记与表头别名齐备（两种语言都要有） ─────────────────────────
{
	for (const [label, projectRel, registryRel] of [
		['zh', 'scaffold/PROJECT.md', 'scaffold/tools/README.md'],
		['en', 'scaffold/en/PROJECT.md', 'scaffold/en/tools/README.md'],
	]) {
		const project = readFileSync(join(PKG, projectRel), 'utf8');
		const registry = readFileSync(join(PKG, registryRel), 'utf8');
		assert.ok(project.includes(MARKER.ownerTable), `${label}: PROJECT.md 缺 ${MARKER.ownerTable}`);
		assert.ok(registry.includes(MARKER.registry), `${label}: tools/README.md 缺 ${MARKER.registry}`);

		// 标记后面的下一个标题必须能被 SECTION.ownerTable / registryBounds 认出来
		const afterMarker = project.slice(project.indexOf(MARKER.ownerTable) + MARKER.ownerTable.length);
		const title = (/^#+\s+(.*)$/m.exec(afterMarker.slice(0, 200)) ?? [])[1]?.trim() ?? '';
		assert.ok(SECTION.ownerTable(2, title), `${label}: 标记下方标题「${title}」不被 SECTION.ownerTable 认可`);

		const regTitle = (/^##\s+(.*)$/m.exec(registry.slice(registry.indexOf(MARKER.registry) + MARKER.registry.length, registry.indexOf(MARKER.registry) + 400)) ?? [])[1]?.trim() ?? '';
		assert.ok(
			REGISTRY_HEADINGS.some((h) => regTitle.toLowerCase().startsWith(h.toLowerCase())),
			`${label}: 登记区标题「${regTitle}」不被 REGISTRY_HEADINGS 认可`,
		);

		// §3 表头必须含「可写路径 / writable paths」
		const rows = project.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
		assert.ok(
			rows.some((l) => HEADER.writablePaths.test(l)),
			`${label}: PROJECT.md §3 表头缺可写路径列（脚本会 exit 1）`,
		);
		// frontmatter 必须声明语言
		assert.match(project, new RegExp(`^lang:\\s*${label}`, 'm'), `${label}: PROJECT.md frontmatter 应声明 lang: ${label}`);
	}
	console.log('✓ 3 机器标记 / 表头别名 / lang 声明齐备（zh + en）');
}

// ── 4. 配置键别名三方一致：I18N.md ↔ CONFIG_KEYS ↔ 两套 PROJECT.md ──────
{
	const doc = readFileSync(join(PKG, 'docs/I18N.md'), 'utf8');
	const zhProject = readFileSync(join(PKG, 'scaffold/PROJECT.md'), 'utf8');
	const enProject = readFileSync(join(PKG, 'scaffold/en/PROJECT.md'), 'utf8');
	const missing = [];
	for (const [use, aliases] of Object.entries(CONFIG_KEYS)) {
		assert.equal(aliases.length, 2, `CONFIG_KEYS.${use} 必须恰好两种语言`);
		const [zh, en] = aliases;
		if (!doc.includes(zh) || !doc.includes(en)) missing.push(`${use}: docs/I18N.md 缺 ${zh} / ${en}`);
		if (!zhProject.includes(zh)) missing.push(`${use}: 中文 PROJECT.md 缺「${zh}」`);
		if (!enProject.includes(en)) missing.push(`${use}: 英文 PROJECT.md 缺「${en}」`);
	}
	assert.deepEqual(missing, [], `配置键对照表不一致：\n  ${missing.join('\n  ')}`);
	console.log(`✓ 4 配置键别名三方一致（${Object.keys(CONFIG_KEYS).length} 个键）`);
}

// ── 5. 角色技能：每个角色都有英文版，名字一致、零 CJK ──────────────────
{
	const roles = readdirSync(join(PKG, 'skills'), { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
	assert.ok(roles.length >= 9, `角色数量异常：${roles.length}`);
	const problems = [];
	for (const role of roles) {
		const zhFile = join(PKG, 'skills', role, 'SKILL.md');
		const enFile = join(PKG, 'skills', role, 'SKILL.en.md');
		if (!existsSync(enFile)) {
			problems.push(`${role}: 缺 SKILL.en.md`);
			continue;
		}
		const zhText = readFileSync(zhFile, 'utf8');
		const enText = readFileSync(enFile, 'utf8');
		const nameOf = (t) => (/^name:\s*(\S+)\s*$/m.exec(t) ?? [])[1] ?? null;
		if (nameOf(zhText) !== nameOf(enText)) problems.push(`${role}: name 不一致（${nameOf(zhText)} vs ${nameOf(enText)}）`);
		if (!/^description:\s*\S/m.test(enText)) problems.push(`${role}: 英文缺 description`);
		const cjk = (enText.match(CJK) ?? []).length;
		if (cjk > 0) problems.push(`${role}: 英文正文残留中文 ${cjk} 处`);
	}
	assert.deepEqual(problems, [], `角色技能英文版不合格：\n  ${problems.join('\n  ')}`);
	console.log(`✓ 5 ${roles.length} 个角色技能英文版齐备、name 一致、零 CJK`);
}

// ── 6. AGENTS 模板双语 ─────────────────────────────────────────────────
{
	const en = readFileSync(join(PKG, 'AGENTS.template.en.md'), 'utf8');
	assert.equal((en.match(CJK) ?? []).length, 0, 'AGENTS.template.en.md 不得残留中文');
	for (const needle of ['docs/process', 'process_status', 'process_journal', 'Development process']) {
		assert.ok(en.includes(needle), `AGENTS.template.en.md 缺 ${needle}`);
	}
	console.log('✓ 6 AGENTS 模板英文版就位');
}

// ── 7. 语言判定优先级 ──────────────────────────────────────────────────
{
	assert.equal(parseLang('EN'), 'en');
	assert.equal(parseLang('zh-CN'), 'zh');
	assert.equal(parseLang('klingon'), null);
	assert.equal(detectLangFromText('# Demo\n\nThis is an English README with `code`.'), 'en');
	assert.equal(detectLangFromText('# 演示\n\n这是一个中文 README，说明流程怎么跑。'), 'zh');
	assert.equal(detectLangFromText(''), null);

	const root = await tempRepo();
	// ④ 只有文档 ⇒ 按文档推断
	await writeFile(join(root, 'README.md'), '# Demo\n\nAn English project.\n', 'utf8');
	assert.equal(resolveLang(root), 'en', '应按 README 推断出 en');

	// ③ PROJECT.md frontmatter 压过文档推断
	await mkdir(join(root, 'docs/process'), { recursive: true });
	await writeFile(join(root, 'docs/process/PROJECT.md'), '---\nlang: zh\n---\n\n# x\n', 'utf8');
	assert.equal(resolveLang(root), 'zh', 'PROJECT.md 的 lang 应压过文档推断');

	// ② 卸载清单压过 PROJECT.md
	await writeFile(join(root, 'docs/process/.process-kit.json'), JSON.stringify({ lang: 'en' }), 'utf8');
	assert.equal(resolveLang(root), 'en', '卸载清单的 lang 优先级最高（除环境变量）');

	// ① 环境变量压过一切
	const prev = process.env.PROCESS_KIT_LANG;
	process.env.PROCESS_KIT_LANG = 'zh';
	assert.equal(resolveLang(root), 'zh', '环境变量应压过卸载清单');
	if (prev === undefined) delete process.env.PROCESS_KIT_LANG;
	else process.env.PROCESS_KIT_LANG = prev;

	// ⑤ 无任何判据 ⇒ zh（存量仓库零变化）
	const bare = await tempRepo();
	assert.equal(resolveLang(bare), 'zh', '无判据时应回退 zh');
	console.log('✓ 7 语言判定优先级（env > manifest > PROJECT.md > 文档推断 > zh）');
}

// ── 8. 英文仓库端到端：合法落点放行、越界判红、输出全英文 ──────────────
{
	const root = await tempRepo();
	await mkdir(join(root, 'docs/process'), { recursive: true });
	await mkdir(join(root, 'scripts/process'), { recursive: true });
	await cp(join(PKG, 'scaffold/en'), join(root, 'docs/process'), { recursive: true });
	await cp(join(PKG, 'scripts'), join(root, 'scripts/process'), { recursive: true });
	execFileSync('git', ['init', '-q', '.'], { cwd: root });

	// 按英文模板填 §3（只给 orchestrator 一个真实路径），并让登记区清空示例
	const projectPath = join(root, 'docs/process/PROJECT.md');
	const before = readFileSync(projectPath, 'utf8');
	// 英文模板的占位行（`<role>` / `<path>/**` / `<forbidden>`）换成真实路径
	const project = before.replace(
		'| `<role>` | `<path>/**` | `<forbidden>` |',
		'| orchestrator | `docs/process/**` · `scripts/process/**` | actions that write code |',
	);
	assert.notEqual(project, before, '未成功替换英文模板 §3 占位行（模板结构变了就更新本测试）');
	await writeFile(projectPath, project, 'utf8');

	// 合法落点：模板文件都在 docs/process/** 或 scripts/process/** 之下
	const allowed = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(allowed.status, 0, `英文仓库的合法落点应放行：\n${allowed.out}`);
	assert.equal((allowed.out.match(CJK) ?? []).length, 0, `英文仓库的门禁输出不得夹中文：\n${allowed.out}`);
	assert.match(allowed.out, /write-target gate/, `应输出英文标题：\n${allowed.out}`);

	// 越界：仓库根上的文件不在任何允许根内
	await writeFile(join(root, 'stray.ts'), 'export const x = 1;\n', 'utf8');
	const violation = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(violation.status, 1, `越界应 exit 1：\n${violation.out}`);
	assert.match(violation.out, /out-of-bounds/, `越界提示应是英文：\n${violation.out}`);
	assert.equal((violation.out.match(CJK) ?? []).length, 0, `英文仓库的越界提示不得夹中文：\n${violation.out}`);

	// 台账门禁：英文仓库读到英文 §4 键后照常工作（默认值生效、不因语言而红）
	const rules = runGate(root, 'check-rules.mjs');
	assert.equal((rules.out.match(CJK) ?? []).length, 0, `英文仓库的台账门禁输出不得夹中文：\n${rules.out}`);

	// 其余门禁：英文仓库里的输出同样不得夹中文（含用法错误路径）
	await rm(join(root, 'stray.ts'));
	await writeFile(
		join(root, 'docs/process/input/FEAT-1-check.md'),
		'---\nid: FEAT-1\nkind: requirement-check\nstatus: confirmed\ngate0: approved\nflow: full\nuiDesign: required\n---\n\n# check\n',
		'utf8',
	);
	await mkdir(join(root, 'docs/process/prd'), { recursive: true });
	await mkdir(join(root, 'docs/process/prototypes/FEAT-1'), { recursive: true });
	await writeFile(join(root, 'docs/process/prd/FEAT-1-ui-spec.md'), '| UI-01 | button | selector |\n', 'utf8');
	await writeFile(
		join(root, 'docs/process/prototypes/FEAT-1/index.html'),
		'<!doctype html><meta name="viewport" content="width=device-width"><div data-ui="UI-01">x</div>\n',
		'utf8',
	);
	await writeFile(join(root, 'docs/process/prototypes/FEAT-1/handoff.md'), '| UI-NN | selector |\n| --- | --- |\n| UI-01 | .btn |\n', 'utf8');

	for (const [script, args, label] of [
		['check-ui-prototype.mjs', ['--pkg', 'FEAT-1'], 'UI 原型门禁'],
		['check-uat-readiness.mjs', [], 'UAT 前置（用法错误路径）'],
		['sync-prd-version.mjs', ['NOPE-1', '--check'], '版本同步（找不到 PRD）'],
	]) {
		const res = runGate(root, script, args);
		assert.equal(
			(res.out.match(CJK) ?? []).length,
			0,
			`英文仓库里${label}的输出不得夹中文：\n${res.out}`,
		);
		assert.ok(res.out.trim() !== '', `${label} 没有输出，无法判断语言：${script}`);
	}
	console.log('✓ 8 英文仓库端到端：合法放行 / 越界判红 / 全部门禁输出全英文');
}

// ── 9. 英文用户文档：与中文源同结构，英文侧零残留 ─────────────────────
//
// 允许一行「指向中文版」的互指行（它必须写出「中文」二字），其余英文正文不得夹中文。
{
	const pairs = [
		['README.md', 'README.en.md'],
		['docs/CONFIGURATION.md', 'docs/CONFIGURATION.en.md'],
		['docs/CONTRACT.md', 'docs/CONTRACT.en.md'],
		['docs/DESIGN.md', 'docs/DESIGN.en.md'],
		['docs/ACCEPTANCE.md', 'docs/ACCEPTANCE.en.md'],
		['docs/ECOSYSTEM.md', 'docs/ECOSYSTEM.en.md'],
	];
	const problems = [];
	for (const [zhRel, enRel] of pairs) {
		const zhPath = join(PKG, zhRel);
		const enPath = join(PKG, enRel);
		if (!existsSync(enPath)) {
			problems.push(`${enRel}: 缺失`);
			continue;
		}
		const zhText = readFileSync(zhPath, 'utf8');
		const enText = readFileSync(enPath, 'utf8');
		const h2 = (t) => (t.match(/^## /gm) ?? []).length;
		if (h2(zhText) !== h2(enText)) problems.push(`${enRel}: 二级标题数 ${h2(enText)} ≠ 中文源 ${h2(zhText)}`);
		// 互指行（`> **中文**: ...`）是唯一允许出现中文的地方
		const body = enText.replace(/^>\s*\*\*中文\*\*.*$/gm, '');
		const cjk = (body.match(CJK) ?? []).length;
		if (cjk > 0) problems.push(`${enRel}: 除互指行外仍有中文 ${cjk} 处`);
	}
	assert.deepEqual(problems, [], `英文用户文档不合格：\n  ${problems.join('\n  ')}`);
	console.log(`✓ 9 英文文档 ${pairs.length} 对与中文源同结构、零中文残留（互指行除外）`);
}

console.log('\ni18n.test.mjs 全部通过');
