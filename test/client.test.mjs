/**
 * 客户端半冒烟测试：模块加载、shell.overlay 注册、看板三种形态（not-found /
 * 就绪含包与警告 / 收起胶囊）。做法与 dsh-global-todos 的 share-ui 测试相同：
 * vm 沙箱 + 桩 React（钩子按下标注入）+ 树遍历断言文本。
 *
 * 用法：node test/client.test.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// 客户端半通过 `exports` 暴露，测试直接拿组件：在内存里补一行导出。
const CLIENT = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'process-kit-ui-'));
const patched = join(scratch, 'client.cjs');
writeFileSync(
	patched,
	readFileSync(CLIENT, 'utf8').replace('exports.inject = inject;', 'exports.__panel = ProcessPanel;\nexports.inject = inject;'),
);

let spec;
const store = new Map();
let fetched = 0;
const payloadRef = { value: null };
const stubFetch = async () => {
	fetched += 1;
	return { ok: true, status: 200, json: async () => payloadRef.value };
};
const sandbox = {
	window: {
		__ModuleLoader__: { load: (s) => { spec = s; } },
		localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
		fetch: stubFetch,
		setInterval: () => 0,
		clearInterval: () => {},
	},
	fetch: stubFetch,
	console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(patched, 'utf8'), sandbox);

const React = {
	// 钩子顺序：0 model、1 open。默认注入「就绪 + 当前 stubFetch 返回的 payload」，
	// 让文本断言直接对着真实渲染树。
	useState: (init) => {
		const v =
			hookIndex in hookState
				? hookState[hookIndex]
				: hookIndex === 0
					? { phase: 'ready', payload: payloadRef.value }
					: typeof init === 'function'
						? init()
						: init;
		hookIndex += 1;
		return [v, () => {}];
	},
	useCallback: (fn) => fn,
	useEffect: (callback) => {
		callback();
	},
};
let hookIndex = 0;
let hookState = [];

const mod = spec.factory((id) => {
	if (id === 'react') return React;
	if (id === 'react/jsx-runtime') return { jsx: (t, p) => ({ t, p }), jsxs: (t, p) => ({ t, p }), Fragment: 'Fragment' };
	throw new Error('unexpected ' + id);
});

let fails = 0;
const check = (label, got, want) => {
	const ok = JSON.stringify(got) === JSON.stringify(want);
	if (!ok) fails += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n   got : ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`}`);
};

// ---- 模块与注册 ------------------------------------------------------

check('模块 id', spec.id, 'dsh-process-kit');
check('inject 只有 slots', mod.inject, ['slots']);

const registrations = [];
const stubCtx = {
	slots: {
		// apply 调 inject(slot, factory)；factory 闭包里又调 ctx.slots.register(meta, component)。
		// 两个方法都得在同一个桩 ctx 上，捕获才成。
		inject: (slot, factory) => {
			factory();
		},
		register: (meta, component) => {
			registrations.push({ slot: 'shell.overlay', meta, component });
			return () => {};
		},
	},
};
mod.apply(stubCtx);
check('注册进 shell.overlay', registrations.map((r) => r.slot), ['shell.overlay']);
check('注册 id 与 order', registrations.length === 1 ? [registrations[0].meta.name, registrations[0].meta.id, registrations[0].meta.order] : [], ['shell.overlay', 'process-kit', 60]);
check('注册了组件', registrations.length === 1 && typeof registrations[0].component === 'function', true);

const walk = (node, visit) => {
	if (typeof node === 'string') {
		visit.text.push(node);
		return;
	}
	if (node === null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		node.forEach((child) => walk(child, visit));
		return;
	}
	visit.all.push(node);
	if (node.t === 'button' && node.p?.title) visit.titles.push(node.p.title);
	if (node.p?.children !== undefined) walk(node.p.children, visit);
};

/** 渲染一次：state 覆盖钩子初值。 */
function render(overrides = {}) {
	hookIndex = 0;
	hookState = overrides;
	const visit = { text: [], titles: [], all: [] };
	walk(mod.__panel(), visit);
	return visit;
}

// ---- not-found --------------------------------------------------------

payloadRef.value = { found: false, root: '/tmp/x' };
let r = render();
check('not-found：有提示', r.text.some((t) => String(t).includes('没有 docs/process')), true);
check('not-found：有展开说明', r.text.some((t) => String(t).includes('看板跟随日志推进最远的会话')), true);

// ---- 就绪 --------------------------------------------------------------

payloadRef.value = {
	found: true,
	root: '/tmp/demo-repo',
	generatedAt: '2026-10-05T10:00:00.000Z',
	packages: [
		{
			id: 'FEAT-101',
			status: 'red',
			statusClass: 'warn',
			gates: { gate0: 'approved', gate1: 'approved', gate2: 'approved', gate4: 'pending' },
			prdVersion: '2',
			check: { file: 'docs/process/input/FEAT-101-需求核对件.md' },
			prd: { file: 'docs/process/prd/FEAT-101.md' },
			artifacts: { contracts: 'docs/process/contracts/FEAT-101.md' },
			journal: { file: 'x', lines: 12, lastAt: '2026-10-05T09:00:00.000Z', lastActor: 'subagent:Test-Agent', lastStep: 'test' },
			openBugs: ['FEAT-101-01'],
			next: { short: '调 dev 实现', gate: null, action: 'gate2 已过：调 dev 实现到绿，status → implementing' },
		},
		{
			id: 'FEAT-102',
			status: 'frozen',
			statusClass: 'warn',
			gates: { gate0: 'approved', gate1: 'pending', gate2: null, gate4: null },
			check: null,
			prd: { file: 'docs/process/prd/FEAT-102.md' },
			artifacts: null,
			journal: null,
			openBugs: [],
			next: { short: '等 Gate1', gate: 'Gate1', action: '停等 Gate1 人签（gate1: approved）' },
		},
	],
	openBugCount: 1,
	orphanBugs: [{ id: 'BUG-9-01', file: 'docs/process/bugs/BUG-9-01.md' }],
	warnings: ['FEAT-102: status=frozen 但 gate1=pending'],
	doneCount: 0,
	releasePending: false,
};

r = render();
check('就绪：标题', r.text.some((t) => String(t).includes('流程看板')), true);
check('就绪：包 FEAT-101', r.text.some((t) => String(t).includes('FEAT-101')), true);
check('就绪：状态 red', r.text.some((t) => String(t) === 'red'), true);
check('就绪：下一步动作', r.text.some((t) => String(t).includes('调 dev 实现到绿')), true);
check('就绪：Gate1 停等标注', r.text.some((t) => String(t).includes('（Gate1）')), true);
check('就绪：open bug 展示', r.text.some((t) => String(t).includes('FEAT-101-01')), true);
check('就绪：journal 行数', r.text.some((t) => String(t).includes('journal 12 行')), true);
check('就绪：警告区', r.text.some((t) => String(t).includes('状态位不一致')), true);
check('就绪：警告明细', r.text.some((t) => String(t).includes('frozen 但 gate1=pending')), true);
check('就绪：未挂包 bug', r.text.some((t) => String(t).includes('BUG-9-01')), true);
check('就绪：root 落脚', r.text.some((t) => String(t).includes('/tmp/demo-repo')), true);
check('就绪：刷新按钮', r.titles.includes('刷新'), true);
check('就绪：收起按钮', r.titles.includes('收起'), true);

// ---- release 待办 ------------------------------------------------------

payloadRef.value = { ...payloadRef.value, doneCount: 2, releasePending: true };
r = render();
check('release：待上线提醒', r.text.some((t) => String(t).includes('发布前整体回归')), true);

// ---- 收起胶囊 ----------------------------------------------------------

r = render({ 1: false });
check('收起：胶囊有展开提示', r.titles.includes('展开流程看板'), true);
check('收起：显示活跃包数', r.text.some((t) => String(t).includes('2 包')), true);

// ---- 轮询确实发起了 ----------------------------------------------------

check('渲染期间发起了 Host 路由请求', fetched > 0, true);

rmSync(scratch, { recursive: true, force: true });
if (fails > 0) {
	console.error(`client.test.mjs: ${fails} FAILED`);
	process.exit(1);
}
console.log('client.test.mjs: all assertions passed');
