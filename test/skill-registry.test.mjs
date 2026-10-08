/**
 * 真注册表集成测试：把插件的技能 provider 挂进**真实的 SkillRegistry**
 * （`@deepseek-ai/dsh-skill`），验证候选与定义能通过它的校验、能被 list/get
 * 取出，并验证「项目技能覆盖插件技能」的优先级承诺。
 *
 * 为什么要有这个测试：技能 provider 属服务端部分，改动要重启 `dsh web` 才生效，
 * 而重启会掐掉正在跑的会话。本测试在进程外直接驱动注册表，是「安装即得基础
 * subagent」这句承诺在重启之前的唯一端到端证据。
 *
 * DSH 安装找不到时**跳过**（退出码 0），保证仓库在没有 DSH 的机器上也能跑。
 *
 * 用法：node test/skill-registry.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 依次尝试：环境变量 → 本机 DSH 安装 → 裸包名。 */
async function loadDsh() {
	const roots = [
		process.env.DSH_SKILL_ROOT,
		'/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai',
	].filter((v) => typeof v === 'string' && v !== '');
	for (const root of roots) {
		try {
			const cordis = await import(`${root}/cordis/lib/index.js`);
			const skill = await import(`${root}/dsh-skill/lib/index.js`);
			return { Context: cordis.Context, SkillRegistry: skill.SkillRegistry };
		} catch {
			/* 试下一个 */
		}
	}
	try {
		const cordis = await import('@deepseek-ai/cordis');
		const skill = await import('@deepseek-ai/dsh-skill');
		return { Context: cordis.Context, SkillRegistry: skill.SkillRegistry };
	} catch {
		return null;
	}
}

const dsh = await loadDsh();
if (dsh === null) {
	console.log('skill-registry.test.mjs: 未找到 DSH 的 dsh-skill，跳过（非失败）');
	process.exit(0);
}

const { Context } = dsh;
const { SkillRegistry } = dsh;

// ---- 造一个「像流程仓」的工作区与一个「不像」的工作区 -------------------

const repo = await mkdtemp(join(tmpdir(), 'process-kit-registry-'));
await mkdir(join(repo, 'docs/process'), { recursive: true });
const stranger = await mkdtemp(join(tmpdir(), 'process-kit-stranger-'));

// ---- 用桩 ctx 驱动插件的 apply，provider 落到真注册表 -----------------

const registry = new SkillRegistry(new Context(), {});
const stub = {
	logger: { warn: () => {}, info: () => {} },
	effect: (factory) => {
		factory();
		return () => {};
	},
	inject: (_deps, callback) => {
		callback(stub);
	},
	tools: { register: () => () => {} },
	systemPrompt: { section: () => () => {} },
	webServer: { register: () => () => {} },
	connection: { requestRejection: () => undefined },
	sessions: { list: () => [] },
	sessionQuery: { listSessions: async () => [] },
	skills: registry,
};
const { apply } = await import('../lib/index.js');
apply(stub);

// ---- 候选与定义必须通过真注册表的校验 --------------------------------

const summaries = await registry.snapshot({ cwd: repo });
const names = summaries.skills.map((s) => s.name).sort();
assert.deepEqual(
	names,
	['code-review-agent', 'dev-agent', 'logic-review-agent', 'product-manager', 'security-review-agent', 'test-agent', 'uat-agent'],
	'真注册表必须收下 7 个打包角色',
);
assert.equal(summaries.complete, true, '发现过程应完整（provider 没抛错）');
for (const summary of summaries.skills) {
	assert.equal(summary.provider, 'process-kit-skills');
	assert.equal(summary.source, 'bundled');
	assert.equal(summary.invocation.modelInvocable, true);
	assert.equal(summary.invocation.userInvocable, true);
}

const loaded = await registry.get('product-manager', { cwd: repo });
assert.ok(loaded !== undefined, 'get 必须能取到定义');
assert.ok(loaded.content.length > 500, '定义正文应是完整技能内容');
assert.ok(!loaded.content.startsWith('---'), '正文应已剥掉 frontmatter');

// ---- 广播范围：默认任何工作区都有角色；环境变量可静默 -----------------

const strangerSummaries = await registry.snapshot({ cwd: stranger });
assert.equal(strangerSummaries.skills.length, 7, '默认应在任何工作区广播角色技能');

// 用**另一个** cwd 验证 opt-out（注册表按 cwd 缓存，复用 stranger 会命中缓存）
const quietCwd = await mkdtemp(join(tmpdir(), 'process-kit-quiet-'));
process.env.PROCESS_KIT_SKILLS = 'off';
try {
	const quiet = await registry.snapshot({ cwd: quietCwd });
	assert.deepEqual(quiet.skills, [], 'PROCESS_KIT_SKILLS=off 应静默');
} finally {
	delete process.env.PROCESS_KIT_SKILLS;
	await rm(quietCwd, { recursive: true, force: true });
}

// ---- 优先级：项目技能（rank 100）覆盖插件技能（rank 600）--------------

const override = {
	name: 'dev-agent',
	description: '项目自己的 dev 角色（覆盖插件基线）',
	invocation: { modelInvocable: true, userInvocable: true },
	source: 'project',
	provider: 'test-project-skills',
	rank: 100,
	locator: { id: 'project-dev' },
};
registry.registerProvider(() => ({
	name: 'test-project-skills',
	list: async () => [override],
	get: async () => ({ ...override, content: 'PROJECT-OVERRIDE-BODY' }),
}));

const merged = await registry.get('dev-agent', { cwd: repo });
assert.equal(merged.content, 'PROJECT-OVERRIDE-BODY', '项目技能必须盖过插件的同名基线技能');
assert.equal(merged.provider, 'test-project-skills');

// ---- 清理 ------------------------------------------------------------

await rm(repo, { recursive: true, force: true });
await rm(stranger, { recursive: true, force: true });

console.log('skill-registry.test.mjs: all assertions passed（真注册表集成）');
