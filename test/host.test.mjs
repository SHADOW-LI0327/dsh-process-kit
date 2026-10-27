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
// 未建包的调研件：幽灵行应提示「先汇合」；已建包（FEAT-301）的研究件则不得重复刷幽灵行
await writeFile(
	join(dir, 'input', 'FEAT-401-research-brief.md'),
	`---\nid: FEAT-401\nkind: research-brief\nauthor: orchestrator\n---\n\n# 未建包的调研任务书\n`,
	'utf8',
);
await writeFile(
	join(dir, 'input', 'FEAT-401-prior-art.md'),
	`---\nid: FEAT-401\nkind: prior-art\nauthor: pm\n---\n\n# 未建包的产品调研\n`,
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
// 借鉴调研 + 架构设计与取舍：都必须以产物路径出现在状态快照里（Gate0/Gate1 要看得见）
await writeFile(
	join(dir, 'input', 'FEAT-301-research-brief.md'),
	`---\nid: FEAT-301\nkind: research-brief\nauthor: orchestrator\n---\n\n# 调研任务书\n`,
	'utf8',
);
await writeFile(
	join(dir, 'input', 'FEAT-301-prior-art.md'),
	`---\nid: FEAT-301\nkind: prior-art\nauthor: pm\n---\n\n# 产品借鉴调研\n`,
	'utf8',
);
await writeFile(
	join(dir, 'input', 'FEAT-301-tech-scan.md'),
	`---\nid: FEAT-301\nkind: tech-scan\nauthor: architect\n---\n\n# 技术约束扫描\n`,
	'utf8',
);
await writeFile(
	join(dir, 'prd', 'FEAT-301-arch.md'),
	`---\nid: FEAT-301\nkind: arch\nprd: docs/process/prd/FEAT-301.md\nstatus: draft\nprdVersion: 3\n---\n\n# 架构设计与取舍\n`,
	'utf8',
);
// 主件缺失：只有从件可用 ⇒ 退回从件**并如实告警**（不静默顶替）
await writeFile(
	join(dir, 'prd', 'FEAT-302-ui-spec.md'),
	`---\nid: FEAT-302\nkind: ui-spec\nstatus: draft\ngate1: pending\ngate2: pending\ngate4: pending\n---\n\n# UI 规格（无主件）\n`,
	'utf8',
);
// arch 件不是状态载体：无主件时不得单独成包（否则会造出「等 Gate1」的幽灵包）
await writeFile(
	join(dir, 'prd', 'FEAT-303-arch.md'),
	`---\nid: FEAT-303\nkind: arch\nstatus: draft\n---\n\n# 架构设计与取舍（无主件）\n`,
	'utf8',
);

// 快速路径核对件：gate0 已签 + flow: fast ⇒ 不建 PRD 也直派 dev（跳过 Gate1/Gate2）
await writeFile(
	join(dir, 'input', 'FEAT-201-需求核对件.md'),
	`---\nid: FEAT-201\nkind: requirement-check\nstatus: confirmed\ngate0: approved\nflow: fast\n---\n\n# 快速路径\n`,
	'utf8',
);
// 冲突夹具：fast 路径不做调研 ⇒ 存在调研件必须告警（不静默当没发生）
await writeFile(
	join(dir, 'input', 'FEAT-201-prior-art.md'),
	`---\nid: FEAT-201\nkind: prior-art\nauthor: pm\n---\n\n# 不该出现的调研件\n`,
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

// UI 还原核对：dev 已实现、L2 待跑时，下一步必须提示 ui-designer，而不是直接进 UAT
await writeFile(
	join(dir, 'input', 'FEAT-205-需求核对件.md'),
	`---\nid: FEAT-205\nkind: requirement-check\nstatus: confirmed\ngate0: approved\nflow: full\nuiDesign: required\n---\n\n# 要 UI 设计\n`,
	'utf8',
);
await writeFile(
	join(dir, 'prd', 'FEAT-205.md'),
	`---\nid: FEAT-205\nstatus: implementing\ngate1: approved\ngate2: approved\ngate4: pending\nprdVersion: 1\n---\n\n# PRD\n`,
	'utf8',
);

// 已进入 UAT 但缺 UI 还原核对报告 ⇒ 必须告警（有 UI 的包不能跳过这一步）
await writeFile(
	join(dir, 'input', 'FEAT-206-需求核对件.md'),
	`---\nid: FEAT-206\nkind: requirement-check\nstatus: confirmed\ngate0: approved\nflow: full\nuiDesign: required\n---\n\n# 要 UI 设计\n`,
	'utf8',
);
await writeFile(
	join(dir, 'prd', 'FEAT-206.md'),
	`---\nid: FEAT-206\nstatus: uat\ngate1: approved\ngate2: approved\ngate4: pending\nprdVersion: 1\n---\n\n# PRD\n`,
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

assert.deepEqual(registered.tools.map((t) => t.name).sort(), ['gate_summary', 'process_init', 'process_journal', 'process_status', 'process_uninstall']);
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
assert.equal(snapshot.packages.length, 11);

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
assert.match(pkg301.artifacts.researchBrief, /FEAT-301-research-brief\.md$/, '调研任务书应出现在产物清单');
assert.match(pkg301.artifacts.priorArt, /FEAT-301-prior-art\.md$/, 'pm 借鉴调研应出现在产物清单');
assert.match(pkg301.artifacts.techScan, /FEAT-301-tech-scan\.md$/, 'architect 技术扫描应出现在产物清单');
assert.match(pkg301.artifacts.arch, /FEAT-301-arch\.md$/, '架构设计与取舍应出现在产物清单');

// 主件缺失时才退回从件，且必须告警（不静默）
const pkg302 = snapshot.packages.find((p) => p.id === 'FEAT-302');
assert.match(pkg302.prd.file, /FEAT-302-ui-spec\.md$/);
assert.ok(snapshot.warnings.some((w) => w.includes('FEAT-302') && w.includes('找不到主件')), '主件缺失必须告警');
assert.equal(snapshot.packages.find((p) => p.id === 'FEAT-303'), undefined, 'arch 件不得单独成包');
assert.ok(
	snapshot.warnings.some((w) => w.includes('FEAT-303') && w.includes('架构设计与取舍')),
	'孤立的 arch 件必须告警，不得静默消失',
);

const pkg102 = snapshot.packages.find((p) => p.id === 'FEAT-102');
assert.equal(pkg102.next.gate, 'Gate1');
assert.equal(pkg102.next.short, '等 Gate1');
assert.ok(snapshot.warnings.some((w) => w.includes('FEAT-102') && w.includes('frozen')), 'frozen/gate1 耦合警告');

const intake = snapshot.packages.find((p) => p.status === 'intake');
assert.ok(intake, 'input 原料行');
assert.equal(intake.next.gate, 'Gate0');
assert.equal(intake.next.short, '继续/汇合调研', '存在未建包研究件时必须提示先汇合，而不是直接起草核对件');
assert.match(intake.next.action, /汇合/, '研究件存在时必须提示汇合');
assert.ok(intake.rawInputs.some((f) => f.includes('FEAT-401')), '未建包的研究件应出现在幽灵行');
assert.ok(!intake.rawInputs.some((f) => f.includes('FEAT-301')), '已建包的研究件不得重复刷幽灵行');

// 快速路径：无 PRD、gate0 已签 ⇒ 不得建议「调 pm 停等 Gate1」
const fast = snapshot.packages.find((p) => p.id === 'FEAT-201');
assert.equal(fast.flow, 'fast');
assert.equal(fast.next.gate, null, '快速路径不得有 Gate1/Gate2 停点');
assert.equal(fast.next.short, '快速路径：直派 dev');
assert.match(fast.next.action, /退回全流程/, '必须写明越级退回条件');
assert.match(fast.next.action, /不做调研/, '快速路径必须写明不做调研');
assert.ok(
	snapshot.warnings.some((w) => w.includes('FEAT-201') && w.includes('借鉴调研')),
	'fast 路径出现调研件必须告警（fast 不做调研）',
);

// 对照组：全流程核对件仍应走 pm 出 PRD，不被快速路径分支误伤
const full = snapshot.packages.find((p) => p.id === 'FEAT-202');
assert.equal(full.flow, 'full');
assert.equal(full.next.gate, 'Gate1', '全流程核对件必须停等 Gate1');
assert.equal(full.next.short, '调 pm');
assert.match(full.next.action, /architect/, 'Gate1 前必须提示有架构影响时派 architect');

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
assert.match(uiPkg.next.action, /index\.html/, '必须写明 HTML 原型入口');

// uiDesign required + implementing ⇒ 下一步是 UI 还原核对，不是直接 uat
const uiReviewPkg = snapshot.packages.find((p) => p.id === 'FEAT-205');
assert.equal(uiReviewPkg.next.short, 'test 复跑 + UI 核对');
assert.match(uiReviewPkg.next.action, /ui-review/, '必须有 UI 还原核对步骤');
assert.match(uiReviewPkg.next.action, /status → uat/, '核对通过后才进 UAT');
assert.ok(
	snapshot.warnings.some((w) => w.includes('FEAT-206') && w.includes('reports/ui-review/FEAT-206.md')),
	'有 UI 的包进 UAT 前缺 UI 还原核对报告必须告警',
);

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

// ---- 契约 2 的强制项：approve 必须能回答「哪个 Gate / 谁签的」 ------------------

const root2 = await mkdtemp(join(tmpdir(), 'process-kit-journal-'));
await mkdir(join(root2, 'docs/process/prd'), { recursive: true });
const exec2 = { ...exec, agent: { session: { header: { cwd: root2 } } } };

// 缺 gate / 缺 via / gate 取值越界：都必须在写入前拒绝
// （存量仓库实测：9 条批准记录里 0 条有 gate、0 条有 via ⇒ 「谁签的」只能靠读自然语言）
await assert.rejects(
	() => byName.process_journal.execute({ id: 'FEAT-101', actor: 'orchestrator', action: 'approve' }, exec2),
	/必须带 gate/,
	'approve 缺 gate：批准记录必须能回答「哪个 Gate」',
);
await assert.rejects(
	() => byName.process_journal.execute({ id: 'FEAT-101', actor: 'orchestrator', action: 'approve', gate: 'gate2' }, exec2),
	/必须带 via/,
	'approve 缺 via：批准记录必须能回答「谁签的」',
);
await assert.rejects(
	() => byName.process_journal.execute({ id: 'FEAT-101', actor: 'orchestrator', action: 'approve', gate: 'gate3', via: 'human' }, exec2),
	/gate0 \/ gate1 \/ gate2 \/ gate4/,
	'gate 取值越界必须拒绝',
);
await assert.rejects(
	() => byName.process_journal.execute({ id: 'FEAT-101', actor: 'orchestrator', action: 'note', gate: 'gate2' }, exec2),
	/只在 action=run/,
	'gate 只在 run / approve 时有意义',
);
const okApprove = await byName.process_journal.execute(
	{ id: 'FEAT-101', actor: 'orchestrator', action: 'approve', gate: 'gate2', via: 'ai-hosted' },
	exec2,
);
assert.equal(okApprove.linesAfter, 1, '齐备的 approve 必须写成功');
// 反向对照：**批准记录 + 当轮门禁证据**是合法且有价值的写法（实例验收的 journal 里真有一条
// approve 同时带 command + exitCode:0），不得判红 —— 收紧字段前先看真实数据里有没有人在用。
const approveWithEvidence = await byName.process_journal.execute(
	{ id: 'FEAT-101', actor: 'orchestrator', action: 'approve', gate: 'gate2', via: 'human', command: 'node scripts/process/check-rules.mjs', exitCode: 0 },
	exec2,
);
assert.equal(approveWithEvidence.linesAfter, 2, 'approve 可同时带当轮门禁证据（command + exitCode）');

// 未声明字段必须报错，不得静默丢弃（0.4.0 实测丢过 command / exitCode，留下残缺证据）
await assert.rejects(
	() => byName.process_journal.execute({ id: 'FEAT-101', actor: 'x', action: 'run', command: 'npm test', exitcode: 0 }, exec2),
	/exitcode.*exitCode/,
	'大小写拼错要指出正确字段名，而不是丢掉它',
);
await assert.rejects(
	() => byName.process_journal.execute({ id: 'FEAT-101', actor: 'x', step: 'test', action: 'run', cmd: 'npm test', result: 'red: 3' }, exec2),
	/result/,
	'旧文档里的 result 字段必须被拒绝（总纲 §7 早已改成 exitCode）',
);
await rm(root2, { recursive: true, force: true });

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
assert.equal((await provider.list({ cwd: notARepo })).length, 9, '默认应在任何工作区广播 9 个角色');

// 需要安静时用环境变量关掉
process.env.PROCESS_KIT_SKILLS = 'off';
try {
	assert.deepEqual(await provider.list({ cwd: notARepo }), [], 'PROCESS_KIT_SKILLS=off 应静默');
} finally {
	delete process.env.PROCESS_KIT_SKILLS;
}

// cwd 是流程仓 ⇒ 同样广播 9 个打包角色
const candidates = await provider.list({ cwd: root });
assert.deepEqual(
	candidates.map((c) => c.name).sort(),
	['architect', 'code-review-agent', 'dev-agent', 'logic-review-agent', 'product-manager', 'security-review-agent', 'test-agent', 'uat-agent', 'ui-designer'],
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
await assert.rejects(
	() => byName.process_init.execute({ scriptsDir: 'docs', dryRun: true }, initExec),
	/不能是 docs\/process 或其父目录/,
	'scriptsDir 不能指向 docs 这种宽目录（否则卸载可能误删别的文档）',
);
await assert.rejects(
	() => byName.process_init.execute({ scriptsDir: 'scripts', dryRun: true }, initExec),
	/顶层宽目录/,
	'scriptsDir 不能指向 scripts 根（否则卸载会整目录删掉项目脚本）',
);

// 真跑：骨架 + 脚本落地
const real = await byName.process_init.execute({}, initExec);
assert.ok(real.created.includes('docs/process/README.md'));
assert.ok(real.created.includes('scripts/process/journal-append.mjs'));
assert.ok(real.created.includes(`docs/process/PROJECT.md`));
const scaffoldReadme = await readFile(join(target, 'docs/process/README.md'), 'utf8');
assert.ok(scaffoldReadme.length > 500, '总纲应有实体内容');
assert.equal(await exists(join(target, 'docs/process/en')), false, '中文骨架初始化不得复制 scaffold/en 镜像进用户仓库');

// 卸载清单：必须证明「哪些是 init 落的」，否则卸载只能靠猜
const initManifest = JSON.parse(await readFile(join(target, 'docs/process/.process-kit.json'), 'utf8'));
assert.equal(initManifest.schema, 1);
assert.equal(initManifest.processDir, 'docs/process');
assert.equal(initManifest.scriptsDir, 'scripts/process');
assert.equal(initManifest.agents.created, true, 'AGENTS.md 是 init 创建时应记录');
assert.equal(initManifest.agents.sha256.length, 64, '应记录创建时哈希，供「是否被改过」判断');
assert.equal(typeof initManifest.version, 'string');

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

// ---- process_uninstall：确认后才清，且只清插件落的 --------------------

const unRoot = await mkdtemp(join(tmpdir(), 'process-kit-uninstall-'));
const unExec = { ...exec, agent: { session: { header: { cwd: unRoot } } } };
const unPackage = { name: 'fixture', scripts: { 'process:journal': 'node scripts/process/journal-append.mjs', keep: 'echo hi' } };
await writeFile(join(unRoot, 'package.json'), `${JSON.stringify(unPackage, null, 2)}\n`, 'utf8');
await byName.process_init.execute({ skills: true }, unExec);

const unManifest = JSON.parse(await readFile(join(unRoot, 'docs/process/.process-kit.json'), 'utf8'));
assert.ok(unManifest.skills.createdFiles['product-manager/SKILL.md'], 'skills=true 时必须记录实际创建的角色技能文件');
assert.match(unManifest.skills.createdFiles['product-manager/SKILL.md'], /^[a-f0-9]{64}$/);

const unDry = await byName.process_uninstall.execute({}, unExec);
assert.equal(unDry.dryRun, true, '默认必须 dry-run');
assert.match(unDry.report, /未删除/);
assert.match(unDry.report, /docs\/process\/\*\*/);
assert.equal(await exists(join(unRoot, 'docs/process/README.md')), true, 'dry-run 不得删除');

await assert.rejects(() => byName.process_uninstall.execute({ dryRun: false }, unExec), /未确认/);
assert.equal(await exists(join(unRoot, 'docs/process/README.md')), true, '未确认不得删除');

const unDone = await byName.process_uninstall.execute({ confirm: true, dryRun: false }, unExec);
assert.equal(await exists(join(unRoot, 'docs/process')), false, '确认后应删除流程目录');
assert.equal(await exists(join(unRoot, 'scripts/process')), false, '确认后应删除脚本目录');
assert.equal(await exists(join(unRoot, 'AGENTS.md')), false, 'init 创建且未修改的 AGENTS.md 应删除');
assert.equal(await exists(join(unRoot, '.dsh')), false, '只装有流程技能时 .dsh 也应清空');
assert.equal(await exists(join(unRoot, 'docs')), false, '空的 docs 父目录也应清掉');
assert.equal(await exists(join(unRoot, 'scripts')), false, '空的 scripts 父目录也应清掉');
assert.ok(unDone.removed.includes('docs/process/**'));
assert.ok(unDone.removed.includes('scripts/process/**'));
assert.ok(unDone.removed.includes('AGENTS.md'));
assert.ok(unDone.backupDir && (await exists(join(unDone.backupDir, 'docs/process/README.md'))), '默认应备份到临时目录');
assert.match(unDone.report, /process:journal/, '应报告 package.json 里仍指向已删脚本的命令');
assert.equal(await readFile(join(unRoot, 'package.json'), 'utf8'), `${JSON.stringify(unPackage, null, 2)}\n`, '不得改 package.json');
await rm(unDone.backupDir, { recursive: true, force: true });
await rm(unRoot, { recursive: true, force: true });

// 已存在的 AGENTS.md 不是 init 创建：确认卸载也不得删
const unKeepRoot = await mkdtemp(join(tmpdir(), 'process-kit-uninstall-keep-'));
await writeFile(join(unKeepRoot, 'AGENTS.md'), '# 我自己的项目指针\n', 'utf8');
const unKeepExec = { ...exec, agent: { session: { header: { cwd: unKeepRoot } } } };
await byName.process_init.execute({}, unKeepExec);
const unKeep = await byName.process_uninstall.execute({ confirm: true, dryRun: false, backup: false }, unKeepExec);
assert.equal(await readFile(join(unKeepRoot, 'AGENTS.md'), 'utf8'), '# 我自己的项目指针\n', '用户已有 AGENTS.md 绝不能被删');
assert.match(unKeep.report, /不是 process_init 创建/);
await rm(unKeepRoot, { recursive: true, force: true });

// init 创建但被改过的 AGENTS.md：默认保留，force 才删
const unModRoot = await mkdtemp(join(tmpdir(), 'process-kit-uninstall-mod-'));
const unModExec = { ...exec, agent: { session: { header: { cwd: unModRoot } } } };
await byName.process_init.execute({}, unModExec);
await writeFile(join(unModRoot, 'AGENTS.md'), `${await readFile(join(unModRoot, 'AGENTS.md'), 'utf8')}\n<!-- 我加的 -->\n`, 'utf8');
const unMod = await byName.process_uninstall.execute({ confirm: true, dryRun: false, backup: false }, unModExec);
assert.equal(await exists(join(unModRoot, 'AGENTS.md')), true, '被改过的 AGENTS.md 默认应保留');
assert.match(unMod.report, /已修改/);
await rm(unModRoot, { recursive: true, force: true });

// 人确认「连改过的生成文件一起删」时，force 才生效
const unForceRoot = await mkdtemp(join(tmpdir(), 'process-kit-uninstall-force-'));
const unForceExec = { ...exec, agent: { session: { header: { cwd: unForceRoot } } } };
await byName.process_init.execute({}, unForceExec);
await writeFile(join(unForceRoot, 'AGENTS.md'), '我改过的指针\n', 'utf8');
const unForce = await byName.process_uninstall.execute({ confirm: true, dryRun: false, backup: false, force: true }, unForceExec);
assert.equal(await exists(join(unForceRoot, 'AGENTS.md')), false, 'force 应删除 init 创建但被改过的 AGENTS.md');
assert.ok(unForce.removed.includes('AGENTS.md'));
await rm(unForceRoot, { recursive: true, force: true });

// 旧安装（没有清单）：目录照删，无法证明归属的 AGENTS.md 保留
const unLegacyRoot = await mkdtemp(join(tmpdir(), 'process-kit-uninstall-legacy-'));
await mkdir(join(unLegacyRoot, 'docs/process'), { recursive: true });
await writeFile(join(unLegacyRoot, 'docs/process/README.md'), '# 旧流程\n', 'utf8');
await mkdir(join(unLegacyRoot, 'scripts/process'), { recursive: true });
await writeFile(join(unLegacyRoot, 'scripts/process/old.mjs'), '// old\n', 'utf8');
await writeFile(join(unLegacyRoot, 'AGENTS.md'), '# 旧指针\n', 'utf8');
const unLegacyExec = { ...exec, agent: { session: { header: { cwd: unLegacyRoot } } } };
const unLegacy = await byName.process_uninstall.execute({ confirm: true, dryRun: false, backup: false }, unLegacyExec);
assert.equal(await exists(join(unLegacyRoot, 'docs/process')), false);
assert.equal(await exists(join(unLegacyRoot, 'scripts/process')), false);
assert.equal(await exists(join(unLegacyRoot, 'AGENTS.md')), true, '无清单时不得删用户 AGENTS.md');
assert.match(unLegacy.report, /旧安装/);
await rm(unLegacyRoot, { recursive: true, force: true });

// 旧安装但 AGENTS.md 就是「未改过的模板」（含上一版没有卸载提示段的模板）：可安全认领
const unLegacyTplRoot = await mkdtemp(join(tmpdir(), 'process-kit-uninstall-legacy-tpl-'));
await mkdir(join(unLegacyTplRoot, 'docs/process'), { recursive: true });
await writeFile(join(unLegacyTplRoot, 'docs/process/README.md'), '# 旧流程\n', 'utf8');
const oldTemplate = (await readFile(join(packageRoot, 'AGENTS.template.md'), 'utf8')).replace(/\n\*\*不想继续用流程\*\*[^\n]*\n/g, '\n');
await writeFile(join(unLegacyTplRoot, 'AGENTS.md'), oldTemplate, 'utf8');
const unLegacyTplExec = { ...exec, agent: { session: { header: { cwd: unLegacyTplRoot } } } };
await byName.process_uninstall.execute({ confirm: true, dryRun: false, backup: false }, unLegacyTplExec);
assert.equal(await exists(join(unLegacyTplRoot, 'docs/process')), false);
assert.equal(await exists(join(unLegacyTplRoot, 'AGENTS.md')), false, '逐字模板（含上一版）应可安全删除');
await rm(unLegacyTplRoot, { recursive: true, force: true });

// 用户已有的同名技能：init 会跳过，卸载也不得删
const unSkillRoot = await mkdtemp(join(tmpdir(), 'process-kit-uninstall-skill-'));
await mkdir(join(unSkillRoot, '.dsh/skills/product-manager'), { recursive: true });
await writeFile(join(unSkillRoot, '.dsh/skills/product-manager/SKILL.md'), '# 我定制的 pm\n', 'utf8');
const unSkillExec = { ...exec, agent: { session: { header: { cwd: unSkillRoot } } } };
await byName.process_init.execute({ skills: true }, unSkillExec);
const unSkill = await byName.process_uninstall.execute({ confirm: true, dryRun: false, backup: false }, unSkillExec);
assert.equal(await readFile(join(unSkillRoot, '.dsh/skills/product-manager/SKILL.md'), 'utf8'), '# 我定制的 pm\n', '用户已有技能绝不能被删');
assert.ok(!unSkill.removed.includes('.dsh/skills/product-manager/SKILL.md'));
await rm(unSkillRoot, { recursive: true, force: true });

// 旧安装没有技能清单：与包内版本逐字一致的副本可安全清掉
const unSkillLegacyRoot = await mkdtemp(join(tmpdir(), 'process-kit-uninstall-skill-legacy-'));
await mkdir(join(unSkillLegacyRoot, '.dsh/skills/product-manager'), { recursive: true });
await writeFile(
	join(unSkillLegacyRoot, '.dsh/skills/product-manager/SKILL.md'),
	await readFile(join(packageRoot, 'skills/product-manager/SKILL.md')),
	'utf8',
);
const unSkillLegacyExec = { ...exec, agent: { session: { header: { cwd: unSkillLegacyRoot } } } };
const unSkillLegacy = await byName.process_uninstall.execute({ confirm: true, dryRun: false, backup: false }, unSkillLegacyExec);
assert.equal(await exists(join(unSkillLegacyRoot, '.dsh')), false, '逐字一致的旧技能副本应被清掉');
assert.ok(unSkillLegacy.removed.includes('.dsh/skills/product-manager/SKILL.md'));
await rm(unSkillLegacyRoot, { recursive: true, force: true });

// ---- 双语（lang：zh / en / auto）-------------------------------------
//
// 语言是仓库级设定：清单 lang → PROJECT.md lang → 文档推断 → zh。
// 这里钉死「英文仓库拿到英文骨架与英文报告」以及「切语言只覆盖框架自有文件」。

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

{
	// auto：仓库里有英文 README ⇒ 推断 en
	const enRoot = await mkdtemp(join(tmpdir(), 'process-kit-en-'));
	await writeFile(join(enRoot, 'README.md'), '# Demo\n\nAn English project.\n', 'utf8');
	const enExec = { ...exec, agent: { session: { header: { cwd: enRoot } } } };

	const enDry = await byName.process_init.execute({ dryRun: true }, enExec);
	assert.equal(enDry.lang, 'en', 'auto 应按仓库 README 推断出 en');

	const enReal = await byName.process_init.execute({}, enExec);
	assert.equal(enReal.lang, 'en');
	assert.ok(enReal.created.includes('docs/process/README.md'));
	assert.ok(!enReal.created.some((f) => f.startsWith('docs/process/en/')), '英文骨架源不该再嵌一层 en/');

	const enManifest = JSON.parse(await readFile(join(enRoot, 'docs/process/.process-kit.json'), 'utf8'));
	assert.equal(enManifest.lang, 'en', '卸载清单必须记语言，否则下次 auto 又猜错');

	const enScaffold = await readFile(join(enRoot, 'docs/process/README.md'), 'utf8');
	assert.equal((enScaffold.match(CJK) ?? []).length, 0, '英文骨架不得残留中文');
	assert.match(enScaffold, /^# /, '英文骨架应是英文文档');

	const enProject = await readFile(join(enRoot, 'docs/process/PROJECT.md'), 'utf8');
	assert.match(enProject, /^lang: en$/m, '英文 PROJECT.md 必须声明 lang: en');
	assert.ok(enProject.includes('<!-- process:owner-table -->'), '英文 PROJECT.md 必须带属主表标记');
	assert.ok((await readFile(join(enRoot, 'docs/process/tools/README.md'), 'utf8')).includes('<!-- process:registry -->'));

	const enAgents = await readFile(join(enRoot, 'AGENTS.md'), 'utf8');
	assert.match(enAgents, /## Development process/, '应使用英文 AGENTS 模板');
	assert.equal((enAgents.match(CJK) ?? []).length, 0, '英文 AGENTS 模板不得含中文');

	// 工具报告也要说英文
	const enStatus = await byName.process_status.execute({}, enExec);
	const enText = byName.process_status.output.render({}, enStatus)[0].text;
	assert.equal((enText.match(CJK) ?? []).length, 0, `英文仓库的状态报告不得夹中文：\n${enText}`);
	assert.match(enText, /Process status|no active package/i, `英文仓库的状态报告应是英文：\n${enText}`);

	// 英文骨架 + 英文报告一起用：gate_summary 也是英文
	await writeFile(
		join(enRoot, 'docs/process/input/FEAT-201-check.md'),
		'---\nid: FEAT-201\nkind: requirement-check\nstatus: pending\ngate0: pending\nflow: full\nuiDesign: not-needed\n---\n\n# check\n',
		'utf8',
	);
	const enSummary = await byName.gate_summary.execute({ id: 'FEAT-201' }, enExec);
	assert.equal((enSummary.skeleton.match(CJK) ?? []).length, 0, `英文仓库的 Gate 摘要不得夹中文：\n${enSummary.skeleton}`);
	assert.match(enSummary.skeleton, /What was done/);

	// 显式 lang 覆盖自动推断（这里是反向：英文仓库里强制中文）
	const forced = await byName.process_init.execute({ dryRun: true, lang: 'zh' }, enExec);
	assert.equal(forced.lang, 'zh', '显式 lang 必须压过自动推断');
	await assert.rejects(() => byName.process_init.execute({ dryRun: true, lang: 'fr' }, enExec), /zh \/ en \/ auto/);

	await rm(enRoot, { recursive: true, force: true });
}

// 切语言：框架自有文件按新语言覆盖（先备份），项目可定制文件永不覆盖
{
	const swRoot = await mkdtemp(join(tmpdir(), 'process-kit-switch-'));
	const swExec = { ...exec, agent: { session: { header: { cwd: swRoot } } } };
	await byName.process_init.execute({ agents: false }, swExec); // 默认 zh
	const mineProject = '---\nproject: mine\nprocessVersion: 2\nlang: zh\n---\n\n# 我填的 PROJECT\n';
	await writeFile(join(swRoot, 'docs/process/PROJECT.md'), mineProject, 'utf8');

	const switched = await byName.process_init.execute({ upgrade: true, lang: 'en', agents: false }, swExec);
	assert.equal(switched.lang, 'en');
	assert.ok(switched.updated.includes('docs/process/README.md'), '框架自有文件应按新语言覆盖');
	assert.ok(switched.manual.includes('docs/process/PROJECT.md'), '项目可定制文件应进「需人工比对」而不是被覆盖');
	assert.equal(await readFile(join(swRoot, 'docs/process/PROJECT.md'), 'utf8'), mineProject, 'PROJECT.md 绝不能被语言切换覆盖');
	assert.match(switched.report, /language switched from zh to en/);
	const enAfter = await readFile(join(swRoot, 'docs/process/README.md'), 'utf8');
	assert.equal((enAfter.match(CJK) ?? []).length, 0, '切换后框架文件应是英文');

	// 清单语言优先于 PROJECT.md 的 lang（切换后 PROJECT.md 仍是 zh，不能把仓库拽回 zh）
	const langs = JSON.parse(await readFile(join(swRoot, 'docs/process/.process-kit.json'), 'utf8'));
	assert.equal(langs.lang, 'en');
	const statusAfter = byName.process_status.output.render({}, await byName.process_status.execute({}, swExec))[0].text;
	assert.match(statusAfter, /Process status|no active package/i, '切换后报告应跟随清单语言（en）');

	await rm(swRoot, { recursive: true, force: true });
}

// 技能 provider：英文仓库 / PROCESS_KIT_LANG=en 时取 SKILL.en.md
{
	process.env.PROCESS_KIT_LANG = 'en';
	try {
		const enCandidates = await provider.list();
		assert.equal(enCandidates.length, 9);
		const pm = enCandidates.find((c) => c.name === 'product-manager');
		assert.equal((pm.description.match(CJK) ?? []).length, 0, '英文模式下技能描述不得是中文');
		const loaded = await provider.get(pm);
		assert.equal((loaded.content.match(CJK) ?? []).length, 0, '英文模式下技能正文不得是中文');
		assert.match(loaded.path, /SKILL\.en\.md$/, '英文模式应加载 SKILL.en.md');
	} finally {
		delete process.env.PROCESS_KIT_LANG;
	}
	const zhCandidates = await provider.list();
	const zhPm = zhCandidates.find((c) => c.name === 'product-manager');
	assert.match(zhPm.description, CJK, '默认（中文仓库）仍应给中文技能');
	assert.match((await provider.get(zhPm)).path, /SKILL\.md$/, '中文模式应加载 SKILL.md');
}

// ---- 清理 ------------------------------------------------------------

await rm(root, { recursive: true, force: true });
await rm(empty, { recursive: true, force: true });
await rm(notARepo, { recursive: true, force: true });
await rm(target, { recursive: true, force: true });

console.log('host.test.mjs: all assertions passed');
