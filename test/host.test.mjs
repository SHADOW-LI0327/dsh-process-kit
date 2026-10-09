/**
 * Host 半冒烟测试：frontmatter 解析、状态机扫描、journal 安全追加、工具执行。
 * 不需要 dsh 运行：用临时目录造一个最小 docs/process。
 *
 * 用法：node test/host.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本地 exists：测试里用得很少，不值得引别的东西。 */
async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

const { apply, inject, name } = await import('../lib/index.js');

assert.equal(name, 'process-kit');
assert.deepEqual(inject.sort(), ['connection', 'sessionQuery', 'sessions', 'systemPrompt', 'tools', 'webServer']);

// ---- 造最小流程仓 --------------------------------------------------

const root = await mkdtemp(join(tmpdir(), 'process-kit-test-'));
const dir = join(root, 'docs/process');
for (const sub of ['input', 'prd', 'bugs', 'contracts', 'rules']) await mkdir(join(dir, sub), { recursive: true });
await writeFile(join(dir, 'README.md'), '# 单人开发流程\n', 'utf8');

await writeFile(
	join(dir, 'input', 'FEAT-101-需求核对件.md'),
	`<!-- 注释在前 -->\n\n---\nid: FEAT-101\nkind: requirement-check\nstatus: confirmed\ngate0: approved # 人签\n---\n\n# 内容\n`,
	'utf8',
);
await writeFile(
	join(dir, 'input', '原料-新需求.md'),
	`---\nid: raw-1\n---\n随便什么原料\n`,
	'utf8',
);
await writeFile(
	join(dir, 'input', '_CHECK_TEMPLATE.md'),
	`---\nid: <ID>\nkind: requirement-check\n---\n模板必须被跳过\n`,
	'utf8',
);
await writeFile(
	join(dir, 'prd', 'FEAT-101.md'),
	`---\nid: FEAT-101\nstatus: red\ngate1: approved\ngate2: approved\ngate4: pending\nprdVersion: 2\n---\n\n# PRD\n`,
	'utf8',
);
await writeFile(
	join(dir, 'prd', 'FEAT-102.md'),
	`---\nid: FEAT-102\nstatus: frozen\ngate1: pending\ngate2: pending\ngate4: pending\nprdVersion: 1\n---\n\n# PRD\n`,
	'utf8',
);
await writeFile(join(dir, 'prd', '_TEMPLATE.md'), `---\nid: <模块前缀>-NNN\n---\n模板\n`, 'utf8');
await writeFile(
	join(dir, 'bugs', 'FEAT-101-01.md'),
	`---\nid: FEAT-101-01\nprd: FEAT-101\nstatus: open\nrelatedCase: TC-1\n---\n\n# bug\n`,
	'utf8',
);
await writeFile(
	join(dir, 'bugs', 'BUG-9-01.md'),
	`---\nid: BUG-9-01\nprd: null\nstatus: open\nrelatedCase: null\nkind: bugfix\npath: 快速路径\n---\n\n# 快速路径 bug\n`,
	'utf8',
);

// 快速路径核对件：gate0 已签 + flow: fast ⇒ 不建 PRD 也直派 dev（跳过 Gate1/Gate2）
await writeFile(
	join(dir, 'input', 'FEAT-201-需求核对件.md'),
	`---\nid: FEAT-201\nkind: requirement-check\nstatus: confirmed\ngate0: approved\nflow: fast\n---\n\n# 快速路径\n`,
	'utf8',
);

// 对照组：全流程核对件（flow: full）+ gate0 已签 + 无 PRD ⇒ 必须建议调 pm 停等 Gate1
await writeFile(
	join(dir, 'input', 'FEAT-202-需求核对件.md'),
	`---\nid: FEAT-202\nkind: requirement-check\nstatus: confirmed\ngate0: approved\nflow: full\n---\n\n# 全流程\n`,
	'utf8',
);

// ---- 捕获注册，直接驱动工具 ----------------------------------------

const registered = { tools: [], sections: [], routes: [], providers: [] };
const ctx = {
	logger: { warn: () => {}, info: () => {} },
	effect: (factory) => {
		factory();
		return () => {};
	},
	// apply 用 ctx.inject(['skills'], cb) 做可选注入：桩里直接放行。
	inject: (_deps, callback) => {
		callback(ctx);
	},
	tools: { register: (definition) => { registered.tools.push(definition); return () => {}; } },
	systemPrompt: { section: (section) => { registered.sections.push(section); return () => {}; } },
	webServer: { register: (route) => { registered.routes.push(route); return () => {}; } },
	connection: { requestRejection: () => undefined },
	sessions: { list: () => [{ seq: 7, header: { cwd: root, origin: undefined } }] },
	sessionQuery: { listSessions: async () => [] },
	skills: {
		registerProvider: (create) => {
			registered.providers.push(create({ signal: new AbortController().signal, invalidate: () => {} }));
			return () => {};
		},
	},
};
apply(ctx);

assert.deepEqual(registered.tools.map((t) => t.name).sort(), ['gate_summary', 'process_init', 'process_journal', 'process_status']);
assert.equal(registered.sections.length, 1);
assert.equal(registered.sections[0].name, 'process-kit-wake');
assert.equal(registered.routes.length, 1);
assert.equal(registered.routes[0].path, '/process-kit');
assert.equal(registered.providers.length, 1);
assert.equal(registered.providers[0].name, 'process-kit-skills');

const byName = Object.fromEntries(registered.tools.map((t) => [t.name, t]));
const exec = { agent: undefined, signal: undefined };

// ---- 无流程目录的工作区 ---------------------------------------------

const empty = await mkdtemp(join(tmpdir(), 'process-kit-empty-'));
const notFound = await byName.process_status.execute({}, { ...exec, agent: { session: { header: { cwd: empty } } } });
assert.equal(notFound.found, false);
const renderedNotFound = await new Promise((resolve) => {
	// render 是纯函数，直接调
	resolve(byName.process_status.output.render({}, notFound)[0].text);
});
assert.match(renderedNotFound, /未找到流程目录/);

// ---- 状态机快照 ------------------------------------------------------

const snapshot = await byName.process_status.execute({}, { ...exec, agent: { session: { header: { cwd: root } } } });
assert.equal(snapshot.found, true);
assert.equal(snapshot.packages.length, 5);

const pkg101 = snapshot.packages.find((p) => p.id === 'FEAT-101');
assert.equal(pkg101.status, 'red');
assert.equal(pkg101.gates.gate0, 'approved');
assert.equal(pkg101.gates.gate2, 'approved');
assert.equal(pkg101.prdVersion, '2');
assert.deepEqual(pkg101.openBugs, ['FEAT-101-01']);
assert.equal(pkg101.next.short, '调 dev 实现');

const pkg102 = snapshot.packages.find((p) => p.id === 'FEAT-102');
assert.equal(pkg102.next.gate, 'Gate1');
assert.equal(pkg102.next.short, '等 Gate1');
assert.ok(snapshot.warnings.some((w) => w.includes('FEAT-102') && w.includes('frozen')), 'frozen/gate1 耦合警告');

const intake = snapshot.packages.find((p) => p.status === 'intake');
assert.ok(intake, 'input 原料行');
assert.equal(intake.next.gate, 'Gate0');

// 快速路径：无 PRD、gate0 已签 ⇒ 不得建议「调 pm 停等 Gate1」
const fast = snapshot.packages.find((p) => p.id === 'FEAT-201');
assert.equal(fast.flow, 'fast');
assert.equal(fast.next.gate, null, '快速路径不得有 Gate1/Gate2 停点');
assert.equal(fast.next.short, '快速路径：直派 dev');
assert.match(fast.next.action, /退回全流程/, '必须写明越级退回条件');

// 对照组：全流程核对件仍应走 pm 出 PRD，不被快速路径分支误伤
const full = snapshot.packages.find((p) => p.id === 'FEAT-202');
assert.equal(full.flow, 'full');
assert.equal(full.next.gate, 'Gate1', '全流程核对件必须停等 Gate1');
assert.equal(full.next.short, '调 pm');

assert.equal(snapshot.openBugCount, 2);
assert.equal(snapshot.orphanBugs.length, 1);
assert.equal(snapshot.orphanBugs[0].id, 'BUG-9-01');

const text = byName.process_status.output.render({}, snapshot)[0].text;
assert.match(text, /FEAT-101/);
assert.match(text, /调 dev 实现/);
assert.match(text, /FEAT-102/);
assert.match(text, /未挂包的 open bugs/);

// ---- gate_summary ----------------------------------------------------

const summary = await byName.gate_summary.execute({ id: 'FEAT-101' }, { ...exec, agent: { session: { header: { cwd: root } } } });
assert.match(summary.skeleton, /【FEAT-101】FEAT-101　red → 调 dev 实现/);
assert.match(summary.skeleton, /✅ 完成了什么/);
assert.match(summary.skeleton, /❓ 还需要裁定什么/);
assert.match(summary.skeleton, /📎 依据/);
assert.match(summary.skeleton, /gate0=approved gate1=approved gate2=approved gate4=pending/);
assert.match(summary.skeleton, /open bugs 1：FEAT-101-01/);
assert.match(summary.skeleton, /prdVersion 2/);

await assert.rejects(
	() => byName.gate_summary.execute({ id: 'NOPE' }, { ...exec, agent: { session: { header: { cwd: root } } } }),
	/not in the current snapshot|不在当前快照/,
);

// ---- journal 安全追加 --------------------------------------------------

const journalExec = { ...exec, agent: { session: { header: { cwd: root } } } };
const appended = await byName.process_journal.execute(
	{ id: 'FEAT-101', actor: 'subagent:Test-Agent', step: 'test', action: 'run', note: '复跑全绿' },
	journalExec,
);
assert.equal(appended.linesAfter, 1);
const line = JSON.parse(await readFile(join(dir, 'prd', 'FEAT-101.journal.jsonl'), 'utf8'));
assert.equal(line.actor, 'subagent:Test-Agent');
assert.equal(line.id, 'FEAT-101');
assert.equal(line.step, 'test');
assert.ok(!Number.isNaN(Date.parse(line.at)), 'at 是机器时间');

// meta 指纹与仓库脚本同格式
const meta = JSON.parse(await readFile(join(dir, 'prd', 'FEAT-101.journal.jsonl.meta.json'), 'utf8'));
assert.equal(meta.lines, 1);
assert.match(meta.lastHash, /^[0-9a-f]{16}$/);

// 追加第二条 → 指纹链衔接
const second = await byName.process_journal.execute({ id: 'FEAT-101', actor: 'orchestrator', step: 'dispatch' }, journalExec);
assert.equal(second.linesBefore, 1);
assert.equal(second.linesAfter, 2);

// actor 缺失必须拒绝（journal 每行必须自带 actor）
await assert.rejects(() => byName.process_journal.execute({ id: 'FEAT-101' }, journalExec), /actor 必填/);
// id 带路径分隔必须拒绝
await assert.rejects(() => byName.process_journal.execute({ id: '../evil', actor: 'x' }, journalExec), /id 必填/);

// 快照里 journal 尾部可见
const snapshot2 = await byName.process_status.execute({}, journalExec);
assert.equal(snapshot2.packages.find((p) => p.id === 'FEAT-101').journal.lines, 2);

// ---- 路由（直接调 handler，绕过 HTTP）--------------------------------

const res = { headers: {}, ended: '', statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.ended = body; }, writableEnded: false };
await registered.routes[0].handler({ headers: {} }, res);
const routePayload = JSON.parse(res.ended);
assert.equal(routePayload.found, true);
assert.equal(routePayload.packages.length, 5);
assert.equal(res.headers['cache-control'], 'no-store');

// ---- 角色技能 provider（安装即得基础 subagent）------------------------

const provider = registered.providers[0];
// 默认**无条件**广播：与本工作区是否已有 docs/process 无关。
// （按目录门禁会产生「清空目录 → 角色消失 → 初始化也回不来」的缓存陷阱，实测确认。）
const notARepo = await mkdtemp(join(tmpdir(), 'process-kit-norepo-'));
assert.equal((await provider.list({ cwd: notARepo })).length, 8, '默认应在任何工作区广播 8 个角色');

// 需要安静时用环境变量关掉
process.env.PROCESS_KIT_SKILLS = 'off';
try {
	assert.deepEqual(await provider.list({ cwd: notARepo }), [], 'PROCESS_KIT_SKILLS=off 应静默');
} finally {
	delete process.env.PROCESS_KIT_SKILLS;
}

// cwd 是流程仓 ⇒ 同样广播 8 个打包角色
const candidates = await provider.list({ cwd: root });
assert.deepEqual(
	candidates.map((c) => c.name).sort(),
	['code-review-agent', 'dev-agent', 'logic-review-agent', 'product-manager', 'security-review-agent', 'test-agent', 'uat-agent', 'ui-designer'],
);
for (const candidate of candidates) {
	assert.equal(candidate.rank, 600, '打包技能必须是 bundled 档（低于项目 .dsh/skills）');
	assert.equal(candidate.source, 'bundled');
	assert.equal(candidate.provider, 'process-kit-skills');
	assert.equal(candidate.invocation.modelInvocable, true);
	assert.ok(candidate.description.length > 10, '描述用于路由，不能为空');
}

const loadedSkill = await provider.get(candidates[0]);
assert.ok(loadedSkill.content.length > 200, 'get 必须返回完整正文');
assert.ok(!loadedSkill.content.startsWith('---'), '正文必须已剥掉 frontmatter');
assert.ok(!loadedSkill.content.includes('\nname: '), '正文里不应残留 frontmatter 字段');

// ---- process_init（只增不改）------------------------------------------

const target = await mkdtemp(join(tmpdir(), 'process-kit-init-'));
const initExec = { ...exec, agent: { session: { header: { cwd: target } } } };

// dry-run：只报告、不写盘
const dry = await byName.process_init.execute({ dryRun: true }, initExec);
assert.ok(dry.created.includes('docs/process/README.md'), 'dry-run 应报告 README');
assert.ok(dry.created.includes('docs/process/PROJECT.md'), 'dry-run 应报告 PROJECT');
assert.ok(dry.created.includes('docs/process/input/_CHECK_TEMPLATE.md'), 'dry-run 应报告核对件模板');
assert.ok(dry.created.includes('AGENTS.md'), 'dry-run 应报告项目级常驻指针');
assert.equal(await exists(join(target, 'docs/process/README.md')), false, 'dry-run 不得写盘');
assert.equal(await exists(join(target, 'AGENTS.md')), false, 'dry-run 不得写 AGENTS.md');

// 真跑：骨架 + 脚本落地
const real = await byName.process_init.execute({}, initExec);
assert.ok(real.created.includes('docs/process/README.md'));
assert.ok(real.created.includes('scripts/process/journal-append.mjs'));
assert.ok(real.created.includes(`docs/process/PROJECT.md`));
const scaffoldReadme = await readFile(join(target, 'docs/process/README.md'), 'utf8');
assert.ok(scaffoldReadme.length > 500, '总纲应有实体内容');

// 幂等且不覆盖：改过的文件再跑一次必须原样保留
await writeFile(join(target, 'docs/process/README.md'), '# 我改过的\n', 'utf8');
const again = await byName.process_init.execute({}, initExec);
assert.equal(again.created.length, 0, '第二次应全部跳过');
assert.ok(again.skipped.includes('docs/process/README.md'));
assert.equal(await readFile(join(target, 'docs/process/README.md'), 'utf8'), '# 我改过的\n', '绝不覆盖用户文件');

// skills=true：可把角色技能就地落地以便定制
const withSkills = await byName.process_init.execute({ skills: true, dryRun: true }, initExec);
assert.ok(withSkills.created.some((f) => f.startsWith('.dsh/skills/')), 'skills=true 应报告角色技能落点');

// ---- AGENTS.md：项目级常驻指针（缺失则建，存在绝不改）------------------

assert.ok(real.created.includes('AGENTS.md'), '缺失时应创建 AGENTS.md');
const agentsText = await readFile(join(target, 'AGENTS.md'), 'utf8');
assert.ok(agentsText.includes('docs/process/README.md'), 'AGENTS.md 必须指向流程真源');
assert.ok(agentsText.includes('dsh-process-kit'), 'AGENTS.md 应说明角色由插件技能提供');
assert.ok(agentsText.includes('process_status'), 'AGENTS.md 应写明每轮唤醒的常驻动作');
assert.ok(again.skipped.includes('AGENTS.md（已存在，未改动）'), '已存在的 AGENTS.md 应跳过');
assert.ok(again.report.includes('## 开发流程'), '已存在时应打印待人工并入的段落');
assert.equal(await readFile(join(target, 'AGENTS.md'), 'utf8'), agentsText, '绝不改写已有 AGENTS.md');

// agents=false 完全不碰 AGENTS.md
const noAgentsTarget = await mkdtemp(join(tmpdir(), 'process-kit-noagents-'));
const noAgentsRun = await byName.process_init.execute({ agents: false, dryRun: true }, {
	...exec,
	agent: { session: { header: { cwd: noAgentsTarget } } },
});
assert.ok(!noAgentsRun.created.includes('AGENTS.md'), 'agents=false 不应创建 AGENTS.md');
await rm(noAgentsTarget, { recursive: true, force: true });

// ---- 回归：编辑器原子写的临时产物不得被当作骨架落地 ----------------
// （真事故：并发写 scaffold/README.md 时留下的 .README.md.<pid>.<uuid>.tmpdir/
//   README.md.tmp 曾被 process_init 当作骨架复制进目标仓库。）

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const noiseDir = join(packageRoot, 'scaffold', '.README.md.99999.deadbeef.tmpdir');
await mkdir(noiseDir, { recursive: true });
await writeFile(join(noiseDir, 'README.md.tmp'), 'noise', 'utf8');
await writeFile(join(packageRoot, 'scaffold', '.hidden-noise'), 'noise', 'utf8');
const noiseTarget = await mkdtemp(join(tmpdir(), 'process-kit-noise-'));
try {
	const noiseRun = await byName.process_init.execute({ dryRun: true }, { ...exec, agent: { session: { header: { cwd: noiseTarget } } } });
	assert.ok(noiseRun.created.includes('docs/process/README.md'), '正常骨架仍应在清单里（证明不是清单为空）');
	assert.ok(
		!noiseRun.created.some((f) => f.includes('.tmpdir') || f.endsWith('.tmp') || f.includes('hidden-noise')),
		`临时产物/点文件不得进入落点清单：${noiseRun.created.join(', ')}`,
	);
} finally {
	await rm(noiseDir, { recursive: true, force: true });
	await rm(join(packageRoot, 'scaffold', '.hidden-noise'), { force: true });
	await rm(noiseTarget, { recursive: true, force: true });
}

// ---- 清理 ------------------------------------------------------------

await rm(root, { recursive: true, force: true });
await rm(empty, { recursive: true, force: true });
await rm(notARepo, { recursive: true, force: true });
await rm(target, { recursive: true, force: true });

console.log('host.test.mjs: all assertions passed');
