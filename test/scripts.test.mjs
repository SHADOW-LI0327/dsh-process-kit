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
	for (const key of ['UI 项目令牌', 'UI 原型目录']) {
		assert.ok(sec4, '应能定位 §4');
		assert.match(sec4.body, new RegExp(`\\|\\s*${key}\\s*\\|`), `§4 必须登记配置项「${key}」`);
	}
	// 两层语义色（填充档 / 文字档）是设计令牌的基本约束，避免同色既当底又当字。
	assert.match(tokens, /填充档/, '令牌表必须给出「填充档」（胶囊/标签的底）');
	assert.match(tokens, /文字档/, '令牌表必须给出「文字档」（胶囊/标签的字）');
	// 没有移动端基准，窄屏只能靠现编 —— 上一轮实测确认了这个缺口。
	assert.match(tokens, /移动端基准/, '令牌表必须给出移动端基准（画布/安全区/可点区/间距）');
	assert.match(tokens, /390/, '移动端基准必须给具体画布尺寸，不能只说「按设备适配」');
	// 「技术与手段必须声明，但整体可不用」是本层的口径 —— 模板里少了这段，就退回成
	// 「必须用某工具」，而工具选型是实现细节、不是流程判据。
	const spec = await readFile(join(PKG, 'scaffold/prd/_UI_SPEC_TEMPLATE.md'), 'utf8');
	assert.match(spec, /8\.0 技术与手段/, 'UI 规格模板必须有 §8.0 技术与手段（声明用了什么）');
	assert.match(spec, /不产出 PNG \/ PSD/, 'UI 规格模板必须明确不产出 PNG / PSD');
	assert.match(spec, /handoff\.md/, 'UI 规格模板必须要求交接表');
	// HTML 是交付主件，不是「可选方案」：只交位图 / PSD 时按未交付处理。
	assert.match(skill, /index\.html/, '技能必须把 index.html 写成交付主件入口');
	assert.match(skill, /handoff\.md/, '技能必须要求 handoff.md 交接表');
	assert.match(skill, /data-ui/, '技能必须要求 UI-NN 落在 data-ui 上');
	assert.match(skill, /PNG\/PSD 不能替代|不得作为唯一交付|按未交付处理/, '技能必须明确位图 / PSD 不是交付主件');
	assert.doesNotMatch(skill, /PhotoCraft|Photoshop/, '新技能不应再把 PS / PhotoCraft 当作交付工具');
	assert.match(spec, /8\.1 HTML 原型/, 'UI 规格模板必须有 §8.1 HTML 原型');
	assert.match(spec, /handoff\.md/, 'UI 规格模板必须要求 handoff.md');
	console.log('✓ 7 UI 默认层引用不悬空，§4 的 UI 键齐全，HTML 原型主件口径在位');
}

{
	// 7b. HTML 原型门禁：完整交付放行；PNG-only / UI-NN 漏标 / 外链均判红。
	const root = await makeTemplateRepo();
	await writeFile(
		join(root, 'docs/process/input/FEAT-UI-需求核对件.md'),
		'---\nid: FEAT-UI\nkind: requirement-check\nstatus: confirmed\ngate0: approved\nflow: full\nuiDesign: required\n---\n\n# FEAT-UI\n',
		'utf8',
	);
	await writeFile(
		join(root, 'docs/process/prd/FEAT-UI-ui-spec.md'),
		'---\nid: FEAT-UI\nkind: ui-spec\nstatus: confirmed\ngate1: approved\n---\n\n# UI\n\n| 编号 | 短名 | 判据 |\n| --- | --- | --- |\n| UI-01 | 搜索 | 可见搜索框 |\n| UI-02 | 空态 | 显示无结果 |\n',
		'utf8',
	);
	const proto = join(root, 'docs/process/prototypes/FEAT-UI');
	await mkdir(proto, { recursive: true });
	await writeFile(join(proto, 'styles.css'), 'body { color: #111; }\n', 'utf8');
	const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body><input data-ui="UI-01" data-testid="ui-01" data-state="default" aria-label="搜索"><p data-ui="UI-02" data-testid="ui-02" data-state="empty">没有找到相关商品</p></body></html>';
	await writeFile(join(proto, 'index.html'), html, 'utf8');
	await writeFile(
		join(proto, 'handoff.md'),
		'# FEAT-UI UI 交接\n\n| UI-NN | 选择器 | 组件判定 | 状态 | 令牌 | 文案 | 测试钩子 |\n| --- | --- | --- | --- | --- | --- | --- |\n| UI-01 | `[data-ui="UI-01"]` | reuse: field | default | `--text` | 搜索 | `ui-01` |\n| UI-02 | `[data-ui="UI-02"]` | new | empty | `--muted` | 没有找到相关商品 | `ui-02` |\n',
		'utf8',
	);
	let r = runGate(root, 'check-ui-prototype.mjs', ['--pkg', 'FEAT-UI']);
	assert.equal(r.status, 0, `完整 HTML 原型应放行\n${r.out}`);
	assert.match(r.out, /data-ui 覆盖/, `应报告 UI-NN 覆盖\n${r.out}`);

	// PNG-only：没有 index.html，只有图 ⇒ 未交付。
	await rename(join(proto, 'index.html'), join(proto, 'screen.png'));
	r = runGate(root, 'check-ui-prototype.mjs', ['--pkg', 'FEAT-UI']);
	assert.equal(r.status, 1, `只有 PNG 没有 HTML 必须判红\n${r.out}`);
	assert.match(r.out, /缺少 .*index\.html/, `应点名缺少 HTML 入口\n${r.out}`);
	await rename(join(proto, 'screen.png'), join(proto, 'index.html'));

	// UI-NN 漏标 ⇒ 判红。
	await writeFile(join(proto, 'index.html'), html.replace(' data-ui="UI-02"', ''), 'utf8');
	r = runGate(root, 'check-ui-prototype.mjs', ['--pkg', 'FEAT-UI']);
	assert.equal(r.status, 1, `UI-02 漏标必须判红\n${r.out}`);
	assert.match(r.out, /UI-02/, `应点名漏掉的 UI-02\n${r.out}`);
	await writeFile(join(proto, 'index.html'), html, 'utf8');

	// 外部网络资源（绝对 + 协议相对）⇒ 判红。
	await writeFile(join(proto, 'index.html'), html.replace('</head>', '<script src="https://cdn.example.com/x.js"></script></head>'), 'utf8');
	r = runGate(root, 'check-ui-prototype.mjs', ['--pkg', 'FEAT-UI']);
	assert.equal(r.status, 1, `外部 CDN 必须判红\n${r.out}`);
	assert.match(r.out, /外部/, `应点名外部资源\n${r.out}`);
	await writeFile(join(proto, 'index.html'), html.replace('</head>', '<script src="//cdn.example.com/x.js"></script></head>'), 'utf8');
	r = runGate(root, 'check-ui-prototype.mjs', ['--pkg', 'FEAT-UI']);
	assert.equal(r.status, 1, `协议相对 CDN 必须判红\n${r.out}`);
	await writeFile(join(proto, 'index.html'), html, 'utf8');
	console.log('✓ 7b HTML 原型门禁：完整交付放行；PNG-only / UI-NN 漏标 / 绝对与协议相对外链均判红');
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

	// journal 追加会**旁挂一个指纹文件** `<ID>.journal.jsonl.meta.json`（见 journal-append.mjs：
	// 锁 + 指纹校验要用它）。§3 里**拥有 journal 的那一行**必须自己覆盖它 ——
	// 靠 pm 的 `docs/process/prd/**` 顺带兜住是不算数的：真实项目把 pm 行收窄成 `prd/*.md`
	// 很常见（§3 明说变量路径用 `*` 通配），那时框架自己的 audit 文件就会被框架自己的门禁判越界。
	//
	// 只留 **orchestrator**（journal 的属主）那一行当 §3 ⇒ 旁挂文件仍必须放行。
	const orchRow = exampleLines
		.filter((l) => l.includes('<role-orchestrator>'))
		.map((l) => `| role-orch |${l.split('|')[2]}| - |`)
		.join('\n');
	assert.ok(orchRow.includes('role-orch'), '模板 §3 示例里应有 orchestrator 行');
	await writeFile(projectPath, md.replace(placeholderRow, orchRow), 'utf8');
	// 先把脚手架本身标记为已跟踪（未跟踪 = 会进下一次提交的东西，门禁只查这些），
	// 再落 journal 的两个文件 —— 否则「orchestrator 单行」这一场会把整套脚手架算成越界。
	execFileSync('git', ['add', '-A'], { cwd: root });
	await mkdir(join(root, 'docs/process/prd'), { recursive: true });
	await writeFile(join(root, 'docs/process/prd/FEAT-01.journal.jsonl'), '', 'utf8');
	await writeFile(
		join(root, 'docs/process/prd/FEAT-01.journal.jsonl.meta.json'),
		'{}\n',
		'utf8',
	);
	const owned = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(
		owned.status,
		0,
		`journal 的属主行必须覆盖 journal 工具产出的全部文件（含 .meta.json 旁挂指纹）\n${owned.out}`,
	);

	await writeFile(projectPath, md.replace(placeholderRow, realRows), 'utf8');
	const { status, out } = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(status, 0, `脚手架落地的文件必须全部被 §3 示例放行\n${out}`);
	assert.match(out, /✓ 无越界落点/, `即便照抄示例行也应无越界\n${out}`);
	console.log('✓ 6l 脚手架落地的每个文件都被 §3 示例覆盖（含 journal 属主行覆盖 .meta.json）');
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

// ── 6m-bis. 升级备份 `<文件>.bak-<时间戳>` 属临时件，不得判越界 ───────────────
//
// 缺陷原貌：`process_init(upgrade: true)` 把旧版备份写在被覆盖文件旁边，
// 落点门禁不认识它 ⇒ **升级完立刻 exit 1**，框架自己的产物被自己判越界。

{
	const root = await makeTemplateRepo();
	const projectPath = join(root, projectRel);
	const md = (await readFile(projectPath, 'utf8')).replace(
		placeholderRow,
		'| orchestrator | `docs/process/**` · `scripts/process/**` | `<禁止>` |',
	);
	await writeFile(projectPath, md, 'utf8');
	await writeFile(join(root, 'README.md.bak-20261014044441'), '# 旧版\n', 'utf8');
	const transient = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(transient.status, 0, `升级备份应被当作临时件排除\n${transient.out}`);
	assert.match(transient.out, /已排除临时件 1 个/, `应报告排除数量\n${transient.out}`);

	// 反向约束：只有 `<文件>.bak-<时间戳>` 这个形状算临时件，其它 `.bak` 仍照判越界。
	await rm(join(root, 'README.md.bak-20261014044441'));
	await writeFile(join(root, 'README.md.bak'), '# 旧版\n', 'utf8');
	const control = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(control.status, 1, `无时间戳的 .bak 不是升级备份，仍应判越界\n${control.out}`);
	console.log('✓ 6m-bis 升级备份排除、其它 .bak 照判越界');
}

// ── 6m-ter. 卸载清单是框架元数据，不得被落点门禁判越界 ─────────────────────
//
// 旧版门禁只认「过程产物」：`process_init` 新写的 `.process-kit.json` 不在
// PROJECT.md §3 的普通路径里 ⇒ 初始化完第一次跑门禁就红。清单是框架自己的
// 文件，不是角色产物，必须显式跳过；同时不能把任意点文件都放过。

{
	const root = await tempRepo();
	await mkdir(join(root, 'docs/process'), { recursive: true });
	const project = (await readFile(join(PKG, 'scaffold/PROJECT.md'), 'utf8')).replace(
		placeholderRow,
		'| orchestrator | `docs/process/PROJECT.md` · `docs/process/README.md` · `scripts/process/**` | `<禁止>` |',
	);
	await writeFile(join(root, 'docs/process/PROJECT.md'), project, 'utf8');
	await writeFile(join(root, 'docs/process/README.md'), '# 流程\n', 'utf8');
	await writeFile(join(root, 'docs/process/.process-kit.json'), '{}\n', 'utf8');
	await mkdir(join(root, 'scripts/process'), { recursive: true });
	await cp(join(PKG, 'scripts/check-artifact-paths.mjs'), join(root, 'scripts/process/check-artifact-paths.mjs'));
	await cp(join(PKG, 'scripts/project-config.mjs'), join(root, 'scripts/process/project-config.mjs'));
	await cp(join(PKG, 'scripts/i18n.mjs'), join(root, 'scripts/process/i18n.mjs'));
	execFileSync('git', ['init', '-q', '.'], { cwd: root });

	const meta = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(meta.status, 0, `卸载清单应被跳过\n${meta.out}`);
	assert.match(meta.out, /已跳过框架元数据 1 个/, `应报告跳过清单\n${meta.out}`);

	// 反向对照：换个点文件仍要判越界（不能把「点文件」整体放过）
	await rm(join(root, 'docs/process/.process-kit.json'));
	await writeFile(join(root, 'docs/process/.other.json'), '{}\n', 'utf8');
	const control = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(control.status, 1, `其它未授权点文件仍应判越界\n${control.out}`);
	console.log('✓ 6m-ter 卸载清单跳过、其它点文件照判越界');
}

// ── 6s. 每个角色技能都必须出现在常驻指针 AGENTS 模板的清单里 ─────────────────
//
// 「加了一个角色，但忘了把它写进派单说明」是个很容易犯、又很难发现的错：
// 插件管理器里能看到 9 个角色，主控却永远想不到派第 9 个。这条把它钉住。

{
	const skills = (await readdir(join(PKG, 'skills'), { withFileTypes: true }))
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
	assert.ok(skills.length >= 9, `应至少有 9 个角色技能，实际 ${skills.length}`);
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

// ── 8. ⑫ 越界事后判定（role boundary post-hoc check） ──────────────────────
//
// 为什么钉它：角色边界只写在提示词里（角色管效率，交付质量由人在 Gate 上裁定）⇒
// 「越界改了不该改的文件」在机器侧**一点痕迹都没有**，只有人碰巧翻 diff 才发现。
// ⑫ 把**机械可判**的那部分暴露出来供人裁定 —— 它是**判定不是拦截**，而且**判不了就跳过**
// （fail-open）：假红会把人指去改一个根本没问题的文件，比不判更糟。
// ⚠️ 这条 fail-open 是**判据级**的：脚本级前置条件（无 docs/process / 无 PROJECT.md）不满足时
// 仍然 exit 1（见 8h）—— 「整个脚本没法干活」和「干了活但这一条没判据」不是一回事。
// 所以下面两个方向都测：只判红的检查等于没用，只判绿的检查等于没写。

/**
 * ⑫ 的装置：**真 git 仓库**（`git init` + 真实提交 + 真实改动），不 mock。
 * 装置本身在改动之前就提交掉了 —— ⑫ 只看「相对 HEAD 的改动」，若装置文件混进改动集，
 * 要判的那一条就会被「谁改了 journal / PROJECT.md」淹掉（实测踩过）。
 * §3 填真值：dev 管 `src/**`、test 管 `test/**`、uat 管 `e2e/**`、orchestrator 管 `docs/process/**`。
 * `extra`：额外改动（对象或数组），用于验证豁免边界 —— 新文件要 add 才进改动集。
 */
async function makeBoundaryFixture({ journal = [], placeholderS3 = false, change = 'test', extra = null } = {}) {
	const root = await makeTemplateRepo();
	const projectPath = join(root, projectRel);
	const md = await readFile(projectPath, 'utf8');
	if (!placeholderS3) {
		const rows = [
			'| orchestrator | `docs/process/**` | - |',
			'| dev | `src/**` | `test/**` |',
			'| test | `test/**` | `src/**` |',
			'| uat | `e2e/**` | - |',
		].join('\n');
		const next = md.replace(placeholderRow, rows);
		assert.notEqual(next, md, '未替换 §3 占位行');
		await writeFile(projectPath, next, 'utf8');
	}
	await mkdir(join(root, 'docs/process/prd'), { recursive: true });
	await writeFile(
		join(root, 'docs/process/prd/FEAT-01.journal.jsonl'),
		journal.map((e) => JSON.stringify(e)).join('\n') + (journal.length ? '\n' : ''),
		'utf8',
	);
	await mkdir(join(root, 'test'), { recursive: true });
	await mkdir(join(root, 'src'), { recursive: true });
	// 测试文件**不带** @prd：否则 ② 会因为「没有 rules/FEAT-01.yaml」先判红，⑫ 就不是唯一的 ❌ 了
	await writeFile(join(root, 'test/foo.test.mjs'), '// 测试文件\n', 'utf8');
	await writeFile(join(root, 'src/keep.ts'), 'export const x = 1;\n', 'utf8');
	execFileSync('git', ['add', '-A'], { cwd: root });
	execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'fixture'], {
		cwd: root,
	});
	// 真实改动（未提交）：默认 = 末条环节 dev 的改动集里出现测试文件
	if (change === 'test') {
		await writeFile(join(root, 'test/foo.test.mjs'), '// 测试文件\n// dev 越界改了测试\n', 'utf8');
	} else if (change === 'src') {
		await writeFile(join(root, 'src/keep.ts'), 'export const x = 2;\n', 'utf8');
	} else if (change === 'misc') {
		await mkdir(join(root, 'misc'), { recursive: true });
		await writeFile(join(root, 'misc/thing.ts'), '// 没登记进 §3 的新文件\n', 'utf8');
		// ⚠️ 必须 add：⑫ 的改动集只取 `git diff` + `git diff --cached`，
		// 未跟踪又未暂存的新文件**不在其中**（那一批由落点门禁 check-artifact-paths 兜）。
		execFileSync('git', ['add', 'misc/thing.ts'], { cwd: root });
	} else if (change === 'journal') {
		// 真实场景：dev 环节用 journal-append / process_journal 追加了一条 journal
		await appendJournal(root, { ...DEV_WRITE, note: 'dev 又追加了一条 journal' });
	}
	// 额外改动（验证豁免边界的正/反例）：新文件要 add，否则不在 `git diff` 的改动集里（见上）。
	for (const e of extra === null ? [] : Array.isArray(extra) ? extra : [extra]) {
		await mkdir(dirname(join(root, e.path)), { recursive: true });
		await writeFile(join(root, e.path), e.content, 'utf8');
		execFileSync('git', ['add', e.path], { cwd: root });
	}
	return root;
}

/** 向该包的 journal 追加一条（模拟 journal-append 的落盘结果）。 */
async function appendJournal(root, entry) {
	const p = join(root, 'docs/process/prd/FEAT-01.journal.jsonl');
	await writeFile(p, (await readFile(p, 'utf8')) + JSON.stringify(entry) + '\n', 'utf8');
}

const DEV_WRITE = {
	at: '2026-01-01T01:00:00Z',
	actor: 'subagent:dev-agent',
	step: 'dev',
	action: 'write',
	note: 'dev 改实现',
};

{
	// 8a. 正向红（最主要的一条）：dev 环节的改动集里出现测试文件，journal 无 approve。
	const root = await makeBoundaryFixture({ journal: [DEV_WRITE] });
	const { status, out } = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(status, 1, `dev 环节改测试文件且无 approve ⇒ 必须 exit 1\n${out}`);
	assert.match(out, /❌ ⑫a .*test\/foo\.test\.mjs/, `应点名越界的那个测试文件\n${out}`);
	assert.match(out, /dev 环节不得改测试/, `应说清越界的性质（谁改了谁的哨子）\n${out}`);
	// ⑫a 必须是**唯一**的 ❌：否则这条用例可能被别的红"捎带"着绿/红，断言就失去意义
	assert.match(out, /check-rules：\d+ ✓ \/ 1 ❌/, `⑫a 应是本轮唯一的 ❌\n${out}`);
	console.log('✓ 8a ⑫a 正向红：dev 环节改测试文件且无 approve ⇒ 判红');
}

{
	// 8b. 反向绿：同样的改动集，journal 里有一条 approve **点名覆盖**该文件 ⇒ 放行。
	//     关键：approve 记在**中间**、末条仍是 dev —— 绿必须来自「approve 覆盖」，
	//     而不是末条环节碰巧变成了 test（那样这条用例就什么都没验）。
	const root = await makeBoundaryFixture({
		journal: [
			{ at: '2026-01-01T00:00:00Z', actor: 'subagent:test-agent', step: 'test', action: 'write' },
			{
				at: '2026-01-01T00:10:00Z',
				actor: 'orchestrator',
				step: 'orchestrator',
				action: 'approve',
				note: 'dev 改测试已由人裁定',
				files: ['test/foo.test.mjs'],
			},
			DEV_WRITE,
		],
	});
	const { status, out } = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(status, 0, `approve 点名覆盖后应放行\n${out}`);
	assert.doesNotMatch(out, /❌ ⑫/, `被 approve 覆盖的文件不得再判红\n${out}`);
	// 绿必须来自"approve 覆盖"，而不是"⑫ 压根没判"（跳过 / 无法判定都会留下可见的 ⚠）
	assert.doesNotMatch(out, /⑫ 跳过|⑫ 无法判定/, `绿只能来自 approve 覆盖，不能来自跳过\n${out}`);
	console.log('✓ 8b ⑫ 反向绿：approve 点名覆盖该文件 ⇒ 放行（与 8a 同一改动集，差异只有 approve）');
}

{
	// 8c. 反作弊：journal 里有 approve，但点名的是**别的文件** ⇒ 照判红。
	//     没有这一条，一个"见到 approve 就放行"的实现也能让 8b 全绿。
	const root = await makeBoundaryFixture({
		journal: [
			{
				at: '2026-01-01T00:10:00Z',
				actor: 'orchestrator',
				step: 'orchestrator',
				action: 'approve',
				files: ['src/whatever.ts'],
			},
			DEV_WRITE,
		],
	});
	const { status, out } = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(status, 1, `approve 没点名该文件 ⇒ 不得当成覆盖\n${out}`);
	assert.match(out, /❌ ⑫a .*test\/foo\.test\.mjs/, `应仍然点名该测试文件\n${out}`);
	console.log('✓ 8c ⑫ approve 必须点名该文件才算覆盖（点名别人不豁免）');
}

{
	// 8d. 反向对照（防"见谁咬谁"）：dev 环节改的是自己该改的 `src/**` ⇒ 不判红。
	//     只会判红的检查等于没用 —— 这一条保证 ⑫ 不是"有改动就红"。
	const root = await makeBoundaryFixture({ journal: [DEV_WRITE], change: 'src' });
	const { status, out } = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(status, 0, `dev 改自己名下的 src ⇒ 不该判红\n${out}`);
	assert.doesNotMatch(out, /❌ ⑫/, `归属一致就不得判红\n${out}`);
	// 判成"归属一致"而不是"跳过 / 无法判定"：后者都会留下可见的 ⚠
	assert.doesNotMatch(out, /⑫ 跳过|⑫ 无法判定/, `应判成归属一致，而不是跳过\n${out}`);
	console.log('✓ 8d ⑫ 反向对照：dev 改自己名下的 src ⇒ 不判红（不是"有改动就红"）');
}

{
	// 8e. fail-open：§3 全是占位符 ⇒ 跳过并 exit 0，且**明说跳过**（不得假装查过）。
	const root = await makeBoundaryFixture({ journal: [DEV_WRITE], placeholderS3: true });
	const { status, out } = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(status, 0, `§3 未配置时无从判定 ⇒ 跳过而不是判红\n${out}`);
	assert.match(out, /⑫ 跳过：PROJECT.md §3.*占位符/, `必须说清跳过的原因\n${out}`);
	assert.match(out, /无法判定 1 个改动文件归谁/, `应报出无从判定的文件数\n${out}`);
	assert.doesNotMatch(out, /❌ ⑫/, `跳过不得产出 ❌\n${out}`);
	console.log('✓ 8e ⑫ fail-open：§3 是占位符 ⇒ 跳过并 exit 0（明说跳过）');
}

{
	// 8f. fail-open：属主表里找不到该文件的类别 ⇒ **不判**（不猜）。
	const root = await makeBoundaryFixture({ journal: [DEV_WRITE], change: 'misc' });
	const { status, out } = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(status, 0, `归属定不了就不判，不得靠猜判红\n${out}`);
	assert.match(out, /⑫ 无法判定 misc\/thing\.ts 的归属/, `应逐个说明哪些文件无法判定\n${out}`);
	assert.doesNotMatch(out, /❌ ⑫/, `无法判定不得产出 ❌\n${out}`);
	console.log('✓ 8f ⑫ fail-open：属主表里无匹配类别 ⇒ 不判（不猜）');
}

{
	// 8g. fail-open：没有包 ID（也没给 --id、改动集里推断不出）⇒ 跳过。
	const root = await makeBoundaryFixture({ journal: [DEV_WRITE] });
	const { status, out } = runGate(root, 'check-rules.mjs');
	assert.equal(status, 0, `定不了包 ⇒ 没有 journal 可对，跳过\n${out}`);
	assert.match(out, /⑫ 跳过：未指定需求包 ID/, `应提示用 --id 指定\n${out}`);
	assert.doesNotMatch(out, /❌ ⑫/, `跳过不得产出 ❌\n${out}`);
	console.log('✓ 8g ⑫ fail-open：定不了需求包 ID ⇒ 跳过并 exit 0');
}

{
	// 8i. fail-open：末条环节归一后认不出是谁（如 step 写成「（人）」这种纯标注）⇒ 跳过。
	//     没有这一步，"空角色名"会拿去跟每个归属比 ⇒ 见谁咬谁，整片假红。
	const root = await makeBoundaryFixture({
		journal: [{ at: '2026-01-01T01:00:00Z', actor: 'human', step: '（人）', action: 'note' }],
	});
	const { status, out } = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(status, 0, `认不出环节名 ⇒ 跳过，不得拿空串去比\n${out}`);
	assert.match(out, /⑫ 跳过：journal 末条环节.*归一后为空/, `应说清认不出环节\n${out}`);
	assert.doesNotMatch(out, /❌ ⑫/, `跳过不得产出 ❌\n${out}`);
	console.log('✓ 8i ⑫ fail-open：末条环节归一后为空 ⇒ 跳过（不拿空串去比）');
}

{
	// 8h. **脚本级**前置条件：没有 docs/process/（脚本已就位、流程未初始化）⇒ **exit 1** 并说明理由。
	//     为什么不能给 0：「整个脚本没法干活」与「干了活但这一条没判据」不是一回事 ——
	//     前者给 0 就是把空转报成绿，CI 会把"没查"当"合格"。⑫ 的 fail-open 只到**判据级**。
	const root = await tempRepo();
	await cp(join(PKG, 'scripts'), join(root, 'scripts/process'), { recursive: true });
	execFileSync('git', ['init', '-q', '.'], { cwd: root });
	const { status, out } = runGate(root, 'check-rules.mjs');
	assert.equal(status, 1, `流程未初始化 ⇒ 脚本级配置缺失必须 exit 1\n${out}`);
	assert.match(out, /没有 docs\/process\//, `应说清拒绝的理由\n${out}`);
	assert.match(out, /退出码：1（配置缺失）/, `应给出退出码口径\n${out}`);
	assert.doesNotMatch(out, /⑫ 跳过/, `脚本级失败不是"⑫ 跳过"（那是判据级的事）\n${out}`);
	console.log('✓ 8h 脚本级前置条件：无 docs/process ⇒ exit 1（⑫ 的 fail-open 只到判据级）');
}

{
	// 8j. ⑫ 豁免：改动集**只含** journal 文件 ⇒ 不判红，且**不因此整轮跳过**。
	//     journal 现在是「流程目录整棵树豁免」（见 8l）的**真子集**，本条保留作回归：
	//     钉住"豁免 ≠ 整轮跳过"与"旁挂件（meta/bak/lock）同属豁免"这两点。
	const root = await makeBoundaryFixture({ journal: [DEV_WRITE], change: 'journal' });
	const { status, out } = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(status, 0, `只改 journal ⇒ 不得判红\n${out}`);
	assert.doesNotMatch(out, /❌ ⑫/, `journal 自身不得被判越界\n${out}`);
	// 关键：豁免 ≠ 整轮跳过 —— ⑫ 不得打「跳过」，否则这条用例会掩盖「这一条根本没判」
	assert.doesNotMatch(out, /⑫ 跳过/, `journal 豁免是"这一条不判"，不是整轮跳过\n${out}`);

	// 旁挂件走的是**另一条**正则分支（journal-append 自产的指纹 / 备份 / 锁文件），逐个钉：
	// `.meta.json` / `.bak` / `.lock` 都得豁免 —— 少放一个就是假红，多放一个就是放掉真越界。
	for (const suffix of ['.meta.json', '.bak', '.lock']) {
		const rel = `docs/process/prd/FEAT-01.journal.jsonl${suffix}`;
		await writeFile(join(root, rel), 'synthetic sidecar\n', 'utf8');
		execFileSync('git', ['add', rel], { cwd: root });
	}
	const sidecar = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(sidecar.status, 0, `journal 旁挂的三种文件同样豁免\n${sidecar.out}`);
	assert.doesNotMatch(sidecar.out, /❌ ⑫/, `旁挂件不得被判越界\n${sidecar.out}`);
	assert.doesNotMatch(sidecar.out, /⑫ 跳过/, `旁挂件豁免同样不是整轮跳过\n${sidecar.out}`);

	// 第二轮：让**别的**判据红起来（规则表 prdVersion=2 ≠ PRD prdVersion=1），
	// 证明「其余判据照判」，且 journal 豁免不会顺手吃掉别的红。
	execFileSync('git', ['add', '-A'], { cwd: root });
	execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'journal'], {
		cwd: root,
	});
	await mkdir(join(root, 'docs/process/rules'), { recursive: true });
	await writeFile(join(root, 'docs/process/rules/FEAT-01.yaml'), 'prdVersion: 2\ncases: []\n', 'utf8');
	await writeFile(
		join(root, 'docs/process/prd/FEAT-01.md'),
		'---\nid: FEAT-01\nstatus: draft\nprdVersion: 1\n---\n',
		'utf8',
	);
	execFileSync('git', ['add', '-A'], { cwd: root });
	execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'rules+prd'], {
		cwd: root,
	});
	await appendJournal(root, { ...DEV_WRITE, note: '第二轮又追加了一条 journal' });
	const second = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.match(second.out, /❌ ⑥ /, `其余判据必须照判（这一轮的红应来自 ⑥）\n${second.out}`);
	assert.doesNotMatch(second.out, /❌ ⑫/, `journal 豁免不因别的红而失效\n${second.out}`);
	assert.equal(second.status, 1, `红来自 ⑥，不是 ⑫\n${second.out}`);
	console.log('✓ 8j ⑫ 豁免（窄）：只改 journal ⇒ ⑫ 不红也不跳过；同时其余判据照判');
}

{
	// 8k. 豁免边界：同一轮里「流程目录内豁免、流程目录外照判」。
	//     反例取**流程目录之外**的 e2e 目录（§3 归 uat）—— dev 动 uat 的东西才是真越界。
	//     没有这一条，把豁免写宽（例如连 e2e 一起放过）也能让 8j/8l 全绿。
	const root = await makeBoundaryFixture({
		journal: [DEV_WRITE],
		change: 'journal',
		extra: { path: 'e2e/checkout.spec.ts', content: '// uat 的 e2e\n' },
	});
	const { status, out } = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(status, 1, `流程目录之外的越界必须照判\n${out}`);
	assert.match(out, /❌ ⑫ e2e\/checkout\.spec\.ts/, `应点名流程目录之外的那个越界文件\n${out}`);
	assert.doesNotMatch(out, /❌ ⑫[^\n]*\.journal\.jsonl/, `流程目录内的 journal 仍不得判红\n${out}`);
	console.log('✓ 8k ⑫ 边界：流程目录内豁免、目录外的 e2e（归 uat）照样判红');
}

{
	// 8l. **不会恒红**（这条才是本轮改边界的理由）：dev 环节的改动集里带上流程目录下的普通产物
	//     —— PRD（主控改状态位）、设计稿、架构件、规则表 —— 必须 **status 0、无 ❌ ⑫、且不显示「⑫ 跳过」**。
	//     若哪天又按属主表去判流程目录，这条会立刻红：⑫ 会退回"每包每次必红"，人也就不再看了。
	const root = await makeBoundaryFixture({
		journal: [DEV_WRITE],
		change: 'journal',
		extra: [
			// 主控在 Gate 后改的就是这个 frontmatter 状态位（属主 pm）—— 恒红推理的源头
			{ path: 'docs/process/prd/FEAT-01.md', content: '---\nid: FEAT-01\nstatus: draft\nprdVersion: 1\n---\n' },
			{ path: 'docs/process/prd/FEAT-01-design.md', content: '# 设计与说明\n' },
			{ path: 'docs/process/prd/FEAT-01-arch.md', content: '---\nid: FEAT-01\nkind: arch\nprdVersion: 1\n---\n# 架构设计与取舍\n' },
			// prdVersion 与 PRD 保持一致：本轮只验 ⑫ 的边界，别让 ⑥ 先红了
			{ path: 'docs/process/rules/FEAT-01.yaml', content: 'prdVersion: 1\ncases: []\n' },
		],
	});
	const { status, out } = runGate(root, 'check-rules.mjs', ['--id', 'FEAT-01']);
	assert.equal(status, 0, `流程目录下的产物不得判红（否则 ⑫ 恒红）\n${out}`);
	assert.doesNotMatch(out, /❌ ⑫/, `流程目录整棵树都在判定边界之外\n${out}`);
	assert.doesNotMatch(out, /⑫ 跳过/, `这是"这一条不判"，不是整轮跳过\n${out}`);
	console.log('✓ 8l ⑫ 边界：流程目录下的普通产物（PRD/设计稿/架构件/规则表）⇒ 不红、不跳过（不会恒红）');
}

// ── 9a. 落点门禁：`git add` / 入库之后不得「空放行」（实测：69/69 → 0/0，两次都绿）─────

{
	const root = await makeTemplateRepo();
	await writeFile(
		join(root, projectRel),
		(await readFile(join(root, projectRel), 'utf8')).replace(
			placeholderRow,
			'| orchestrator | `docs/process/**` · `scripts/process/**` | `<禁止>` |',
		),
		'utf8',
	);
	const stray = '乱放/越界产物.md';
	await mkdir(join(root, '乱放'), { recursive: true });
	await writeFile(join(root, stray), '# 越界\n', 'utf8');
	// 一个正常的仓库根文件（真实项目里 package.json 就这么出现）：它同样不在 §3 里
	await writeFile(join(root, 'package.json'), '{"name":"x"}\n', 'utf8');

	const before = runGate(root, 'check-artifact-paths.mjs');
	assert.equal(before.status, 1, `未跟踪的越界文件必须判红\n${before.out}`);
	assert.match(before.out, /乱放\/越界产物\.md/);

	execFileSync('git', ['add', '-A'], { cwd: root });

	// ★ 核心回归：`git add` 之后默认模式看不见它 ⇒ 必须如实报「空转」，且**不得打绿**
	const afterAdd = runGate(root, 'check-artifact-paths.mjs');
	assert.match(afterAdd.out, /⚠ 空转/, `git add 之后默认模式一片空白，必须报空转\n${afterAdd.out}`);
	assert.doesNotMatch(afterAdd.out, /✓ 无越界落点/, `空转不许输出「无越界落点」这个结论\n${afterAdd.out}`);

	const staged = runGate(root, 'check-artifact-paths.mjs', ['--staged']);
	assert.equal(staged.status, 1, `--staged 必须补上 git add 的盲区\n${staged.out}`);
	assert.match(staged.out, /乱放\/越界产物\.md/);

	execFileSync('git', ['-c', 'user.email=t@e.local', '-c', 'user.name=t', 'commit', '-qm', 'c1'], { cwd: root });

	const committed = runGate(root, 'check-artifact-paths.mjs', ['--committed']);
	assert.equal(committed.status, 1, `--committed 必须能事后审计已入库的越界产物\n${committed.out}`);
	assert.match(committed.out, /乱放\/越界产物\.md/);

	// 反向对照：只**修改**已入库文件（不新增）的提交不得判红 —— 这正是 --diff-filter=A 的理由
	await writeFile(join(root, 'package.json'), '{"name":"x","v":2}\n', 'utf8');
	execFileSync('git', ['add', '-A'], { cwd: root });
	execFileSync('git', ['-c', 'user.email=t@e.local', '-c', 'user.name=t', 'commit', '-qm', 'c2'], { cwd: root });
	const edited = runGate(root, 'check-artifact-paths.mjs', ['--committed']);
	assert.equal(edited.status, 0, `只改不增的提交不得判越界（否则每次改 README 都红）\n${edited.out}`);
	assert.doesNotMatch(edited.out, /❌ 越界/);

	// 合并提交：`git show` 默认不展开 ⇒ 必须报空转并说明「这是合并提交」，
	// 不能让人把它误读成「这个提交没有新增文件」
	execFileSync('git', ['-c', 'user.email=t@e.local', '-c', 'user.name=t', 'checkout', '-qb', 'side'], { cwd: root });
	await writeFile(join(root, '乱放/合并产物.md'), '# x\n', 'utf8');
	execFileSync('git', ['add', '-A'], { cwd: root });
	execFileSync('git', ['-c', 'user.email=t@e.local', '-c', 'user.name=t', 'commit', '-qm', 'side'], { cwd: root });
	execFileSync('git', ['-c', 'user.email=t@e.local', '-c', 'user.name=t', 'checkout', '-q', '-'], { cwd: root });
	execFileSync('git', ['-c', 'user.email=t@e.local', '-c', 'user.name=t', 'merge', '--no-ff', '-qm', 'merge', 'side'], { cwd: root });
	const merged = runGate(root, 'check-artifact-paths.mjs', ['--committed']);
	assert.match(merged.out, /合并提交/, `合并提交必须说明原因\n${merged.out}`);
	assert.doesNotMatch(merged.out, /✓ 无越界落点/, merged.out);

	// 参数拼错必须拒绝，不能静默退回默认模式
	const badArg = runGate(root, 'check-artifact-paths.mjs', ['--stagedd']);
	assert.equal(badArg.status, 1, '不认识的参数必须拒绝');
	assert.match(badArg.out, /不认识的参数/);
	console.log('✓ 9a 落点门禁：--staged / --committed 补上 add 与入库后的盲区，空转不打绿');
}

// ── 9b. sync-prd-version：产物存在但缺 prdVersion 字段行 ⇒ 判不一致（曾被当跳过）──────

{
	const root = await makeTemplateRepo();
	await writeFile(
		join(root, 'docs/process/prd/FEAT-09.md'),
		'---\nid: FEAT-09\nstatus: draft\nprdVersion: 3\n---\n\n# PRD\n',
		'utf8',
	);
	await mkdir(join(root, 'docs/process/rules'), { recursive: true });
	await writeFile(join(root, 'docs/process/rules/FEAT-09.yaml'), 'prdVersion: 3\ncases: []\n', 'utf8');

	// 控制组：设计件**不存在** ⇒ 跳过（fail-open，不能误伤还没产出设计件的包）
	const noDesign = runGate(root, 'sync-prd-version.mjs', ['FEAT-09', '--check']);
	assert.equal(noDesign.status, 0, `没有设计件时应跳过而不是判红\n${noDesign.out}`);

	// 实验组：设计件存在但没有 prdVersion 字段行 ⇒ 判红
	await writeFile(
		join(root, 'docs/process/prd/FEAT-09-design.md'),
		'---\nid: FEAT-09\n---\n\n# 设计与说明\n',
		'utf8',
	);
	const missing = runGate(root, 'sync-prd-version.mjs', ['FEAT-09', '--check']);
	assert.equal(missing.status, 1, `缺字段行必须判红（曾被当跳过 ⇒ CI 抓不到）\n${missing.out}`);
	assert.match(missing.out, /没有 prdVersion 字段行/);
	assert.match(missing.out, /声明位不齐/);

	// 反向对照：补上且一致 ⇒ 回归绿
	await writeFile(
		join(root, 'docs/process/prd/FEAT-09-design.md'),
		'---\nid: FEAT-09\nprdVersion: 3\n---\n\n# 设计与说明\n',
		'utf8',
	);
	const ok = runGate(root, 'sync-prd-version.mjs', ['FEAT-09', '--check']);
	assert.equal(ok.status, 0, `字段齐备且一致时必须绿\n${ok.out}`);
	assert.match(ok.out, /文件级头已全部一致/);

	// 架构设计与取舍同理：存在但缺字段 ⇒ 判红；补上一致 ⇒ 绿
	await writeFile(
		join(root, 'docs/process/prd/FEAT-09-arch.md'),
		'---\nid: FEAT-09\nkind: arch\n---\n\n# 架构设计与取舍\n',
		'utf8',
	);
	const archMissing = runGate(root, 'sync-prd-version.mjs', ['FEAT-09', '--check']);
	assert.equal(archMissing.status, 1, `arch 件缺 prdVersion 字段行必须判红\n${archMissing.out}`);
	assert.match(archMissing.out, /架构设计与取舍/);
	await writeFile(
		join(root, 'docs/process/prd/FEAT-09-arch.md'),
		'---\nid: FEAT-09\nkind: arch\nprdVersion: 3\n---\n\n# 架构设计与取舍\n',
		'utf8',
	);
	const archOk = runGate(root, 'sync-prd-version.mjs', ['FEAT-09', '--check']);
	assert.equal(archOk.status, 0, `arch 件字段齐备且一致时必须绿\n${archOk.out}`);
	console.log('✓ 9b sync-prd-version：缺 prdVersion 字段行判不一致，缺文件仍跳过（含 arch 件）');
}

// ── 10. 通过明细必须可见；缺 automation 时不得渲染空括号 ──────────────────
//
// 缺陷原貌：脚本把 ok() 只当计数器，`N ✓` 之外一条明细都不打 ⇒ 「哪条判据过了、看到了什么」
// 既不可抽查也无法与 journal 记录对账（与「空转不打绿」同一条纪律）。另：台账缺
// `automation` 时，①/⑪ 的文案会渲染成「① TC-x → （非自动化类型…）」这种空括号。

{
	const root = await makeTemplateRepo();
	const projectPath = join(root, projectRel);
	const md = (await readFile(projectPath, 'utf8')).replace(
		placeholderRow,
		'| orchestrator | `docs/process/**` | `<禁止>` |',
	);
	assert.notEqual(md, await readFile(projectPath, 'utf8'), '未替换 §3 占位行');
	await writeFile(projectPath, md, 'utf8');
	await mkdir(join(root, 'docs/process/rules'), { recursive: true });
	// 一条台账：**缺 automation、缺 carrier** —— 正好走 ①/⑪ 的空括号分支
	await writeFile(
		join(root, 'docs/process/rules/FEAT-77.yaml'),
		'# 合计 1 条\n\n- id: TC-FEAT-77-1\n  ac: AC-1\n  case: 未声明自动化类型\n',
		'utf8',
	);

	const { out } = runGate(root, 'check-rules.mjs');
	assert.match(out, /通过明细/, `必须打印通过明细，不能只报计数\n${out}`);
	assert.match(out, /✓ ④ import 白名单扫描/, `通过明细应带判据号与观察值\n${out}`);
	assert.doesNotMatch(out, /（）|\(\s*\)/, `缺 automation 时不得渲染空括号\n${out}`);
	assert.match(out, /① TC-FEAT-77-1 → 未声明 automation/, `① 应显式说出「未声明 automation」\n${out}`);
	console.log('✓ 10 通过明细可见；缺 automation 时 ①/⑪ 不渲染空括号');
}

await Promise.all(temps.map((d) => rm(d, { recursive: true, force: true })));
console.log('\nscripts.test.mjs 全部通过');
