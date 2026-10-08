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
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
function runGate(cwd, script, args = []) {
	try {
		const out = execFileSync(process.execPath, [join(cwd, 'scripts/process', script), ...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
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

await Promise.all(temps.map((d) => rm(d, { recursive: true, force: true })));
console.log('\nscripts.test.mjs 全部通过');
