/**
 * Host 半冒烟测试：frontmatter 解析、状态机扫描、journal 安全追加、工具执行。
 * 不需要 dsh 运行：用临时目录造一个最小 docs/process。
 *
 * 用法：node test/host.test.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
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
assert.deepEqual(inject.sort(), ['systemPrompt', 'tools']);

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

// 回归夹具：**同 ID 的从件不得遮蔽主件**。真实仓库踩过：`<ID>-design.md`（confirmed / gate2 pending）
// 顶掉了 `<ID>.md`（done / gate2 approved）。夹具里从件在字典序上排在主件之前，且不依赖 readdir 顺序。
await writeFile(
	join(dir, 'prd', 'FEAT-301.md'),
	`---\nid: FEAT-301\nstatus: done\ngate1: approved\ngate2: approved\ngate4: approved\nprdVersion: 3\n---\n\n# PRD\n`,
	'utf8',
);
await writeFile(
	join(dir, 'prd', 'FEAT-301-design.md'),
	`---\nid: FEAT-301\nkind: design\nprd: docs/process/prd/FEAT-301.md\nstatus: confirmed\ngate1: pending\ngate2: pending\ngate4: pending\n---\n\n# 设计与说明（从件）\n`,
	'utf8',
);
// 主件缺失：只有从件可用 ⇒ 退回从件**并如实告警**（不静默顶替）
await writeFile(
	join(dir, 'prd', 'FEAT-302-ui-spec.md'),
	`---\nid: FEAT-302\nkind: ui-spec\nstatus: draft\ngate1: pending\ngate2: pending\ngate4: pending\n---\n\n# UI 规格（无主件）\n`,
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

// uiDesign: required ⇒ 派单必须显式带上 ui-designer（人在 Gate0 做的选择，不靠主控推断）
await writeFile(
	join(dir, 'input', 'FEAT-203-需求核对件.md'),
	`---\nid: FEAT-203\nkind: requirement-check\nstatus: confirmed\ngate0: approved\nflow: full\nuiDesign: required\n---\n\n# 要 UI 设计\n`,
	'utf8',
);

// 冲突夹具：快速路径不建 PRD、不过 Gate1，承载不了 UI 规格 ⇒ 必须出状态位冲突警告
await writeFile(
	join(dir, 'input', 'FEAT-204-需求核对件.md'),
	`---\nid: FEAT-204\nkind: requirement-check\nstatus: confirmed\ngate0: approved\nflow: fast\nuiDesign: required\n---\n\n# 冲突\n`,
	'utf8',
);

// ---- 捕获注册，直接驱动工具 ----------------------------------------

const registered = { tools: [], sections: [], providers: [] };
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
assert.equal(snapshot.packages.length, 9);

const pkg101 = snapshot.packages.find((p) => p.id === 'FEAT-101');
assert.equal(pkg101.status, 'red');
assert.equal(pkg101.gates.gate0, 'approved');
assert.equal(pkg101.gates.gate2, 'approved');
assert.equal(pkg101.prdVersion, '2');
assert.deepEqual(pkg101.openBugs, ['FEAT-101-01']);
assert.equal(pkg101.next.short, '调 dev 实现');

// 同 ID 从件不得遮蔽主件：主件 done / gate2+gate4 approved 必须胜出
const pkg301 = snapshot.packages.find((p) => p.id === 'FEAT-301');
assert.equal(pkg301.status, 'done', 'design 件不得顶替主件的 status');
assert.equal(pkg301.gates.gate2, 'approved', 'design 件的 gate2=pending 不得顶替主件');
assert.equal(pkg301.gates.gate4, 'approved');
assert.equal(pkg301.prdVersion, '3');
assert.match(pkg301.prd.file, /FEAT-301\.md$/, '应读主件 prd/FEAT-301.md');

// 主件缺失时才退回从件，且必须告警（不静默）
const pkg302 = snapshot.packages.find((p) => p.id === 'FEAT-302');
assert.match(pkg302.prd.file, /FEAT-302-ui-spec\.md$/);
assert.ok(snapshot.warnings.some((w) => w.includes('FEAT-302') && w.includes('找不到主件')), '主件缺失必须告警');

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

// uiDesign 默认 not-needed：不得凭空建议派 ui-designer
assert.equal(full.uiDesign, 'not-needed', '未声明 uiDesign 应默认 not-needed');
assert.doesNotMatch(full.next.action, /ui-designer/, 'uiDesign 未声明时不得建议派 ui-designer');

// uiDesign: required ⇒ 派单显式带上 ui-designer 与产物落点
const uiPkg = snapshot.packages.find((p) => p.id === 'FEAT-203');
assert.equal(uiPkg.uiDesign, 'required');
assert.equal(uiPkg.next.gate, 'Gate1');
assert.equal(uiPkg.next.short, '调 pm');
assert.match(uiPkg.next.action, /ui-designer/, 'uiDesign: required 必须派 ui-designer');
assert.match(uiPkg.next.action, /ui-spec\.md/, '必须写明 UI 规格落点');

// 冲突：快速路径 + 要 UI 规格 ⇒ 报状态位冲突，不替人修
const uiConflict = snapshot.packages.find((p) => p.id === 'FEAT-204');
assert.equal(uiConflict.flow, 'fast');
assert.equal(uiConflict.uiDesign, 'required');
assert.ok(
	snapshot.warnings.some((w) => w.includes('FEAT-204') && w.includes('uiDesign=required')),
	'flow=fast 与 uiDesign=required 必须报警',
);

assert.equal(snapshot.openBugCount, 2);
assert.equal(snapshot.orphanBugs.length, 1);
assert.equal(snapshot.orphanBugs[0].id, 'BUG-9-01');

const text = byName.process_status.output.render({}, snapshot)[0].text;
assert.match(text, /FEAT-101/);
assert.match(text, /调 dev 实现/);
assert.match(text, /FEAT-102/);
assert.match(text, /未挂包的 open bugs/);
assert.match(text, /🎨UI 设计/, 'uiDesign: required 应在快照里可见');

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
	{ id: 'FEAT-101', actor: 'subagent:Test-Agent', step: 'test', action: 'run', gate: 'gate2', command: 'npm test', exitCode: 0, note: '复跑全绿' },
	journalExec,
);
assert.equal(appended.linesAfter, 1);
const line = JSON.parse(await readFile(join(dir, 'prd', 'FEAT-101.journal.jsonl'), 'utf8'));
assert.equal(line.actor, 'subagent:Test-Agent');
assert.equal(line.id, 'FEAT-101');
assert.equal(line.step, 'test');
assert.equal(line.gate, 'gate2', '门禁执行记录要标 Gate');
assert.equal(line.exitCode, 0, 'run 记录必须带真实退出码');
assert.ok(!Number.isNaN(Date.parse(line.at)), 'at 是机器时间');

// 门禁执行记录必须自带命令与退出码：没有退出码的「跑过了」正是总纲禁止的掩盖
await assert.rejects(
	() => byName.process_journal.execute({ id: 'FEAT-101', actor: 'x', action: 'run', command: 'npm test' }, journalExec),
	/必须带 exitCode/,
);
await assert.rejects(
	() => byName.process_journal.execute({ id: 'FEAT-101', actor: 'x', action: 'run', exitCode: 0 }, journalExec),
	/必须带 command/,
);
// via 只在 approve 时有意义
await assert.rejects(
	() => byName.process_journal.execute({ id: 'FEAT-101', actor: 'x', action: 'write', via: 'human' }, journalExec),
	/只在 action=approve/,
);

// meta 指纹与仓库脚本同格式
const meta = JSON.parse(await readFile(join(dir, 'prd', 'FEAT-101.journal.jsonl.meta.json'), 'utf8'));
assert.equal(meta.lines, 1);
assert.match(meta.lastHash, /^[0-9a-f]{16}$/);
assert.match(meta.chainHash, /^[0-9a-f]{16}$/, 'meta 应带链式指纹（能盖住中间行被改）');

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

// ---- ② journal 完整性：读取侧必须把「篡改 / 截断 / 无从校验」与正常区分开 ----

const jpath = join(dir, 'prd', 'FEAT-101.journal.jsonl');
const metaPath = `${jpath}.meta.json`;
const clean = await readFile(jpath, 'utf8');
const cleanMeta = await readFile(metaPath, 'utf8');
const hash16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const chainOf = (arr) => arr.reduce((acc, l) => hash16(`${acc}${l}`), '');

// 正常：链式指纹一致
let snap = await byName.process_status.execute({}, journalExec);
assert.equal(snap.packages.find((p) => p.id === 'FEAT-101').journal.integrity.state, 'verified');
assert.match(byName.process_status.output.render({}, snap)[0].text, /✓ journal 完整性：链式指纹一致（2 行）/);

// 改中间行（末行不动）：只存末行哈希是查不出来的，链式指纹必须报红
const rows = clean.trim().split('\n');
const forged = JSON.parse(rows[0]);
forged.actor = 'subagent:Forged-Agent';
rows[0] = JSON.stringify(forged);
await writeFile(jpath, `${rows.join('\n')}\n`, 'utf8');
snap = await byName.process_status.execute({}, journalExec);
assert.equal(snap.packages.find((p) => p.id === 'FEAT-101').journal.integrity.state, 'tampered');
assert.match(byName.process_status.output.render({}, snap)[0].text, /🚨 journal 完整性：\*\*篡改嫌疑\*\*/);
assert.match(byName.process_status.output.render({}, snap)[0].text, /链式指纹不符/);

// 截断（删掉末条）：行数不符
await writeFile(jpath, `${rows[0]}\n`, 'utf8');
snap = await byName.process_status.execute({}, journalExec);
const truncated = snap.packages.find((p) => p.id === 'FEAT-101').journal;
assert.equal(truncated.integrity.state, 'tampered');
assert.match(truncated.integrity.reason, /行数不符/);

// 无 meta ⇒ 「未校验」，不得当绿
await rm(metaPath);
snap = await byName.process_status.execute({}, journalExec);
assert.equal(snap.packages.find((p) => p.id === 'FEAT-101').journal.integrity.state, 'unverified');
assert.match(byName.process_status.output.render({}, snap)[0].text, /journal 完整性：\*\*未校验\*\*/);

// 旧格式 meta（只有行数 + 末行）⇒ legacy：如实说「中间行不可验」，也不当绿
await writeFile(jpath, clean, 'utf8');
const cleanRows = clean.trim().split('\n');
await writeFile(
	metaPath,
	`${JSON.stringify({ lines: cleanRows.length, lastHash: hash16(cleanRows[cleanRows.length - 1]) }, null, 2)}\n`,
	'utf8',
);
snap = await byName.process_status.execute({}, journalExec);
assert.equal(snap.packages.find((p) => p.id === 'FEAT-101').journal.integrity.state, 'legacy');

// 测试自带的链式算法必须与 lib 一致（否则上面的断言会假绿）
assert.equal(chainOf(cleanRows), JSON.parse(cleanMeta).chainHash, '测试侧链式算法应与 lib 一致');
// 还原干净状态（后面的用例依赖它）
await writeFile(metaPath, cleanMeta, 'utf8');
assert.equal(
	(await byName.process_status.execute({}, journalExec)).packages.find((p) => p.id === 'FEAT-101').journal.integrity.state,
	'verified',
);

// ---- ① 本轮门禁证据：Gate 摘要里必须能看出「跑没跑、退出码多少」 ---------------

const s101 = await byName.gate_summary.execute({ id: 'FEAT-101' }, journalExec);
assert.match(s101.skeleton, /🔒 本轮门禁证据/);
assert.match(s101.skeleton, /npm test｜exit 0 ✓/, '门禁证据要带命令与真实退出码');

// 有 journal 但没有任何门禁执行记录 ⇒ 明说未记录（没记录 ≠ 已覆盖）
await byName.process_journal.execute({ id: 'FEAT-102', actor: 'orchestrator', step: 'dispatch', note: '本轮没跑门禁' }, journalExec);
const s102 = await byName.gate_summary.execute({ id: 'FEAT-102' }, journalExec);
assert.match(s102.skeleton, /未记录：.*找不到任何门禁执行记录/);

// AI 托管的批准必须留痕：状态里不得看起来像人签
await byName.process_journal.execute(
	{ id: 'FEAT-101', actor: 'subagent:uat-agent', action: 'approve', gate: 'gate2', via: 'ai-hosted' },
	journalExec,
);
const aiText = byName.process_status.output.render({}, await byName.process_status.execute({}, journalExec))[0].text;
assert.match(aiText, /gate2:approved🤖AI托管/, 'AI 托管的批准必须显式标记，不得伪装成人签');
assert.match((await byName.gate_summary.execute({ id: 'FEAT-101' }, journalExec)).skeleton, /AI 托管.*不是人签/);

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

// ---- process_init upgrade（框架自有覆盖 + 备份；项目文件永不覆盖）------

const upTarget = await mkdtemp(join(tmpdir(), 'process-kit-upgrade-'));
const upExec = { ...exec, agent: { session: { header: { cwd: upTarget } } } };
await byName.process_init.execute({ agents: false }, upExec);

// 制造偏差：框架自有文件被改、项目可定制文件被改、数据文件已存在
await writeFile(join(upTarget, 'docs/process/README.md'), '# 旧总纲\n', 'utf8');
await writeFile(join(upTarget, 'docs/process/PROJECT.md'), '---\nprocessVersion: 1\n---\n\n# 我填的 PROJECT\n', 'utf8');
await writeFile(join(upTarget, 'docs/process/ui/tokens.md'), '# 我的令牌\n', 'utf8');
await writeFile(join(upTarget, 'docs/process/prd/FEAT-900.md'), '# 我的包\n', 'utf8');
await writeFile(join(upTarget, 'scripts/process/journal-append.mjs'), '// 本地改过\n', 'utf8');

// dry-run：只报告、不写盘
const upDry = await byName.process_init.execute({ upgrade: true, agents: false, dryRun: true }, upExec);
assert.ok(upDry.updated.includes('docs/process/README.md'), 'dry-run 应报告将更新的框架文件');
assert.ok(upDry.manual.includes('docs/process/PROJECT.md'), 'dry-run 应报告需人工比对的文件');
assert.equal(await readFile(join(upTarget, 'docs/process/README.md'), 'utf8'), '# 旧总纲\n', 'dry-run 不得写盘');

const up = await byName.process_init.execute({ upgrade: true, agents: false }, upExec);
assert.ok(up.updated.includes('docs/process/README.md'), '框架自有文件应被更新');
assert.ok(up.updated.includes('scripts/process/journal-append.mjs'), '门禁脚本应被更新');
assert.ok(up.report.includes('旧版备份'), '更新必须留下备份说明');
assert.ok((await readFile(join(upTarget, 'docs/process/README.md'), 'utf8')).length > 500, '应恢复为包内总纲');
const backups = (await readdir(join(upTarget, 'docs/process'))).filter((f) => f.startsWith('README.md.bak-'));
assert.equal(backups.length, 1, '框架文件更新前必须备份旧版');
assert.equal(await readFile(join(upTarget, 'docs/process', backups[0]), 'utf8'), '# 旧总纲\n', '备份 = 覆盖前版本');
assert.equal(await readFile(join(upTarget, 'docs/process/PROJECT.md'), 'utf8'), '---\nprocessVersion: 1\n---\n\n# 我填的 PROJECT\n', 'PROJECT.md 永不覆盖');
assert.equal(await readFile(join(upTarget, 'docs/process/ui/tokens.md'), 'utf8'), '# 我的令牌\n', '令牌永不覆盖');
assert.equal(await readFile(join(upTarget, 'docs/process/prd/FEAT-900.md'), 'utf8'), '# 我的包\n', '数据文件永不触碰');
assert.ok(up.manual.includes('docs/process/PROJECT.md') && up.manual.includes('docs/process/ui/tokens.md'), '项目可定制文件应进人工比对清单');
assert.ok(up.report.includes('processVersion'), '版本差异应提示手工合并');

// 幂等：内容一致时不再更新、不再备份
const upAgain = await byName.process_init.execute({ upgrade: true, agents: false }, upExec);
assert.equal(upAgain.updated.length, 0, '内容一致时不应重复更新');
assert.equal((await readdir(join(upTarget, 'docs/process'))).filter((f) => f.startsWith('README.md.bak-')).length, 1, '不应产生多余备份');
await rm(upTarget, { recursive: true, force: true });

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

// ---- 发布回归可见性：评审三件套「跑没跑」不得靠猜 --------------------
// 三个评审角色只在发布回归跑（触发权在人手上）⇒ 有包 done 时必须如实报
// 「reports/release/** 有没有报告」；否则「未跑」会被读成「已覆盖」。

const relRoot = await mkdtemp(join(tmpdir(), 'process-kit-release-'));
const relDir = join(relRoot, 'docs/process');
for (const sub of ['input', 'prd', 'bugs', 'reports/release']) await mkdir(join(relDir, sub), { recursive: true });
await writeFile(
	join(relDir, 'prd', 'FEAT-301.md'),
	`---\nid: FEAT-301\nstatus: done\ngate1: approved\ngate2: approved\ngate4: approved\nprdVersion: 1\n---\n\n# PRD\n`,
	'utf8',
);
const relExec = { ...exec, agent: { session: { header: { cwd: relRoot } } } };

const noReport = await byName.process_status.execute({}, relExec);
assert.equal(noReport.releasePending, true);
assert.deepEqual(noReport.releaseReports, [], '无报告时必须报空，不得省略这一项');
const renderedNoReport = byName.process_status.output.render({}, noReport)[0].text;
assert.match(renderedNoReport, /尚未执行/, '无发布回归报告时必须点名评审三件套未执行');

// 反向对照：放一份发布回归报告 ⇒ 同一判据必须翻面
await writeFile(join(relDir, 'reports/release/2026-10-15.md'), '# 发布回归\n', 'utf8');
const withReport = await byName.process_status.execute({}, relExec);
assert.deepEqual(withReport.releaseReports, ['2026-10-15.md']);
const renderedWithReport = byName.process_status.output.render({}, withReport)[0].text;
assert.match(renderedWithReport, /已有 1 份发布回归报告/);
assert.doesNotMatch(renderedWithReport, /尚未执行/, '有报告时不得再报「尚未执行」');
await rm(relRoot, { recursive: true, force: true });

// ---- 清理 ------------------------------------------------------------

await rm(root, { recursive: true, force: true });
await rm(empty, { recursive: true, force: true });
await rm(notARepo, { recursive: true, force: true });
await rm(target, { recursive: true, force: true });

console.log('host.test.mjs: all assertions passed');
