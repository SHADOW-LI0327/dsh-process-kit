/**
 * 门禁脚本回归测试：**模板里的示例值不得被解析成真配置**。
 *
 * 缺陷原貌：把 `scaffold/` + `scripts/` 原样复制进新仓库后
 *   - §3 属主表的 6 行**示例**被当成真配置 ⇒ 放行 26 条、`✓ 无越界` **假绿**；
 *   - 登记区的示例登记行被当成「已登记」；
 *   - §4/§5 的「示例取值」列被读成真值 ⇒ import 白名单被改窄、自动化类型丢掉 `jest`、
 *     待裁定字样正则被换掉、凭空多出一个 junit 目录。
 *
 * 本文件把它钉死：原样模板必须「未填 = 未配置」，且**这些断言在修复前会失败**。
 *
 * 用法：node test/scripts.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');

const temps = [];
async function tempRepo() {
	const root = await mkdtemp(join(tmpdir(), 'pk-scripts-'));
	temps.push(root);
	return root;
}

/** 原样复制模板 + 脚本，并 `git init`（门禁依赖 git 枚举未跟踪文件）。 */
async function makeTemplateRepo() {
	const root = await tempRepo();
	await mkdir(join(root, 'docs/process'), { recursive: true });
	await cp(join(PKG, 'scaffold'), join(root, 'docs/process'), { recursive: true });
	await cp(join(PKG, 'scripts'), join(root, 'scripts/process'), { recursive: true });
	execFileSync('git', ['init', '-q', '.'], { cwd: root });
	return root;
}

/** 跑门禁脚本，返回 { status, out }（stdout+stderr 合并，不抛异常）。 */
function runGate(cwd, script, args = [], env = {}) {
	try {
		const out = execFileSync(process.execPath, [join(cwd, 'scripts/process', script), ...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, ...env },
		});
		return { status: 0, out };
	} catch (err) {
		return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
	}
}

/** 把 §4/§5 表格某行的取值列（第 2 列）换成给定值。 */
function setConfigCell(md, key, value) {
	const re = new RegExp(`^(\\|\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*)\`[^\`]*\`(\\s*\\|)`, 'm');
	// 用函数式替换：取值里的 `$`（如正则 `^vitest$`）不得被当成 `$&` / `$\`` 之类的替换模式
	const next = md.replace(re, (_m, p1, p2) => `${p1}${value}${p2}`);
	assert.notEqual(next, md, `未能替换配置行：${key}`);
	return next;
}

const projectRel = 'docs/process/PROJECT.md';
const placeholderRow = '| `<角色>` | `<路径>/**` | `<禁止>` |';

// ── 1. 原样模板 ≠ 已配置：必须 exit 1，且不得出现「✓ 无越界」 ──────────────

{
	const root = await makeTemplateRepo();
	const { status, out } = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(status, 1, `原样模板应 exit 1，实际 ${status}\n${out}`);
	assert.match(out, /未填|占位符/, `提示里应点出「未填 / 占位符」\n${out}`);
	assert.doesNotMatch(out, /✓ 无越界落点/, `原样模板绝不能假绿\n${out}`);
	assert.match(out, /已忽略.*占位符条目/, `应报告忽略了占位符条目\n${out}`);
	console.log('✓ 1 原样模板 §3 未填 ⇒ exit 1，不静默放行');
}

// ── 4. 登记区示例不生效：登记区贡献 0 条，示例登记路径仍判越界 ────────────

{
	const root = await makeTemplateRepo();
	// 填一个**真实**的 §3 路径，让门禁能走到放行统计那一步
	const projectPath = join(root, projectRel);
	const md = (await readFile(projectPath, 'utf8')).replace(placeholderRow, '| orchestrator | `docs/process/**` | `<禁止>` |');
	assert.notEqual(md, await readFile(projectPath, 'utf8'), '未替换 §3 占位行');
	await writeFile(projectPath, md, 'utf8');
	// 模板登记区里出现过的示例登记路径
	const example = 'scripts/FEAT-001-backfill-status.ts';
	await mkdir(join(root, 'scripts'), { recursive: true });
	await writeFile(join(root, example), '// 示例登记行对应的文件\n', 'utf8');

	const { status, out } = runGate(root, 'check-artifact-paths.mjs');
	assert.match(out, /登记区 0 条/, `原样模板登记区不应贡献放行条目\n${out}`);
	assert.match(out, new RegExp(example.replace(/[.]/g, '\\.')), `示例登记路径不应被放行\n${out}`);
	assert.equal(status, 1, `示例登记路径应判越界 ⇒ exit 1\n${out}`);
	console.log('✓ 4 登记区示例不生效（0 条放行）');
}

// ── 2a. §4 / §5 原样模板逐 key 解析为 null（⇒ 回落脚本内置默认值） ─────────

{
	const { configValue, parseList, readSection } = await import('../scripts/project-config.mjs');
	const tpl = await readFile(join(PKG, 'scaffold/PROJECT.md'), 'utf8');
	const sec4 = readSection(tpl, (lvl, t) => lvl === 2 && /^4([.、\s:：]|$)/.test(t) && !/^4\.\d/.test(t));
	const sec5 = readSection(tpl, (lvl, t) => lvl === 2 && ((/^5([.、\s:：]|$)/.test(t) && !/^5\.\d/.test(t)) || t.includes('UAT 前置')));
	assert.ok(sec4 && sec5, '应能定位 §4 / §5');
	const keys4 = [
		'测试扫描目录', '测试文件后缀', '流程测试目录', '需求包测试目录', 'import 白名单',
		'自动化类型', '@case 载体类型', 'junit 测试目录', '待裁定字样', '台账目录', 'PRD 目录', '登记区文件',
	];
	const keys5 = [
		'core 后端', 'web 前端', '移动端', '验收账号', '验收口令', '目标端点',
		'端点前缀', '登录路径', '令牌字段', '真机 CDP', '清单目录', '证据目录',
	];
	for (const k of keys4) assert.equal(configValue(sec4, k), null, `§4「${k}」原样模板应视为未配置`);
	for (const k of keys5) assert.equal(configValue(sec5, k), null, `§5「${k}」原样模板应视为未配置`);
	// 反向对照：填了真值就该被读到，否则上面的 null 可能只是因为解析器坏了
	{
		const filled = setConfigCell(tpl, 'import 白名单', '`^node:`、`^@app/api`');
		const f4 = readSection(filled, (lvl, t) => lvl === 2 && /^4([.、\s:：]|$)/.test(t) && !/^4\.\d/.test(t));
		assert.deepEqual(parseList(configValue(f4, 'import 白名单')), ['^node:', '^@app/api']);
	}
	console.log('✓ 2a §4/§5 原样模板逐 key 均为未配置（真值仍能读到）');
}

// ── 2b/2c. 端到端：原样模板取到的是脚本内置默认值，不是 §4 示例值 ──────────

/** 造一个「§4 原样 + 一条 jest 用例 + automation: jest 台账 + 冻结 PRD」的最小仓。 */
async function makeRulesFixture() {
	const root = await makeTemplateRepo();
	await mkdir(join(root, 'test'), { recursive: true });
	await mkdir(join(root, 'docs/process/rules'), { recursive: true });
	await mkdir(join(root, 'docs/process/prd'), { recursive: true });
	await writeFile(
		join(root, 'test/foo.test.mjs'),
		'// @prdVersion 1\nimport { jest } from "jest";\n// @case TC-X-1\n',
		'utf8',
	);
	await writeFile(
		join(root, 'docs/process/rules/X.yaml'),
		'prdVersion: 1\ncases:\n  - id: TC-X-1\n    automation: jest\n',
		'utf8',
	);
	await writeFile(
		join(root, 'docs/process/prd/X.md'),
		'---\nid: X\nstatus: frozen\nprdVersion: 1\n---\n\n以 Q-9 裁定为准\n',
		'utf8',
	);
	execFileSync('git', ['add', 'test/foo.test.mjs'], { cwd: root });
	return root;
}

{
	const root = await makeRulesFixture();
	const { status, out } = runGate(root, 'check-rules.mjs');
	// import 白名单默认含 `^jest$`：模板示例白名单不含 ⇒ 修复前这里会报 ④
	assert.doesNotMatch(out, /④ import 白名单外/, `原样模板必须回落到默认白名单（含 jest）\n${out}`);
	// 自动化类型默认含 `jest`：模板示例词表不含 ⇒ 修复前这里会报 ⑨
	assert.doesNotMatch(out, /automation 取值不可识别/, `原样模板必须回落到默认自动化类型词表\n${out}`);
	// 待裁定字样默认 = `以 Q-\d+ 裁定为准|或 HTTP \d+`：模板示例正则不认这句话 ⇒ 修复前 ⑦ 不报
	assert.match(out, /⑦ .*已过 Gate2 .*待裁定/, `原样模板必须回落到默认待裁定正则\n${out}`);
	assert.equal(status, 1, '冻结 PRD 仍有待裁定字样 ⇒ 应 exit 1');

	// 反向对照：把 §4 换回旧的「示例取值」，同一份仓必须转红 —— 证明上面的绿来自默认值
	const projectPath = join(root, projectRel);
	let md = await readFile(projectPath, 'utf8');
	md = setConfigCell(md, 'import 白名单', '`^node:`、`^\\.\\.?/`、`^vitest$`、`^@app/api`、`^@app/db`');
	md = setConfigCell(md, '自动化类型', '`vitest`、`cdp`、`manual`、`none`、`pending`、`withdrawn`');
	md = setConfigCell(md, '待裁定字样', '`以Q-\\d+裁定为准`');
	await writeFile(projectPath, md, 'utf8');
	const legacy = runGate(root, 'check-rules.mjs');
	assert.match(legacy.out, /import 白名单外 \[test\/foo\.test\.mjs\]: jest/, `示例白名单确实会拒 jest\n${legacy.out}`);
	assert.match(legacy.out, /TC-X-1 automation 取值不可识别：jest/, `示例词表确实会拒 jest\n${legacy.out}`);
	assert.doesNotMatch(legacy.out, /已过 Gate2 .*待裁定/, `示例正则确实认不出默认字样\n${legacy.out}`);
	console.log('✓ 2b/2c §4 原样 ⇒ 取默认值；换回示例值 ⇒ 同一用例转红（反向对照成立）');
}

// ── 3. 填好后照常工作：真实 §3 ⇒ exit 0 且正确放行 ────────────────────────

{
	const root = await makeTemplateRepo();
	const projectPath = join(root, projectRel);
	const md = (await readFile(projectPath, 'utf8')).replace(
		placeholderRow,
		'| orchestrator | `docs/process/**` · `scripts/process/**` | `<禁止>` |',
	);
	assert.notEqual(md, await readFile(projectPath, 'utf8'), '未替换 §3 占位行');
	await writeFile(projectPath, md, 'utf8');
	const { status, out } = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(status, 0, `填好 §3 后应放行\n${out}`);
	assert.match(out, /✓ 无越界落点/, `填好 §3 后应报无越界\n${out}`);
	console.log('✓ 3 填好 §3 后照常工作（exit 0）');
}

// ── 5. 代码块内的示例行不参与解析（§3 与登记区都靠这条兜底） ───────────────

{
	const { parseTable, readSection } = await import('../scripts/project-config.mjs');
	const tpl = await readFile(join(PKG, 'scaffold/PROJECT.md'), 'utf8');
	const sec3 = readSection(tpl, (lvl, t) => lvl === 2 && (/^3([.、\s:：]|$)/.test(t) || t.includes('产物属主')));
	assert.ok(sec3, '应能定位 §3');
	const rows = parseTable(sec3.body);
	// 示例块里那句 `| authors/orchestrator/** ...` 绝不能出现在解析结果里
	const flat = rows.flat().join(' ');
	assert.doesNotMatch(flat, /reports\/orchestrator\/\*\*/, `代码块内示例不得被当成表格行\n${flat}`);
	assert.doesNotMatch(flat, /reports\/pm-review\/\*\*/, `代码块内示例不得被当成表格行\n${flat}`);
	console.log('✓ 5 代码块内示例不参与解析');
}

// ── 6. UI 几何门禁：测量必须来自产物、意图必须由人声明 ────────────────────

const protoRel = 'docs/process/prototypes/FEAT-UI';

/**
 * 造一份「适配器导出」的几何 + 作者意图。
 * 几何里只有 bounds 是测量结果；哪些元素应当居中、内容带在哪，属于作者意图，另放 intent.json。
 */
async function makeGeoFixture(mutate = () => {}) {
	const root = await makeTemplateRepo();
	const dir = join(root, protoRel);
	await mkdir(dir, { recursive: true });
	const geo = {
		source: 'test-fixture:derived-from-artifact',
		adapter: 'test-fixture',
		canvas: { width: 1280, height: 800 },
		elements: [
			{ name: 'bg', kind: 'decoration', bounds: [0, 0, 1280, 800] },
			{ name: 'card', kind: 'container', bounds: [280, 148, 304, 132] },
			{ name: 'label', kind: 'text', bounds: [304, 175, 52, 13] },
			{ name: 'value', kind: 'text', bounds: [304, 207, 60, 30] },
			{ name: 'panel', kind: 'container', bounds: [280, 308, 960, 452] },
			{ name: 'pill', kind: 'container', bounds: [780, 400, 69, 26] },
			{ name: 'stat', kind: 'text', bounds: [801, 407, 27, 13] },
		],
	};
	mutate(geo);
	await writeFile(join(dir, 'geometry.json'), JSON.stringify(geo, null, 2), 'utf8');
	await writeFile(
		join(dir, 'intent.json'),
		JSON.stringify({ band: { left: 240, right: 1280 }, align: { stat: 'center' } }, null, 2),
		'utf8',
	);
	return root;
}

{
	// 6a. 原样模板 ⇒ 阈值必须回落到内置默认值。
	//     缺陷原貌：`Number(null) === 0`，于是「未配置」被读成阈值 0 ——
	//     最小间隙 / 居中偏差上限全退化成 0px，门禁看着在跑，实际判不了任何东西。
	const root = await makeGeoFixture();
	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	assert.match(
		out,
		/网格 8px · 最小间隙 4px · 居中 1px · 边距容差 1px/,
		`未配置时必须回落到默认阈值（出现 0px 即 Number(null) 被当成了 0）\n${out}`,
	);
	assert.equal(status, 0, `干净几何应放行\n${out}`);
	assert.match(out, /✓ ⑤ .*偏差均 ≤ 1px/, `intent 声明居中的元素应被判居中\n${out}`);
	assert.match(out, /✓ ⑥ .*边距对称/, `声明 band 后应判边距对称，且满幅背景不得算作跨带噪声\n${out}`);
	console.log('✓ 6a 未配置 ⇒ 默认阈值（非 0）；居中/边距按 intent 判定');
}

{
	// 6b. 反自述：几何缺 source 即判红 —— 手写 bounds 不能冒充产物测量。
	const root = await makeGeoFixture((g) => {
		delete g.source;
	});
	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	assert.equal(status, 1, `缺 source 必须 exit 1\n${out}`);
	assert.match(out, /① .*缺可追溯的 source/, `应报不可追溯\n${out}`);
	console.log('✓ 6b 缺 source ⇒ 判红（测量不得自述）');
}

{
	// 6c. 文字真实重叠 ⇒ 判红。
	const root = await makeGeoFixture((g) => {
		g.elements.find((e) => e.name === 'value').bounds = [304, 180, 60, 30];
	});
	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	assert.equal(status, 1, `文字重叠必须 exit 1\n${out}`);
	assert.match(out, /③ .*文字重叠：label ✕ value/, `应点名重叠的两个文字层\n${out}`);
	console.log('✓ 6c 文字重叠 ⇒ 判红');
}

{
	// 6d. 过挤（未到重叠，但间隙小于阈值）⇒ 判红。这正是「字体挤在一起」的可判定形态。
	const root = await makeGeoFixture((g) => {
		g.elements.find((e) => e.name === 'value').bounds = [304, 190, 60, 30];
	});
	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	assert.equal(status, 1, `过挤必须 exit 1\n${out}`);
	assert.match(out, /④ .*文字过挤：label ↕ value 间隙 2px < 4px/, `应报出间隙与阈值\n${out}`);
	console.log('✓ 6d 同列文字过挤 ⇒ 判红');
}

{
	// 6e. intent 声明了居中却不居中 ⇒ 判红（证明 intent 确实参与判定，不是摆设）。
	const root = await makeGeoFixture((g) => {
		g.elements.find((e) => e.name === 'stat').bounds = [790, 407, 27, 13];
	});
	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	assert.equal(status, 1, `声明居中却偏移必须 exit 1\n${out}`);
	assert.match(out, /⑤ .*stat 在 pill 内未居中/, `应点名未居中的元素与容器\n${out}`);
	console.log('✓ 6e 声明居中却偏移 ⇒ 判红');
}

{
	// 6f. 显式点名一个包却没有几何证据 ⇒ 判红，绝不静默放行。
	const root = await makeTemplateRepo();
	const { status, out } = runGate(root, 'check-ui-geometry.mjs', ['--id', 'FEAT-001']);
	assert.equal(status, 1, `--id 指定却无几何必须 exit 1，不得静默放行\n${out}`);
	assert.match(out, /① 指定了 --id FEAT-001 但找不到/, `应明确说找不到几何\n${out}`);
	console.log('✓ 6f 点名验收却无几何 ⇒ 判红（不静默放行）');
}

{
	// 6g. 反向：压根没启用 UI 设计时，全局扫描不得判红（否则每个包都会被这道门卡死）。
	const root = await makeTemplateRepo();
	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	assert.equal(status, 0, `未产出几何不该判红\n${out}`);
	assert.match(out, /未在 .* 下发现任何 geometry\.json/, `应提示未启用\n${out}`);
	console.log('✓ 6g 未启用 UI 设计 ⇒ 不判红（仅提示）');
}

// ── 7. UI 默认层的引用不得悬空 ────────────────────────────────────────────

{
	// 技能里写了「照抄 docs/process/ui/tokens.md」，模板里就必须真有这两份 ——
	// 引用悬空的后果不是报错，而是角色找不到文件、转而**自己发明一套令牌**，
	// 那正是这一层要消灭的事。
	const skill = await readFile(join(PKG, 'skills/ui-designer/SKILL.md'), 'utf8');
	for (const f of ['ui/tokens.md', 'ui/recipe.md']) {
		assert.match(skill, new RegExp(f.replace('.', '\\.')), `技能应引用 ${f}`);
		assert.ok(existsSync(join(PKG, 'scaffold', f)), `scaffold/${f} 必须存在，否则技能引用悬空`);
	}
	// 这块内容的真正价值在这两处，钉死它们别在后续编辑里被删掉
	const tokens = await readFile(join(PKG, 'scaffold/ui/tokens.md'), 'utf8');
	assert.match(tokens, /tracking/, '默认令牌必须含中文 tracking 映射（最影响观感的一项）');
	assert.match(tokens, /归一化浮点/, '默认令牌必须收录「0-255 数组静默变白」陷阱');
	assert.match(tokens, /ppi/, '默认令牌必须收录「字号随 ppi 缩放」陷阱（字挤在一起的成因）');

	// §4 键名照抄、改名即静默失效 —— 门禁读不到就回落到默认值，且不会有任何报错。
	const { readSection } = await import('../scripts/project-config.mjs');
	const sec4 = readSection(
		await readFile(join(PKG, 'scaffold/PROJECT.md'), 'utf8'),
		(lvl, t) => lvl === 2 && /^4([.、\s:：]|$)/.test(t) && !/^4\.\d/.test(t),
	);
	for (const key of [
		'UI 项目令牌',
		'UI 原型目录',
		'UI 几何网格',
		'UI 文字最小间隙',
		'UI 居中偏差上限',
		'UI 边距对称容差',
		'UI 对比度下限',
		'UI 大字号对比度下限',
	]) {
		assert.ok(sec4, '应能定位 §4');
		assert.match(sec4.body, new RegExp(`\\|\\s*${key}\\s*\\|`), `§4 必须登记配置项「${key}」`);
	}
	// 两层语义色是 ⑧ 对比度检查能过的前提：同色既当底又当字，在 accent 上只有 2.97:1。
	assert.match(tokens, /填充档/, '令牌表必须给出「填充档」（胶囊/标签的底）');
	assert.match(tokens, /文字档/, '令牌表必须给出「文字档」（胶囊/标签的字）');
	// 没有移动端基准，窄屏只能靠现编 —— 上一轮实测确认了这个缺口。
	assert.match(tokens, /移动端基准/, '令牌表必须给出移动端基准（画布/安全区/可点区/间距）');
	assert.match(tokens, /390/, '移动端基准必须给具体画布尺寸，不能只说「按设备适配」');
	// 「技术与手段必须声明，但整体可不用」是本层的口径 —— 模板里少了这段，就退回成
	// 「必须用某工具」，而工具选型是实现细节、不是流程判据。
	const spec = await readFile(join(PKG, 'scaffold/prd/_UI_SPEC_TEMPLATE.md'), 'utf8');
	assert.match(spec, /8\.0 技术与手段/, 'UI 规格模板必须有 §8.0 技术与手段（声明用了什么）');
	assert.match(spec, /不使用/, '§8.0 必须写明「不使用」也是合法选项，而非缺陷');
	assert.match(skill, /不得把自己用的工具写成流程要求/, '技能必须禁止把工具选型写成流程判据');
	console.log('✓ 7 UI 默认层引用不悬空，§4 的 8 个 UI 键齐全，两层语义色与移动端基准在位');
}

{
	// 6h. artifact 指向不存在的产物 ⇒ 判红。
	// 关键：`source` 只是自述字符串，编一个看起来很专业的它就能过；真正的证据是产物本身存在。
	const root = await makeGeoFixture((g) => {
		g.artifact = 'docs/process/prototypes/FEAT-UI/never-existed.psd';
	});
	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	assert.equal(status, 1, `artifact 不存在必须 exit 1\n${out}`);
	assert.match(out, /① .*artifact 指向的产物不存在/, `应报产物不存在\n${out}`);
	assert.doesNotMatch(out, /✓ ① .*来源可追溯/, `不得再打「来源可追溯」的绿\n${out}`);
	console.log('✓ 6h artifact 指向不存在的产物 ⇒ 判红（source 字符串不构成证据）');
}

{
	// 6i. 有 source 无 artifact ⇒ ⚠（弱证据），不判红 —— 兼容尚未产出 artifact 的项目，
	// 但绝不显示成「来源可追溯」的绿。**降级 ≠ 放行**。
	const root = await makeGeoFixture();
	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	assert.equal(status, 0, `缺 artifact 只算弱证据，不判红\n${out}`);
	assert.match(out, /① .*未标 artifact/, `应降级为 ⚠\n${out}`);
	assert.doesNotMatch(out, /✓ ① .*来源可追溯/, `不得打绿\n${out}`);
	console.log('✓ 6i 有 source 无 artifact ⇒ 降级为 ⚠（不再冒充「可追溯」）');
}

{
	// 6j. 一个包可以有**多个屏幕**：geometry.json 与 geometry.<屏幕名>.json 都要被判，
	//     且各自优先取同名 intent.<屏幕名>.json。一包一图不现实，真实需求都是多屏。
	const root = await makeGeoFixture();
	const dir = join(root, protoRel);
	await writeFile(
		join(dir, 'geometry.统计.json'),
		JSON.stringify(
			{
				source: 'test-fixture:derived-from-artifact',
				adapter: 'test-fixture',
				canvas: { width: 1280, height: 800 },
				elements: [
					{ name: 'bg', kind: 'decoration', bounds: [0, 0, 1280, 800] },
					{ name: 'a', kind: 'text', bounds: [100, 100, 80, 20] },
					{ name: 'b', kind: 'text', bounds: [120, 105, 80, 20] }, // 故意与 a 重叠
				],
			},
			null,
			2,
		),
		'utf8',
	);
	await writeFile(
		join(dir, 'intent.统计.json'),
		JSON.stringify({ band: { left: 100, right: 1180 }, align: {} }, null, 2),
		'utf8',
	);
	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	assert.equal(status, 1, `第二屏的文字重叠必须被判红\n${out}`);
	assert.match(out, /判定包 2\/2/, `必须两屏都判，不能只判第一屏\n${out}`);
	assert.match(out, /geometry\.统计\.json 文字重叠/, `红必须落在第二屏上\n${out}`);
	assert.match(out, /已合并作者意图 intent\.统计\.json/, `第二屏应取同名 intent\n${out}`);
	console.log('✓ 6j 一个包多屏：geometry.<屏幕名>.json 与同名 intent 一并判定');
}

// ── 6k. 中文命名的产物不得被误判越界（git core.quotePath 回归） ────────────
//
// git 默认 core.quotePath=true 时 `ls-files` 把非 ASCII 路径按八进制转义加引号输出，
// 那串文本匹配不上任何通配 —— 所有中文产物都会被误判越界。必须用 `-z`。

{
	const root = await makeTemplateRepo();
	const projectPath = join(root, projectRel);
	const md = (await readFile(projectPath, 'utf8')).replace(
		placeholderRow,
		'| orchestrator | `docs/process/**` · `scripts/process/**` | `<禁止>` |',
	);
	await writeFile(projectPath, md, 'utf8');
	await writeFile(join(root, 'docs/process/input/FEAT-01-需求核对件.md'), '# 需求核对件\n', 'utf8');
	const { status, out } = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(status, 0, `中文命名产物在授权目录内，不得判红\n${out}`);
	assert.match(out, /✓ 无越界落点/, `应报无越界\n${out}`);
	assert.doesNotMatch(out, /\\3[0-7][0-7]/, `不得出现八进制转义路径\n${out}`);
	console.log('✓ 6k 中文命名产物不被误判越界（git -z）');
}

// ── 6l. 脚手架自己落地的每个文件都必须被 §3 示例覆盖 ──────────────────────
//
// 反面教材：`docs/process/ui/<tokens|recipe>.md` 曾不在示例行里 ——
// 框架创建了自己宣布违法的文件，每个新项目都会立刻报越界。
// 这里把模板里的示例行当成真实 §3（人就照抄它），跑一遍完整门禁。

{
	const root = await makeTemplateRepo();
	const projectPath = join(root, projectRel);
	const md = await readFile(projectPath, 'utf8');
	// 取示例块里**全部**角色行（人就整块照抄），原样当成本项目的 §3。
	// 注意只认「角色写在第 1 列」的行 —— §1 的示例行把角色放在第 3 列，别捞进来。
	const exampleLines = md
		.split('\n')
		.filter((l) => l.startsWith('|') && (l.split('|')[1] ?? '').includes('<role-'));
	assert.ok(exampleLines.length >= 5, `模板 §3 示例行应有多个角色，实际 ${exampleLines.length}`);
	const realRows = exampleLines
		.map((l, i) => {
			const cells = l.split('|');
			return `| role-${i} |${cells[2]}| - |`;
		})
		.join('\n');
	await writeFile(projectPath, md.replace(placeholderRow, realRows), 'utf8');

	const { status, out } = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(status, 0, `脚手架落地的文件必须全部被 §3 示例放行\n${out}`);
	assert.match(out, /✓ 无越界落点/, `即便照抄示例行也应无越界\n${out}`);
	console.log('✓ 6l 脚手架落地的每个文件都被 §3 示例覆盖');
}

// ── 6m. 空目录前缀与 `-z` 下的空输出不得制造幻影条目 ──────────────────────

{
	const root = await makeTemplateRepo();
	const projectPath = join(root, projectRel);
	const md = (await readFile(projectPath, 'utf8')).replace(
		placeholderRow,
		'| orchestrator | `docs/process/**` · `scripts/process/**` | `<禁止>` |',
	);
	await writeFile(projectPath, md, 'utf8');
	// 路径含空格：`-z` 下必须完整保留，不能被当成两个条目
	await writeFile(join(root, 'docs/process/input/FEAT-01-空格 名称 测试.md'), '# x\n', 'utf8');
	const { status, out } = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(status, 0, `含空格的中文路径应整体放行\n${out}`);
	assert.match(out, /✓ 无越界落点/, `应报无越界\n${out}`);
	console.log('✓ 6m 含空格的中文路径整体放行（-z 分隔正确）');
}

// ── 6n. §4 的 UI 配置键必须真的被读到（非默认值才算数） ──────────────────────
//
// 缺陷原貌：`readSection(text, isNumberedSection.bind(null, 4))` —— readSection 按
// `match(level, title)` 调用，于是变成 `isNumberedSection(4, level)`，拿层级 "2" 当标题匹配，
// **永远返回 null**，§4 的全部 UI 键被静默忽略。默认值恰好等于文档承诺的默认值，
// 所以"看起来一切正常"；**只有把某个键改成非默认值才暴露**。

{
	const root = await makeGeoFixture();
	const projectPath = join(root, projectRel);
	const md = await readFile(projectPath, 'utf8');
	// 换成一个非默认的原型目录，几何也搬过去
	const custom = 'docs/process/screens';
	await mkdir(join(root, custom, 'FEAT-UI'), { recursive: true });
	for (const f of ['geometry.json', 'intent.json']) {
		await rename(join(root, protoRel, f), join(root, custom, 'FEAT-UI', f));
	}
	await rm(join(root, protoRel), { recursive: true, force: true });
	await writeFile(projectPath, setConfigCell(md, 'UI 原型目录', `\`${custom}\``), 'utf8');

	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	assert.doesNotMatch(out, /未.*发现任何 geometry\.json/, `§4「UI 原型目录」必须生效\n${out}`);
	assert.match(out, /判定包 1\/1/, `应到自定义目录里找到 1 个判定包\n${out}`);
	assert.match(out, /screens\//, `输出路径应指向自定义目录\n${out}`);
	assert.equal(status, 0, `找到几何即应正常判定\n${out}`);
	console.log('✓ 6n §4 的 UI 配置键真的被读到（非默认值生效）');
}

// ── 6o. 配了「UI 项目令牌」但还没产出原型 ⇒ 不得凭空判红 ────────────────────

{
	const root = await makeGeoFixture();
	const projectPath = join(root, projectRel);
	const md = await readFile(projectPath, 'utf8');
	await writeFile(join(root, 'tokens.css'), ':root{--c-primary:#316BE1;--c-bg:#F7FBFF;}\n', 'utf8');
	await writeFile(projectPath, setConfigCell(md, 'UI 项目令牌', '`tokens.css`'), 'utf8');
	const { status, out } = runGate(root, 'check-ui-geometry.mjs');
	// 该几何没有 artifact ⇒ ⑩ 只提示、不判红
	assert.match(out, /⑩/, `应出现 ⑩ 的结论行\n${out}`);
	assert.doesNotMatch(out, /❌ ⑩/, `无 artifact 时 ⑩ 不得判红\n${out}`);
	assert.equal(status, 0, `无 artifact 时整体仍应放行\n${out}`);
	console.log('✓ 6o 配了令牌但无 artifact ⇒ ⑩ 只提示不判红');
}

// ── 6p/6q. ⑩ 项目令牌一致性（用假适配器喂固定像素，无需真工具链） ────────────
//
// ⑩ 要判「画面主色能不能由项目色板推导出来」。两个方向**都要测**：
// 只会判红的检查等于没用，而只会判绿的检查等于没写。
// 这里顺带钉死一个真出现过的 bug：`expandPalette` 收到的是 Map 迭代器，
// `new Set(keys)` 先把它耗尽，后面的 `[...keys]` 拿到空数组 ⇒
// **α 叠加白名单一条都没生成**，⑩ 退化成只认精确相等，真实设计（普遍用淡色底）见谁咬谁。

/** 造一份配了「UI 项目令牌」的原型包，并用假适配器喂 pixels（`x,y → [r,g,b,a]`）。 */
async function makeTokenFixture(pixels) {
	const root = await makeTemplateRepo();
	const projectPath = join(root, projectRel);
	await writeFile(
		join(root, 'tokens.css'),
		':root{--c-bg:#F7FBFF;--c-card:#FFFFFF;--c-primary:#316BE1;--c-deep:#012381;--dv-rd:#F24F63;}\n',
		'utf8',
	);
	const md = await readFile(projectPath, 'utf8');
	await writeFile(
		projectPath,
		setConfigCell(setConfigCell(md, 'UI 项目令牌', '`tokens.css`'), 'UI 原型目录', '`docs/process/prototypes`'),
		'utf8',
	);
	const dir = join(root, protoRel);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'screen.png'), 'stub', 'utf8'); // artifact 只需存在
	await writeFile(
		join(dir, 'geometry.json'),
		JSON.stringify(
			{
				source: 'test-fixture:derived-from-artifact',
				adapter: 'fake-photocraft',
				artifact: `${protoRel}/screen.png`,
				canvas: { width: 400, height: 240 },
				elements: [
					{ name: '底', kind: 'decoration', bounds: [0, 0, 400, 240] },
					{ name: '卡', kind: 'container', bounds: [20, 20, 360, 200] },
					{ name: '主蓝区', kind: 'container', bounds: [40, 40, 320, 80] },
					{ name: '胶囊', kind: 'container', bounds: [240, 140, 100, 50] },
				],
			},
			null,
			2,
		),
		'utf8',
	);
	const pixelFile = join(root, 'pixels.json');
	await writeFile(pixelFile, JSON.stringify(pixels), 'utf8');
	return { root, pixelFile };
}

/**
 * 从仓库的**子目录**运行门禁（验证 `findRepoRoot` 那句承诺）。
 * 与 runGate 的区别：脚本路径仍指向仓库根，只有 cwd 变。
 */
function runGateFrom(root, cwdRel, script, args = [], env = {}) {
	try {
		const out = execFileSync(process.execPath, [join(root, 'scripts/process', script), ...args], {
			cwd: join(root, cwdRel),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, ...env },
		});
		return { status: 0, out };
	} catch (err) {
		return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
	}
}

const stubEnv = (f) => ({
	PHOTOCRAFT_CLI: join(PKG, 'test/fixtures/fake-photocraft.mjs'),
	STUB_PIXELS: f,
});

{
	// 6p. 正向：画面由项目色板构成，其中「胶囊」是 #F24F63 @0.18 叠在卡片白上。
	//     区域**必须够大**（用 rects 铺满），否则占比过不了 ⑩ 的「主色」门槛，
	//     测试会在「什么都没测到」的情况下假绿 —— 这个坑我踩过一次。
	const a = 0.18;
	const blend = [0xf2, 0x4f, 0x63].map((v, i) => Math.round(v * a + [0xff, 0xff, 0xff][i] * (1 - a)));
	const { root, pixelFile } = await makeTokenFixture({
		default: [0xf7, 0xfb, 0xff, 255], // --c-bg
		// ⚠️ 顺序 = 优先级（先匹配先赢）：**必须从最具体写到最笼统**。
		// 曾经把整片卡片写在第一条，结果它把主蓝 / 深蓝 / 胶囊全吞了 ——
		// 采样到的只剩卡白和底，测试照样绿，等于什么都没测。
		rects: [
			{ x0: 240, y0: 140, x1: 340, y1: 190, rgba: [...blend, 255] }, // α 叠加淡色底（最具体）
			{ x0: 40, y0: 140, x1: 200, y1: 190, rgba: [0x01, 0x23, 0x81, 255] }, // --c-deep
			{ x0: 40, y0: 40, x1: 360, y1: 120, rgba: [0x31, 0x6b, 0xe1, 255] }, // --c-primary
			{ x0: 20, y0: 20, x1: 380, y1: 220, rgba: [0xff, 0xff, 0xff, 255] }, // --c-card（最笼统）
		],
	});
	const { status, out } = runGate(root, 'check-ui-geometry.mjs', [], stubEnv(pixelFile));
	assert.match(out, /✓ ⑩ .*全部.*取自项目令牌/, `色板内配色（含 α 叠加）必须放行\n${out}`);
	assert.doesNotMatch(out, /❌ ⑩/, `不得误报 α 叠加出来的淡色底\n${out}`);
	assert.equal(status, 0, `正向应 exit 0\n${out}`);
	console.log('✓ 6p ⑩ 正向：色板内配色（含 α 叠加淡色底）放行');
}

{
	// 6q. 反向：主导色换成通用默认的深色主题底 ⇒ 必须点名
	const dark = [0x0d, 0x11, 0x17, 255];
	const { root, pixelFile } = await makeTokenFixture({ default: dark, rects: [] });
	const { status, out } = runGate(root, 'check-ui-geometry.mjs', [], stubEnv(pixelFile));
	assert.match(out, /❌ ⑩ .*#0d1117.*不在项目令牌里/, `用了别的整套色板必须判红\n${out}`);
	assert.equal(status, 1, `反向应 exit 1\n${out}`);
	console.log('✓ 6q ⑩ 反向：画面主色不在项目令牌里 ⇒ 判红');
}

// ── 6r. `--from-photocraft` 必须把作者意图带进来 ──────────────────────────
//
// 缺陷原貌：该分支 push 的是 `{file: null}`，而后面写的是 `t.file ? intentFor(t.file) : null`
// ⇒ **intent 被静默丢掉**，只认 intent 的 ⑤ 居中 / ⑥ 边距整条空转。作者看到的是
// "这条命令跑过了、没报错"，比直接报错更危险。

{
	const root = await makeTemplateRepo();
	const dir = join(root, protoRel);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'screen.psd'), 'stub', 'utf8');
	await writeFile(
		join(dir, 'intent.json'),
		JSON.stringify({ band: { left: 40, right: 360 }, align: { label: 'center' } }, null, 2),
		'utf8',
	);
	const infoFile = join(root, 'info.json');
	await writeFile(
		infoFile,
		JSON.stringify({
			width: 400,
			height: 240,
			layers: [
				{ name: 'bg', kind: 'Shape', bounds: [0, 0, 400, 240] },
				{ name: 'label', kind: 'Type', bounds: [170, 100, 60, 20], text: { sizePt: 14, text: '嗨' } },
			],
		}),
		'utf8',
	);
	const { out } = runGate(
		root,
		'check-ui-geometry.mjs',
		['--from-photocraft', `${protoRel}/screen.psd`, '--intent', `${protoRel}/intent.json`],
		{ PHOTOCRAFT_CLI: join(PKG, 'test/fixtures/fake-photocraft.mjs'), STUB_INFO: infoFile },
	);
	assert.match(out, /已合并作者意图/, `--from-photocraft 必须带上 --intent 指的意图\n${out}`);
	assert.doesNotMatch(out, /无元素声明 align/, `合并了意图就不该再说"没有声明 align"\n${out}`);
	console.log('✓ 6r --from-photocraft 会带进作者意图（不再静默空转）');
}

// ── 6s. 每个角色技能都必须出现在常驻指针 AGENTS 模板的清单里 ─────────────────
//
// 「加了一个角色，但忘了把它写进派单说明」是个很容易犯、又很难发现的错：
// 插件管理器里能看到 8 个角色，主控却永远想不到派第 8 个。这条把它钉住。

{
	const skills = (await readdir(join(PKG, 'skills'), { withFileTypes: true }))
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
	assert.ok(skills.length >= 8, `应至少有 8 个角色技能，实际 ${skills.length}`);
	const pointer = await readFile(join(PKG, 'lib/index.js'), 'utf8');
	// ⚠️ **必须锚定「角色清单那一行」**，不能拿整份文件 `includes()`：
	// 角色名在 lib/index.js 里还出现在别处（如 nextAction 的 gate0 文案），
	// 于是从清单行里删掉 `ui-designer` 之后，旧写法的断言**照样绿** —— 一条假守卫。
	const listLine = pointer.split('\n').find((l) => l.includes('角色由本插件自带的同名技能提供'));
	assert.ok(listLine, '找不到角色清单行（lib/index.js 的常驻指针文案已改？）');
	// 只取括号里那份清单，逐个比对
	const inside = listLine.slice(listLine.indexOf('（') + 1, listLine.indexOf('）'));
	const listed = inside.split('/').map((v) => v.trim()).filter(Boolean);
	assert.equal(
		listed.slice().sort().join(','),
		skills.slice().sort().join(','),
		`常驻指针的角色清单与 skills/ 目录不一致\n  清单：${listed.join(' / ')}\n  目录：${skills.join(' / ')}`,
	);
	console.log(`✓ 6s 常驻指针列全了 ${skills.length} 个角色，且无幽灵角色`);
}

// ── 6t. 令牌源色值过多 ⇒ ⑩ 必须跳过并说明，而不是把门禁算死 ────────────────
//
// 「必须照抄项目令牌」若把令牌源登记成**打包后的整份样式表**，色值可达千级，
// ⑩ 的 N²×α 展开就是几千万条目。色板一泛，⑩ 本身也失去意义（什么颜色都能"推导"出来），
// 所以正确行为是**明说跳过**，不是硬算到挂死、更不是拿一个没意义的绿糊弄人。
{
	const f = await makeTokenFixture({ default: [247, 251, 255, 255] });
	const many = Array.from(
		{ length: 250 },
		(_, i) => `--x${i}:#${((i * 7919) % 0xffffff).toString(16).padStart(6, '0')};`,
	).join('');
	await writeFile(join(f.root, 'tokens.css'), `:root{${many}}\n`, 'utf8');
	const { status, out } = runGate(f.root, 'check-ui-geometry.mjs', [], stubEnv(f.pixelFile));
	assert.match(out, /令牌源抽出 250 个色值/, `色值过多要明说原因，不能默默算或默默跳过\n${out}`);
	assert.doesNotMatch(out, /❌ ⑩/, `色值过多应跳过 ⑩，不得判红\n${out}`);
	assert.equal(status, 0, `跳过不应影响退出码\n${out}`);
	console.log('✓ 6t 令牌源色值过多 ⇒ ⑩ 跳过并说明（不判红、不算死）');
}

// ── 6u. ⑧ 逐像素复核采样失败 ⇒ 只能降级为 ⚠，**绝不能判成「文字完全不可见」** ──
//
// 缺陷原貌：复核采样抛错被 catch 成 `[]`，切片全空 ⇒ 众数取不到任何颜色 ⇒
// 每个挂起层都判 ❌「完全不可见」。**工具故障变成了假红**，而假红会把人指去
// 改一个根本没问题的地方 —— 比不判还糟。
{
	const root = await makeTemplateRepo();
	const dir = join(root, protoRel);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'screen.png'), 'stub', 'utf8');
	await writeFile(
		join(dir, 'geometry.json'),
		JSON.stringify(
			{
				source: 'test-fixture:derived-from-artifact',
				adapter: 'fake-photocraft',
				artifact: `${protoRel}/screen.png`,
				canvas: { width: 400, height: 240 },
				elements: [
					{ name: '底', kind: 'decoration', bounds: [0, 0, 400, 240] },
					// 200×150 的文字层：主采样约 1200 点（步长 5）、逐像素复核 30000 点。
					// 故障门槛卡在 1500 ⇒ **只让复核那一步失败**，主采样照常成功。
					{ name: '大字块', kind: 'text', bounds: [60, 40, 200, 150], sizePt: 14 },
				],
			},
			null,
			2,
		),
		'utf8',
	);
	const pixelFile = join(root, 'pixels.json');
	// 整块同色 ⇒ 必然进 suspects（这一步正是假红的来源）
	await writeFile(pixelFile, JSON.stringify({ default: [247, 251, 255, 255] }), 'utf8');
	const { status, out } = runGate(root, 'check-ui-geometry.mjs', [], {
		...stubEnv(pixelFile),
		// ⚠️ 门槛必须卡在「主采样 1200 点」与「每批 2000 点」之间：
		// `samplePixels` 按 SAMPLE_CHUNK=2000 分批，设成 5000 的话**一批都不会失败**，
		// 测试会静默地什么都没测到。
		STUB_FAIL_ABOVE: '1500',
	});
	assert.match(out, /逐像素复核采样失败/, `复核采样失败必须说出来，不能静默\n${out}`);
	// ⚠️ 只能断言「没有这条 ❌」，不能断言「不出现『完全不可见』这几个字」——
	// 降级提示语自己就写着「跳过『文字完全不可见』判定」，拿词面断言会被自己的提示骗过。
	assert.doesNotMatch(out, /❌[^\n]*完全不可见/, `采样失败不得被判成「完全不可见」（假红）\n${out}`);
	assert.equal(status, 0, `降级为 ⚠ 不应判红\n${out}`);
	console.log('✓ 6u ⑧ 逐像素复核采样失败 ⇒ 降级为 ⚠，不产生「完全不可见」假红');
}

// ── 6v. ⑧ 逐像素复核**必须真的在量**（这条才是作用域 bug 的守卫）────────────
//
// 为什么 6u 挡不住它：参考里写错变量名（`artifact` vs 作用域里的 `art`）会抛
// ReferenceError，被 catch 吞掉后**照样走 warn 分支** —— 用坏代码跑 6u 一样绿。
// 要分辨，必须造一个「主采样看不见、只有逐像素复核才看得见」的对比色：
//   · 文字层 200×150 ⇒ 主采样步长 5，只会采到 x≡0、y≡0 (mod 5) 的坐标；
//   · 把对比色放在 101..104 × 101..104 ⇒ 主采样**一个都采不到** ⇒ 进 suspects；
//   · 逐像素复核能采到那 16 个像素 ⇒ 算出真实对比度 ⇒ 应当**放行**。
// 复核没在量（抛错→空切片）时，它会被判成「完全不可见」—— 正是要抓的假红。
{
	const root = await makeTemplateRepo();
	const dir = join(root, protoRel);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'screen.png'), 'stub', 'utf8');
	await writeFile(
		join(dir, 'geometry.json'),
		JSON.stringify(
			{
				source: 'test-fixture:derived-from-artifact',
				adapter: 'fake-photocraft',
				artifact: `${protoRel}/screen.png`,
				canvas: { width: 400, height: 240 },
				elements: [
					{ name: '底', kind: 'decoration', bounds: [0, 0, 400, 240] },
					{ name: '大字块', kind: 'text', bounds: [60, 40, 200, 150], sizePt: 14 },
				],
			},
			null,
			2,
		),
		'utf8',
	);
	const pixelFile = join(root, 'pixels.json');
	await writeFile(
		pixelFile,
		JSON.stringify({
			// 对比色（#16223B，约 14:1）放在 101..104 方形内 —— 坐标都**不**是 5 的倍数
			rects: [{ x0: 101, y0: 101, x1: 105, y1: 105, rgba: [0x16, 0x22, 0x3b, 255] }],
			default: [247, 251, 255, 255],
		}),
		'utf8',
	);
	const { status, out } = runGate(root, 'check-ui-geometry.mjs', [], stubEnv(pixelFile));
	assert.doesNotMatch(
		out,
		/完全不可见/,
		`逐像素复核没在量：主采样漏掉的对比色应当被复核找回来，而不是判成「完全不可见」\n${out}`,
	);
	assert.equal(status, 0, `真实对比度达标（约 14:1）就不该判红\n${out}`);
	console.log('✓ 6v ⑧ 逐像素复核真的在量（主采样漏掉的对比色被复核找回）');
}

// ── 6w. ⑧「真不可见 ⇒ ❌」必须有**直接**断言 ──────────────────────────────
//
// 这条路径此前只有注释和 `doesNotMatch` 在提，没有任何断言真的要求它判红 ——
// 也就是说它再退化成「静默跳过」，整套测试照样绿。而这恰恰是最该守的一条：
// **看不见的文字等于没有文字**，是最严重的对比度失败。
{
	const root = await makeTemplateRepo();
	const dir = join(root, protoRel);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'screen.png'), 'stub', 'utf8');
	await writeFile(
		join(dir, 'geometry.json'),
		JSON.stringify(
			{
				source: 'test-fixture:derived-from-artifact',
				adapter: 'fake-photocraft',
				artifact: `${protoRel}/screen.png`,
				canvas: { width: 400, height: 240 },
				elements: [
					{ name: '底', kind: 'decoration', bounds: [0, 0, 400, 240] },
					{ name: '被盖住的字', kind: 'text', bounds: [60, 40, 200, 150], sizePt: 14 },
				],
			},
			null,
			2,
		),
		'utf8',
	);
	const pixelFile = join(root, 'pixels.json');
	await writeFile(pixelFile, JSON.stringify({ default: [247, 251, 255, 255] }), 'utf8');
	const { status, out } = runGate(root, 'check-ui-geometry.mjs', [], stubEnv(pixelFile));
	assert.match(out, /❌[^\n]*完全不可见/, `整块只剩底色一种颜色 ⇒ 必须判红\n${out}`);
	assert.equal(status, 1, `判红就要 exit 1\n${out}`);
	console.log('✓ 6w ⑧ 文字整块只剩底色 ⇒ 判 ❌「完全不可见」并 exit 1');
}

// ── 6x. 从子目录运行 ⇒ ⑩ 不得静默降级 ──────────────────────────────────────
//
// 缺陷原貌：⑩ 用 `existsSync(geo.artifact)` / `samplePixels(geo.artifact)`，
// **没 resolve 到 root**（①/⑧/⑨ 都解析了）。脚本支持从子目录跑，
// 此时相对 artifact 会对着 cwd 找 ⇒ 从 `docs/` 跑就报「无 artifact，跳过
// 令牌一致性检查」，⑩ 整条不判，而且**看起来一切正常**。
{
	const f = await makeTokenFixture({ default: [247, 251, 255, 255] }); // #f7fbff 在令牌里
	const fromRoot = runGate(f.root, 'check-ui-geometry.mjs', [], stubEnv(f.pixelFile));
	const fromSub = runGateFrom(f.root, 'docs', 'check-ui-geometry.mjs', [], stubEnv(f.pixelFile));
	assert.match(fromRoot.out, /✓ ⑩/, `仓库根跑应通过 ⑩\n${fromRoot.out}`);
	assert.match(fromSub.out, /✓ ⑩/, `从子目录跑也必须通过 ⑩（同样出自仓库根）\n${fromSub.out}`);
	assert.doesNotMatch(fromSub.out, /⑩[^\n]*无 artifact/, `从子目录跑不得静默降级为无 artifact\n${fromSub.out}`);
	console.log('✓ 6x 从子目录运行 ⇒ ⑩ 照样判定（artifact 解析到仓库根）');
}

// ── 6y. ⑨ --verify 的三种行为 ─────────────────────────────────────────────
//
// `--verify` 是唯一把「几何来自产物」从声明变成验证的一步，此前**零覆盖**
// （`grep -c -- '--verify' test/scripts.test.mjs` = 0）。它最要紧的性质是
// **做不到就说做不到**：拿不到适配器时必须直接失败，而不是静默放行。
{
	const f = await makeTokenFixture({ default: [247, 251, 255, 255] });
	const infoFile = join(f.root, 'info.json');
	// ⑨ 只比 `name → bounds`（不比 kind），所以让重导结果的图层名与 bounds 跟
	// geometry.json 对齐即可 —— 传空 layers 会被判「多 4 层」。
	await writeFile(
		infoFile,
		JSON.stringify({
			width: 400,
			height: 240,
			layers: [
				{ name: '底', kind: 'Shape', bounds: [0, 0, 400, 240] },
				{ name: '卡', kind: 'Shape', bounds: [20, 20, 360, 200] },
				{ name: '主蓝区', kind: 'Shape', bounds: [40, 40, 320, 80] },
				{ name: '胶囊', kind: 'Shape', bounds: [240, 140, 100, 50] },
			],
		}),
		'utf8',
	);
	const env = { ...stubEnv(f.pixelFile), STUB_INFO: infoFile };

	const okRun = runGate(f.root, 'check-ui-geometry.mjs', ['--verify'], env);
	assert.match(okRun.out, /✓ ⑨/, `适配器可用时 ⑨ 应通过\n${okRun.out}`);

	const noAdapter = runGate(f.root, 'check-ui-geometry.mjs', ['--verify'], {
		...env,
		PHOTOCRAFT_CLI: join(f.root, 'no-such-adapter'),
	});
	assert.equal(noAdapter.status, 1, `--verify 拿不到适配器必须**直接失败**，不得静默放行\n${noAdapter.out}`);

	const notVerify = runGate(f.root, 'check-ui-geometry.mjs', [], {
		...env,
		PHOTOCRAFT_CLI: join(f.root, 'no-such-adapter'),
	});
	assert.equal(notVerify.status, 0, `不带 --verify 时适配器缺失不应判红\n${notVerify.out}`);
	assert.doesNotMatch(notVerify.out, /⑨/, `不带 --verify 就不该有 ⑨ 的行\n${notVerify.out}`);
	console.log('✓ 6y ⑨ --verify：可用则验证；拿不到适配器则直接失败；不带则不跑');
}

await Promise.all(temps.map((d) => rm(d, { recursive: true, force: true })));
console.log('\nscripts.test.mjs 全部通过');
