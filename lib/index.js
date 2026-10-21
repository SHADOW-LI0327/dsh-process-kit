/**
 * 通用单人开发流程框架（dsh-process-kit），服务端部分（在 dsh 进程里跑）。
 *
 * 组成：
 *
 * - **角色技能**：把包内 `skills/<name>/SKILL.md` 通过 `ctx.skills.registerProvider`
 *   注册为 rank 600 的打包技能（DSH 官方定义的 bundled 档）——**安装即得基础
 *   subagent**，默认在所有工作区广播（`PROCESS_KIT_SKILLS=off` 可关）。项目自己的
 *   `.dsh/skills/**`（rank 100/200）永远覆盖它，所以「插件给基线、项目可覆盖」。
 * - **流程工具**：`process_status`（扫 frontmatter 出状态机快照与下一步动作）、
 *   `gate_summary`（两段式 Gate 摘要骨架）、`process_journal`（安全追加 journal，
 *   语义与仓库侧 `scripts/process/journal-append.mjs` 对等）。
 * - **初始化工具 `process_init`**：把包内 `scaffold/**` 落到目标仓库
 *   `docs/process/**`、`scripts/*.mjs` 落到 `scripts/process/**`；只创建、不覆盖；
 *   并写 `docs/process/.process-kit.json` 卸载清单。
 * - **卸载工具 `process_uninstall`**：默认 dry-run，人确认后清掉插件落的流程内容；
 *   只删清单证明是 init 创建且未改过的 `AGENTS.md` / 技能副本，已有文件不碰。
 *
 * 设计红线：**目标仓库的 `docs/process/**` 文件是唯一真源**。本插件不另存状态，
 * 每次调用现读；无流程目录的仓库一律返回 not-found，初始化也只增不改。
 *
 * @module dsh-process-kit
 */
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readdir, readFile, rename, rmdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cordis function-plugin name. */
const name = 'process-kit';

/**
 * 硬依赖：工具注册、系统提示。
 * `skills` 走可选注入（`ctx.inject`），缺少技能服务的组合里工具照常工作。
 */
const inject = ['tools', 'systemPrompt'];

/** 相对工作区根的流程目录（框架自身约定）。 */
const PROCESS_REL = 'docs/process';

/** 卸载清单：记录「哪些东西是 process_init 落的」，避免把用户自己的文件当成插件产物删掉。 */
const MANIFEST_NAME = '.process-kit.json';
const MANIFEST_REL = `${PROCESS_REL}/${MANIFEST_NAME}`;
const DEFAULT_SCRIPTS_REL = 'scripts/process';

/** 不能作为脚本落点的顶层宽目录：卸载是整目录删，落在这里会把项目自己的文件一起带走。 */
const BROAD_SCRIPTS_DIRS = new Set([
	'scripts',
	'src',
	'test',
	'tests',
	'docs',
	'.dsh',
	'.github',
	'lib',
	'app',
	'apps',
	'packages',
	'tools',
	'node_modules',
	'dist',
	'build',
	'coverage',
]);

/** 打包技能的优先级：DSH 定义的 bundled 档（数值越大优先级越低）。 */
const BUNDLED_SKILL_RANK = 600;

/** 升级时按「框架自有」覆盖的 scaffold 文件（项目不该改它们）；其余只报告。 */
const UPGRADE_OVERWRITE = new Set([
	'README.md',
	'orchestrator.md',
	'input/_CHECK_TEMPLATE.md',
	'prd/_TEMPLATE.md',
	'prd/_DESIGN_TEMPLATE.md',
	'prd/_UI_SPEC_TEMPLATE.md',
	'tools/README.md',
]);

/** 升级时只报告、由人合并的 scaffold 文件（项目可定制，永不自动覆盖）。 */
const UPGRADE_MANUAL = ['PROJECT.md', 'ui/tokens.md', 'ui/recipe.md'];

/** 技能提供者在 `ctx.skills` 注册表里的名字。 */
const SKILL_PROVIDER = 'process-kit-skills';

/** 包目录（`lib/` 的上一级），用于定位 `skills/`、`scaffold/`。 */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 包 ID 只允许 ASCII 字母数字打头的紧凑串，防路径逃逸。 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** 技能名语法（与 DSH 的 SKILL_NAME 一致）。 */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 环境变量逃生口：固定工作区根（绝对路径），优先于会话推导。 */
function rootOverride() {
	const value = process.env.PROCESS_KIT_ROOT;
	return typeof value === 'string' && value !== '' ? value : undefined;
}

/* ------------------------------------------------------------------ *
 * frontmatter 解析与文件小工具
 * ------------------------------------------------------------------ */

/**
 * 解析 YAML frontmatter 的扁平 `key: value` 子集。
 *
 * 起始 fence 只要求出现在文件前 15 行内（模板常把 HTML 注释写在 `---` 之前）；
 * 值里的 ` # ...` 尾注剥掉；模板占位符 `<...>` 视为缺失。
 */
function parseFrontmatter(text) {
	const lines = text.split('\n');
	const limit = Math.min(lines.length, 15);
	let start = -1;
	for (let i = 0; i < limit; i += 1) {
		if (/^---\s*$/.test(lines[i])) {
			start = i;
			break;
		}
	}
	if (start === -1) return null;
	let end = -1;
	for (let i = start + 1; i < lines.length; i += 1) {
		if (/^---\s*$/.test(lines[i])) {
			end = i;
			break;
		}
	}
	if (end === -1) return null;
	const map = {};
	for (let i = start + 1; i < end; i += 1) {
		const match = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(lines[i]);
		if (match === null) continue;
		let value = match[2].trim();
		const comment = value.indexOf(' #');
		if (comment !== -1) value = value.slice(0, comment).trim();
		value = value.replace(/^["'](.*)["']$/, '$1');
		if (value === '' || value.startsWith('<')) continue;
		map[match[1]] = value;
	}
	return map;
}

/** 读取一个 md 文件的 frontmatter；不存在或无 frontmatter 返回 null。 */
async function readFrontmatter(path) {
	let text;
	try {
		text = await readFile(path, 'utf8');
	} catch {
		return null;
	}
	return parseFrontmatter(text);
}

/** 目录存在则列名（只取文件），否则空数组。 */
async function listFiles(dir) {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries.filter((e) => e.isFile()).map((e) => e.name);
	} catch {
		return [];
	}
}

/** 目录存在则列子目录名，否则空数组。 */
async function listDirs(dir) {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries.filter((e) => e.isDirectory()).map((e) => e.name);
	} catch {
		return [];
	}
}

/** 文件或目录是否存在。 */
async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

/* ------------------------------------------------------------------ *
 * 状态机（状态 → 动作）
 * ------------------------------------------------------------------ */

const GATES = ['gate0', 'gate1', 'gate2', 'gate4'];

/** 状态分类：给摘要等消费方一个稳定的着色档。 */
function statusClass(status) {
	if (status === 'done') return 'done';
	if (status === 'terminated') return 'muted';
	if (status === 'frozen' || status === 'red') return 'warn';
	if (status === 'uat' || status === 'implementing') return 'accent';
	return 'normal';
}

/** 一个包的下一步动作；gate 为 null 表示无停等点。 */
function nextAction(pkg) {
	const check = pkg.check;
	const prd = pkg.prd;
	if (!check && !prd) {
		return {
			short: '起草核对件',
			gate: 'Gate0',
			action:
				'input/ 有原料但无核对件：主控先判表达是否足以支撑可断言判据；不足则写 input/<ID>-research-brief.md，并行派 pm + architect 调研并汇合，再起草需求核对件（fast 路径不做调研），随后停等 Gate0',
		};
	}
	if (!prd) {
		if (check.gate0 === 'approved' && check.flow === 'fast') {
			return {
				short: '快速路径：直派 dev',
				gate: null,
				action:
					'核对件已裁定快速路径（flow: fast）：不派 pm、不产生 Gate1/Gate2、不做调研；直接派 dev 实现 + 存量回归，结论记 journal。若实际触及 schema/RBAC/金额/对外接口 ⇒ 退回全流程',
			};
		}
		if (check.gate0 === 'approved') {
			return {
				short: '调 pm',
				gate: 'Gate1',
				action:
					check.uiDesign === 'required'
						? 'gate0 已过（uiDesign: required）：调 pm 出 PRD + 契约 + 设计与说明；有架构影响时调 architect 出 prd/<ID>-arch.md（随 Gate1 加审）；再调 ui-designer 出 UI 规格（prd/<ID>-ui-spec.md，随 Gate1 一并审），随后停等 Gate1'
						: 'gate0 已过：调 pm 出 PRD + 契约 + 设计与说明；有架构影响时调 architect 出 prd/<ID>-arch.md（随 Gate1 加审），随后停等 Gate1',
			};
		}
		if (check.gate0 === 'rejected') {
			return { short: '修订核对件', gate: 'Gate0', action: '按人裁定修订核对件，重新停等 Gate0' };
		}
		return { short: '等 Gate0', gate: 'Gate0', action: '停等 Gate0 人签（核对件 frontmatter gate0: approved）' };
	}
	if (prd.gate1 === 'pending') return { short: '等 Gate1', gate: 'Gate1', action: '停等 Gate1 人签（gate1: approved）' };
	if (prd.gate1 === 'rejected') {
		return {
			short: '修订送审件',
			gate: 'Gate1',
			action:
				check?.uiDesign === 'required'
					? '按驳回意见修订 PRD/契约/设计与说明/UI 规格（有 arch 时含 arch），重等 Gate1'
					: '按驳回意见修订 PRD/契约/设计与说明（有 arch 时含 arch），重等 Gate1',
		};
	}
	if (prd.gate2 === 'pending') {
		return { short: '调 test 写红', gate: 'Gate2', action: '调 test 生成测试 + 红灯归因，随后停等 Gate2' };
	}
	if (prd.gate2 === 'rejected') return { short: '修订判据', gate: 'Gate2', action: '按驳回意见修订测试/判据，重等 Gate2' };
	switch (prd.status) {
		case 'red':
			return { short: '调 dev 实现', gate: null, action: 'gate2 已过：调 dev 实现到绿，status → implementing' };
		case 'implementing':
			return { short: 'test 独立复跑', gate: null, action: '切片循环；全部完成后由 test 独立复跑 L2 包验证，status → uat' };
		case 'uat':
			if (prd.gate4 === 'approved') {
				return { short: '收口', gate: null, action: 'gate4 已签：落 status=done，并提醒人提交（默认归档 = git）' };
			}
			return { short: 'uat → pm 审核', gate: 'Gate4', action: '调 uat 黑盒验收 → pm 完备性审核 → 停等 Gate4' };
		case 'done':
			return { short: 'done', gate: null, action: '已完成；多包 done 待上线时走发布前整体回归' };
		case 'terminated':
			return { short: 'terminated', gate: null, action: '人裁终止：产物原地保留，不重做、不清场' };
		case 'frozen':
			return { short: '调 test 写红', gate: 'Gate2', action: 'frozen：调 test 生成测试 + 归因，随后停等 Gate2' };
		case 'draft':
		default:
			if (prd.gate2 === 'approved') {
				return { short: '同步状态位', gate: null, action: 'gate2 已 approved 但 status 仍是 draft：核对 frontmatter 后推进（red/implementing）' };
			}
			return { short: prd.status ?? '未知', gate: null, action: '未知状态组合，人工判读 frontmatter' };
	}
}

/** 状态位一致性；只报事实，不替人修。 */
function consistencyWarnings(pkg, warnings) {
	const prd = pkg.prd;
	if (pkg.check?.flow === 'fast' && prd !== null) {
		warnings.push(`${pkg.id}: 核对件 flow=fast 但已存在 PRD（快速路径不建 PRD，两处需一起核）`);
	}
	if (pkg.uiDesign !== null && pkg.uiDesign !== undefined && !['required', 'not-needed'].includes(pkg.uiDesign)) {
		warnings.push(`${pkg.id}: 核对件 uiDesign 取值异常 "${pkg.uiDesign}"（应为 required / not-needed）`);
	}
	if (pkg.check?.flow === 'fast' && pkg.uiDesign === 'required') {
		warnings.push(
			`${pkg.id}: 核对件 flow=fast 与 uiDesign=required 冲突（快速路径不建 PRD、不过 Gate1，承载不了 UI 规格：改 flow=full 或 uiDesign=not-needed）`,
		);
	}
	if (pkg.check?.flow === 'fast' && (pkg.artifacts?.researchBrief || pkg.artifacts?.priorArt || pkg.artifacts?.techScan)) {
		warnings.push(`${pkg.id}: 核对件 flow=fast 但存在借鉴调研件（快速路径不做调研：删调研件或改 flow=full）`);
	}
	if (!prd) return;
	const where = `${pkg.id}`;
	if (prd.mainMissing) {
		const others = prd.otherFiles.map((f) => `${PROCESS_REL}/prd/${f}`).join('、');
		warnings.push(
			`${where}: 找不到主件 ${PROCESS_REL}/prd/${pkg.id}.md —— 状态位改读 ${prd.file}（同 ID 还有 ${others || '无'}；补上主件或改名，别让从件顶替）`,
		);
	}
	if (pkg.uiDesign === 'required' && prd.gate1 === 'approved' && pkg.artifacts?.uiSpec === null) {
		warnings.push(`${where}: 核对件 uiDesign=required 但 ${PROCESS_REL}/prd/${pkg.id}-ui-spec.md 缺失（Gate1 应审 UI 规格）`);
	}
	if (prd.status === 'frozen' && prd.gate1 !== 'approved') {
		warnings.push(`${where}: status=frozen 但 gate1=${prd.gate1}（frozen 定义为 Gate1 已过，两处需一起改）`);
	}
	if (prd.gate2 === 'approved' && ['draft', 'frozen'].includes(prd.status)) {
		warnings.push(`${where}: gate2=approved 但 status=${prd.status}（应已进 red/implementing）`);
	}
	if (prd.gate4 === 'approved' && prd.status !== 'done') {
		warnings.push(`${where}: gate4=approved 但 status=${prd.status}（应落 done）`);
	}
	if (prd.status === 'uat' && prd.gate2 !== 'approved') {
		warnings.push(`${where}: status=uat 但 gate2=${prd.gate2}`);
	}
	for (const gate of GATES) {
		if (prd[gate] !== undefined && !['pending', 'approved', 'rejected'].includes(prd[gate])) {
			warnings.push(`${where}: ${gate} 取值异常 "${prd[gate]}"`);
		}
	}
}

/* ------------------------------------------------------------------ *
 * 工作区扫描
 * ------------------------------------------------------------------ */

/**
 * 每个 Gate 的批准来源留痕。
 *
 * 状态位本身只写 `approved`，**不区分是谁批的**——差异只在 journal 的 approve 记录里。
 * 于是有三种可能，必须分开显示，不能混为一谈：
 *   human      人在 Gate 上签的（正式开发的唯一合法值）
 *   ai-hosted  AI 托管的批准（验收 / 回归装置用；必须留痕，不得冒充人签）
 *   unrecorded frontmatter 已 approved，但 journal 里找不到批准记录 ⇒ 来源无从考证
 */
function gateHostOf(journal, gates) {
	const map = {};
	for (const g of GATES) map[g] = null;
	for (const a of journal?.approvals ?? []) {
		if (typeof a.gate === 'string' && Object.hasOwn(map, a.gate)) map[a.gate] = a.via ?? 'unrecorded';
	}
	for (const g of GATES) {
		if (map[g] === null && typeof gates?.[g] === 'string' && gates[g] !== '') map[g] = 'unrecorded';
	}
	return map;
}

/** 扫描工作区的流程状态；无流程目录时 { found:false }。 */
async function scanProcess(root) {
	const dir = join(root, PROCESS_REL);
	if (!(await exists(dir))) {
		return { found: false, root };
	}

	const [inputFiles, prdFiles, bugFiles] = await Promise.all([
		listFiles(join(dir, 'input')),
		listFiles(join(dir, 'prd')),
		listFiles(join(dir, 'bugs')),
	]);

	/** 核对件：input/<ID>-需求核对件*.md（模板 _ 开头跳过）。 */
	const checks = new Map();
	const rawInputs = [];
	/** 原料自带的 `id`：用于判断它是否已经归属某个已建包的核对件 / PRD（避免已建包还挂一条「原料未建核对件」幽灵行）。 */
	const rawInputIds = new Map();
	for (const file of inputFiles) {
		if (!file.endsWith('.md') || file.startsWith('_')) continue;
		const fm = await readFrontmatter(join(dir, 'input', file));
		if (fm !== null && fm.kind === 'requirement-check' && ID_PATTERN.test(fm.id ?? '')) {
			checks.set(fm.id, {
				file: `${PROCESS_REL}/input/${file}`,
				status: fm.status ?? 'unknown',
				gate0: fm.gate0 ?? 'pending',
				flow: fm.flow ?? 'full',
				uiDesign: fm.uiDesign ?? 'not-needed',
			});
		} else {
			rawInputs.push(file);
			if (fm !== null && typeof fm.id === 'string') rawInputIds.set(file, fm.id);
		}
	}

	/**
	 * PRD：**prd/<ID>.md 为准**（模板与杂项跳过）。
	 *
	 * 同 ID 的从件（`<ID>-design.md` / `<ID>-ui-spec.md` / 清单件…）**不得遮蔽主件**：
	 * 旧实现「先到先得」，而 `readdir` 的返回序未定义、`<ID>-` 在字典序上又排在 `<ID>.` 之前 ——
	 * 实测一个真实仓库里 `FEAT-001-design.md`（confirmed / gate2=pending）顶掉了 `FEAT-001.md`
	 * （done / gate2=approved），于是 `process_status` 与 `gate_summary` 全盘读错状态位。
	 * 现在先按文件名排序，再优先取 `<ID>.md`；只有找不到主件才退回从件，并如实告警。
	 */
	const candidates = new Map();
	/** `prd/<ID>-arch.md` 不是状态载体：它只作为主件包的 artifact 出现，不单独成包，也不顶替主件。 */
	const archOnly = new Map();
	for (const file of [...prdFiles].sort()) {
		if (!file.endsWith('.md') || file.startsWith('_')) continue;
		const fm = await readFrontmatter(join(dir, 'prd', file));
		if (fm === null || fm.id === undefined || !ID_PATTERN.test(fm.id)) continue;
		if (file.endsWith('-arch.md')) {
			archOnly.set(fm.id, file);
			continue;
		}
		const list = candidates.get(fm.id) ?? [];
		list.push({ file, fm });
		candidates.set(fm.id, list);
	}
	const prds = new Map();
	for (const [id, list] of candidates) {
		const main = `${id}.md`;
		const picked = list.find((c) => c.file === main) ?? list[0];
		prds.set(id, {
			file: `${PROCESS_REL}/prd/${picked.file}`,
			status: picked.fm.status ?? 'unknown',
			gate1: picked.fm.gate1 ?? 'pending',
			gate2: picked.fm.gate2 ?? 'pending',
			gate4: picked.fm.gate4 ?? 'pending',
			prdVersion: picked.fm.prdVersion,
			/** 主件缺失：状态位只能读从件，需如实告警（别让从件悄悄顶替）。 */
			mainMissing: picked.file !== main,
			otherFiles: list.filter((c) => c.file !== picked.file).map((c) => c.file),
		});
	}

	/** bugs：bugs/*.md（快速路径 bug 的 prd 可为 null）。 */
	const bugs = [];
	for (const file of bugFiles) {
		if (!file.endsWith('.md')) continue;
		const fm = await readFrontmatter(join(dir, 'bugs', file));
		if (fm === null || fm.id === undefined) continue;
		bugs.push({
			id: fm.id,
			file: `${PROCESS_REL}/bugs/${file}`,
			prd: fm.prd !== undefined && fm.prd !== 'null' ? fm.prd : null,
			status: fm.status ?? 'unknown',
			relatedCase: fm.relatedCase !== undefined && fm.relatedCase !== 'null' ? fm.relatedCase : null,
		});
	}

	/** 汇总成包视图。 */
	const ids = new Set([...checks.keys(), ...prds.keys()]);
	/** 只把「不属于任何已建包」的原料放进幽灵行；调研件 / 已建包的原料不再重复刷一条「未建核对件」。 */
	const orphanRawInputs = rawInputs.filter((f) => {
		const id = rawInputIds.get(f);
		return id === undefined || !ids.has(id);
	});
	const packages = [];
	const warnings = [];
	for (const id of ids) {
		const check = checks.get(id) ?? null;
		const prd = prds.get(id) ?? null;
		const journalPath = join(dir, 'prd', `${id}.journal.jsonl`);
		const artifacts = {
			researchBrief: (await exists(join(dir, 'input', `${id}-research-brief.md`))) ? `${PROCESS_REL}/input/${id}-research-brief.md` : null,
			priorArt: (await exists(join(dir, 'input', `${id}-prior-art.md`))) ? `${PROCESS_REL}/input/${id}-prior-art.md` : null,
			techScan: (await exists(join(dir, 'input', `${id}-tech-scan.md`))) ? `${PROCESS_REL}/input/${id}-tech-scan.md` : null,
			design: (await exists(join(dir, 'prd', `${id}-design.md`))) ? `${PROCESS_REL}/prd/${id}-design.md` : null,
			arch: (await exists(join(dir, 'prd', `${id}-arch.md`))) ? `${PROCESS_REL}/prd/${id}-arch.md` : null,
			uiSpec: (await exists(join(dir, 'prd', `${id}-ui-spec.md`))) ? `${PROCESS_REL}/prd/${id}-ui-spec.md` : null,
			contracts: (await exists(join(dir, 'contracts', `${id}.md`))) ? `${PROCESS_REL}/contracts/${id}.md` : null,
			rules: (await exists(join(dir, 'rules', `${id}.yaml`))) ? `${PROCESS_REL}/rules/${id}.yaml` : null,
			gaps: (await exists(join(dir, 'reports', 'gaps', `${id}.md`))) ? `${PROCESS_REL}/reports/gaps/${id}.md` : null,
		};
		let journal = null;
		if (await exists(journalPath)) {
			try {
				const text = await readFile(journalPath, 'utf8');
				const lines = text.split('\n').filter((l) => l.trim() !== '');
				let last = null;
				try {
					last = JSON.parse(lines[lines.length - 1]);
				} catch {
					/* 末行损坏按无尾部处理 */
				}
				const records = [];
				for (const line of lines) {
					try {
						records.push(JSON.parse(line));
					} catch {
						/* 坏行不计入证据，但行数与链式指纹仍会把它算出来 ⇒ 由完整性校验报红 */
					}
				}
				journal = {
					file: `${PROCESS_REL}/prd/${id}.journal.jsonl`,
					lines: lines.length,
					lastAt: typeof last?.at === 'string' ? last.at : null,
					lastActor: typeof last?.actor === 'string' ? last.actor : null,
					lastStep: typeof last?.step === 'string' ? last.step : null,
					integrity: await journalIntegrity(journalPath, lines),
					// 门禁执行记录：本 Gate「跑没跑、退出码多少」的唯一机器证据。
					runs: records
						.filter((r) => r?.action === 'run')
						.map((r) => ({
							at: typeof r.at === 'string' ? r.at : null,
							gate: typeof r.gate === 'string' ? r.gate : null,
							actor: typeof r.actor === 'string' ? r.actor : null,
							step: typeof r.step === 'string' ? r.step : null,
							command: typeof r.command === 'string' ? r.command : null,
							exitCode: typeof r.exitCode === 'number' ? r.exitCode : null,
							artifact: typeof r.artifact === 'string' ? r.artifact : null,
						})),
					// 批准记录与来源：via=human（人签）| ai-hosted（AI 托管，验收装置用）。
					approvals: records
						.filter((r) => r?.action === 'approve')
						.map((r) => ({
							at: typeof r.at === 'string' ? r.at : null,
							gate: typeof r.gate === 'string' ? r.gate : null,
							actor: typeof r.actor === 'string' ? r.actor : null,
							via: (r.via === 'human' || r.via === 'ai-hosted') ? r.via : null,
						})),
				};
			} catch {
				journal = {
					file: `${PROCESS_REL}/prd/${id}.journal.jsonl`,
					lines: -1,
					lastAt: null,
					lastActor: null,
					lastStep: null,
					integrity: { state: 'unverified', reason: 'journal 读取失败' },
				};
			}
		}
		const pkg = {
			id,
			status: prd?.status ?? (check ? `核对件:${check.status}` : 'unknown'),
			flow: check?.flow ?? null,
			uiDesign: check?.uiDesign ?? null,
			gates: {
				gate0: check?.gate0 ?? null,
				gate1: prd?.gate1 ?? null,
				gate2: prd?.gate2 ?? null,
				gate4: prd?.gate4 ?? null,
			},
			prdVersion: prd?.prdVersion ?? null,
			check,
			prd,
			artifacts,
			journal,
			openBugs: bugs.filter((b) => b.prd === id && b.status === 'open').map((b) => b.id),
		};
		consistencyWarnings(pkg, warnings);
		pkg.gateHost = gateHostOf(journal, pkg.gates);
		pkg.next = nextAction(pkg);
		pkg.statusClass = statusClass(prd?.status ?? 'unknown');
		packages.push(pkg);
	}
	if (orphanRawInputs.length > 0) {
		const researchCount = orphanRawInputs.filter((f) => /-(?:research-brief|prior-art|tech-scan)\.md$/.test(f)).length;
		packages.push({
			id: '(input 原料未建核对件)',
			status: 'intake',
			statusClass: 'normal',
			gates: { gate0: null, gate1: null, gate2: null, gate4: null },
			check: null,
			prd: null,
			artifacts: null,
			journal: null,
			openBugs: [],
			rawInputs: orphanRawInputs,
			next:
				researchCount > 0
					? {
							short: '继续/汇合调研',
							gate: 'Gate0',
							action: `input/ 有 ${orphanRawInputs.length} 份原料，其中 ${researchCount} 份为借鉴调研件：先确认两份研究件齐备且已汇合（architect 标注 C-NN / pm 反推需求），再折成核对件（已有核对件的补进 §4.1 / §5）；候选不得直接当裁定`,
					  }
					: { short: '起草核对件', gate: 'Gate0', action: `input/ 有 ${orphanRawInputs.length} 份原料未起草核对件` },
		});
	}

	for (const [id, file] of archOnly) {
		if (!ids.has(id)) {
			warnings.push(
				`prd/${file} 是架构设计与取舍件，但找不到同 ID 的主件 PRD / 核对件：不单独当需求包（先补主件）`,
			);
		}
	}

	const orphanBugs = bugs.filter((b) => b.status === 'open' && (b.prd === null || !ids.has(b.prd)));
	const doneCount = packages.filter((p) => p.prd?.status === 'done').length;
	/** 发布回归报告：评审三件套的触发权在人手上，「跑没跑」只能靠这个目录判断。 */
	const releaseReports = await listFiles(join(dir, 'reports', 'release'));

	packages.sort((a, b) => {
		const rank = (p) => (p.prd?.status === 'done' || p.prd?.status === 'terminated' ? 1 : 0);
		return rank(a) - rank(b) || a.id.localeCompare(b.id);
	});

	return {
		found: true,
		root,
		processDir: PROCESS_REL,
		generatedAt: new Date().toISOString(),
		packages,
		openBugCount: bugs.filter((b) => b.status === 'open').length,
		orphanBugs,
		warnings,
		doneCount,
		releasePending: doneCount > 0,
		releaseReports,
	};
}

/** 把快照渲染成模型可读的紧凑文本（唤醒第一眼）。 */
function renderStatus(snapshot) {
	if (!snapshot.found) {
		return `未找到流程目录（${PROCESS_REL}）：当前工作区尚未初始化流程，可先调用 process_init 落地骨架。`;
	}
	const lines = [];
	lines.push(`# 流程状态（${snapshot.generatedAt}）`);
	lines.push(`root: ${snapshot.root}`);
	for (const pkg of snapshot.packages) {
		const gates = GATES.map((g) => {
			const v = pkg.gates[g];
			if (v === null) return `${g}:—`;
			const host = pkg.gateHost?.[g];
			// 批准来源必须显式带出来：AI 托管的批准不得看起来像人签
			const mark = host === 'ai-hosted' ? '🤖AI托管' : host === 'unrecorded' ? '⚠无留痕' : '';
			return `${g}:${v}${mark}`;
		}).join(' ');
		lines.push('');
		lines.push(`## ${pkg.id}　[${pkg.status}]${pkg.prdVersion ? ` v${pkg.prdVersion}` : ''}${pkg.flow === 'fast' ? '　⚡快速路径' : ''}${pkg.uiDesign === 'required' ? '　🎨UI 设计' : ''}`);
		lines.push(`  ${gates}`);
		if (pkg.journal !== null) {
			lines.push(`  journal: ${pkg.journal.lines} 行，末条 ${pkg.journal.lastAt ?? '?'} ${pkg.journal.lastActor ?? ''} ${pkg.journal.lastStep ?? ''}`);
			const integ = pkg.journal.integrity;
			if (integ !== undefined) {
				if (integ.state === 'tampered') {
					lines.push(`  🚨 journal 完整性：**篡改嫌疑** —— ${integ.reason}`);
					lines.push(`     不得当正常 journal 用：先与 ${PROCESS_REL}/prd/<ID>.journal.jsonl.bak 比对，查清后再决定是否采信。`);
				} else if (integ.state === 'verified') {
					lines.push(`  ✓ journal 完整性：链式指纹一致（${integ.lines} 行）`);
				} else if (integ.state === 'legacy') {
					lines.push(`  ⚠ journal 完整性：${integ.reason}`);
				} else {
					lines.push(`  ⚠ journal 完整性：**未校验** —— ${integ.reason}`);
				}
			}
		}
		if (pkg.openBugs.length > 0) lines.push(`  open bugs: ${pkg.openBugs.join(', ')}`);
		if (pkg.rawInputs) lines.push(`  原料: ${pkg.rawInputs.join(', ')}`);
		const art = Object.entries(pkg.artifacts ?? {}).filter(([, v]) => v !== null).map(([k]) => k);
		if (art.length > 0) lines.push(`  产物: ${art.join(' / ')}`);
		lines.push(`  ▶ 下一步（${pkg.next.gate ?? '无停点'}）：${pkg.next.action}`);
	}
	if (snapshot.packages.length === 0) lines.push('\n（无在途包）');
	if (snapshot.orphanBugs.length > 0) {
		lines.push('');
		lines.push('## 未挂包的 open bugs');
		for (const b of snapshot.orphanBugs) lines.push(`  ${b.id} (${b.file})`);
	}
	if (snapshot.releasePending) {
		lines.push(`\n⚠ 有 ${snapshot.doneCount} 个包 done 待上线：上线前走发布前整体回归。`);
		const reports = snapshot.releaseReports ?? [];
		if (reports.length > 0) {
			lines.push(`  已有 ${reports.length} 份发布回归报告（${reports.join(', ')}）—— 评审三件套是否跑过以报告索引为准。`);
		} else {
			lines.push(
				`  ⚠ 未见 ${PROCESS_REL}/reports/release/** 报告：评审三件套（code / security / logic）**尚未执行**。`,
			);
			lines.push(
				'     它们只在发布回归跑（单包流程刻意不派）；未跑就是没有这层覆盖，不得当已覆盖。若要提前跑，在 Gate 摘要里点名。',
			);
		}
	}
	if (snapshot.warnings.length > 0) {
		lines.push('');
		lines.push('## 状态位不一致（如实报人，不自行修）');
		for (const w of snapshot.warnings) lines.push(`  ⚠ ${w}`);
	}
	return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * journal 安全追加（与仓库侧 journal-append.mjs 同语义）
 * ------------------------------------------------------------------ */

const LOCK_STALE_MS = 30_000;
const LOCK_DEADLINE_MS = 10_000;

const hash16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/**
 * journal 链式指纹：`chain_n = hash16(chain_{n-1} + line_n)`，`chain_0 = ''`。
 * 只存末行指纹只能发现「末行被改」；链头一变则**任意一行**被改写 / 删行 / 换行都会暴露。
 * 写入侧记、读取侧重算（`journalIntegrity`），两边必须用同一个式子。
 */
function journalChain(lines) {
	let chain = '';
	for (const line of lines) chain = hash16(`${chain}${line}`);
	return chain;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 读出全部非空行。 */
async function readEntries(file) {
	try {
		const text = await readFile(file, 'utf8');
		return text.split('\n').filter((l) => l.trim().length > 0);
	} catch {
		return [];
	}
}

/**
 * journal 完整性校验（**读取侧**）。
 *
 * 写入侧有锁 + 指纹 + 原子替换；但读取侧过去只数行数 —— 被截断或被改过的 journal 读起来
 * 与正常的一模一样，「防篡改」因此是**不可观察**的。这里把写入侧记下的指纹在读取时重算比对。
 *
 * 四种结论，**绝不把「无法校验」当绿**：
 *   verified   链式指纹一致
 *   legacy     meta 为旧格式（无 chainHash）：只验了行数与末行，中间行**不可验**
 *   tampered   行数 / 末行 / 链头任一不符 ⇒ 如实报红
 *   unverified 无 `.meta.json` 或 meta 损坏 ⇒ 无从校验
 */
async function journalIntegrity(journalPath, lines) {
	const metaFile = `${journalPath}.meta.json`;
	if (!(await exists(metaFile))) return { state: 'unverified', reason: '无 .meta.json 旁挂指纹，无从校验' };
	let meta;
	try {
		meta = JSON.parse(await readFile(metaFile, 'utf8'));
	} catch {
		return { state: 'unverified', reason: '.meta.json 损坏，无从校验' };
	}
	if (meta === null || typeof meta.lines !== 'number') return { state: 'unverified', reason: '.meta.json 缺 lines 字段，无从校验' };
	if (meta.lines !== lines.length) {
		return { state: 'tampered', reason: `行数不符：meta 记 ${meta.lines} 行、实读 ${lines.length} 行（疑截断或未登记的追加）` };
	}
	if (typeof meta.lastHash === 'string' && meta.lastHash !== hash16(lines[lines.length - 1] ?? '')) {
		return { state: 'tampered', reason: '末行指纹不符（末行被改写）' };
	}
	if (typeof meta.chainHash === 'string') {
		if (meta.chainHash !== journalChain(lines)) {
			return { state: 'tampered', reason: '链式指纹不符（中间某行被改写、删行或换行）' };
		}
		return { state: 'verified', lines: lines.length };
	}
	return { state: 'legacy', reason: 'meta 为旧格式（无 chainHash）：只验了行数与末行，中间行不可验' };
}

/** `wx` 独占建锁；陈旧锁（>30s）清掉重试；10 秒拿不到即明确失败。 */
async function acquireLock(lockPath) {
	const deadline = Date.now() + LOCK_DEADLINE_MS;
	for (;;) {
		try {
			await writeFile(lockPath, `${process.pid}\n${new Date().toISOString()}\n`, { flag: 'wx' });
			return;
		} catch (error) {
			if (error.code !== 'EEXIST') throw new Error(`建锁失败：${error.message}`);
			try {
				const info = await stat(lockPath);
				if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
					await unlink(lockPath);
					continue;
				}
			} catch {
				/* 锁刚被释放，直接重试 */
			}
			if (Date.now() > deadline) throw new Error('等待锁超时（另一进程正在写同一 journal）');
			await sleep(20);
		}
	}
}

/** 安全追加：指纹校验 → 临时文件 → 备份 → rename → 自校验 → 更新 meta。 */
async function journalAppend(root, id, record) {
	const abs = join(root, PROCESS_REL, 'prd', `${id}.journal.jsonl`);
	await mkdir(join(root, PROCESS_REL, 'prd'), { recursive: true });
	const lockPath = `${abs}.lock`;
	await acquireLock(lockPath);
	try {
		const metaPath = `${abs}.meta.json`;
		const backupPath = `${abs}.bak`;
		const before = await readEntries(abs);
		if (await exists(metaPath)) {
			let prior;
			try {
				prior = JSON.parse(await readFile(metaPath, 'utf8'));
			} catch {
				prior = null;
			}
			if (prior !== null && typeof prior.lines === 'number') {
				if (before.length < prior.lines) {
					throw new Error(`检测到历史被截断：写入前 ${before.length} 行 < 上次记录 ${prior.lines} 行，疑似并发覆盖，已拒绝写入。备份见 ${backupPath}`);
				}
				if (before.length > prior.lines && hash16(before[prior.lines - 1] ?? '') !== prior.lastHash) {
					throw new Error(`检测到既有内容被改写：第 ${prior.lines} 行与上次记录不符，已拒绝写入。备份见 ${backupPath}`);
				}
				// 链式指纹能盖住「中间某行被改」——只比末行是查不出来的。
				if (typeof prior.chainHash === 'string') {
					const priorChain = journalChain(before.slice(0, prior.lines));
					if (priorChain !== prior.chainHash) {
						throw new Error(`检测到既有内容被改写：前 ${prior.lines} 行的链式指纹与上次记录不符（中间行被改 / 删行 / 换行），已拒绝写入。备份见 ${backupPath}`);
					}
				}
			}
		}
		const line = JSON.stringify(record);
		const merged = [...before, line];
		const tmp = join(tmpdir(), `journal-${process.pid}-${Date.now()}.jsonl`);
		await writeFile(tmp, `${merged.join('\n')}\n`, 'utf8');
		if (await exists(abs)) await copyFile(abs, backupPath);
		await rename(tmp, abs);
		const after = await readEntries(abs);
		if (after.length !== merged.length) throw new Error(`自校验失败：预期 ${merged.length} 行、实际 ${after.length} 行`);
		JSON.parse(after[after.length - 1]);
		await writeFile(metaPath, `${JSON.stringify({ lines: after.length, lastHash: hash16(after[after.length - 1] ?? ''), chainHash: journalChain(after) }, null, 2)}\n`, 'utf8');
		return { file: `${PROCESS_REL}/prd/${id}.journal.jsonl`, linesBefore: before.length, linesAfter: after.length };
	} finally {
		await unlink(lockPath).catch(() => {});
	}
}

/* ------------------------------------------------------------------ *
 * 工具实现
 * ------------------------------------------------------------------ */

/** 工具的工作区根：调用方 agent 的会话 cwd；无 agent 时退环境变量。 */
function rootOf(exec) {
	const override = rootOverride();
	if (override !== undefined) return override;
	const cwd = exec?.agent?.session?.header?.cwd;
	if (typeof cwd === 'string' && cwd !== '') return cwd;
	return process.cwd();
}

/** 参数收窄：字符串。 */
function stringArg(args, key) {
	const value = args?.[key];
	return typeof value === 'string' ? value : undefined;
}

/** 共用快照。 */
async function snapshotFor(exec) {
	return scanProcess(rootOf(exec));
}

/** process_status：确定性状态机快照。 */
function statusTool() {
	return {
		name: 'process_status',
		description:
			'开发流程状态机快照：扫描 docs/process 的 input/prd/bugs frontmatter，返回每包 status/gate0/gate1/gate2/gate4/prdVersion、journal 尾部、open bugs、状态位不一致警告与下一步动作。唤醒/续跑时先调它，不靠聊天历史；未初始化流程的仓库会返回 not-found 并提示 process_init。',
		parameters: { type: 'object', properties: {}, additionalProperties: false },
		output: {
			schema: { type: 'object', additionalProperties: true },
			render: (_args, value) => [{ type: 'text', text: renderStatus(value) }],
		},
		isConcurrencySafe() {
			return true;
		},
		timeoutMs: 10_000,
		async execute(_args, exec) {
			return snapshotFor(exec);
		},
	};
}

/** gate_summary：两段式摘要骨架。 */
function summaryTool() {
	return {
		name: 'gate_summary',
		description:
			'渲染某需求包的 Gate 两段式交互摘要骨架：自动填【ID】抬头、gate 值、journal 尾部、产物路径与 open bugs；✅/❓ 内容段留占位由主控填。仅适用于已初始化 docs/process 的仓库。',
		parameters: {
			type: 'object',
			properties: {
				id: { type: 'string', description: '需求包 ID（frontmatter id，如 FEAT-001）' },
			},
			required: ['id'],
			additionalProperties: false,
		},
		output: {
			schema: { type: 'object', additionalProperties: true },
			render: (_args, value) => [{ type: 'text', text: value.skeleton }],
		},
		isConcurrencySafe() {
			return true;
		},
		timeoutMs: 10_000,
		async execute(args, exec) {
			const id = stringArg(args, 'id');
			if (id === undefined || !ID_PATTERN.test(id)) throw new Error('id 必填：需求包 ID（frontmatter id）');
			const snapshot = await snapshotFor(exec);
			if (!snapshot.found) throw new Error(renderStatus(snapshot));
			const pkg = snapshot.packages.find((p) => p.id === id);
			if (pkg === undefined) throw new Error(`包 ${id} 不在当前快照中（核对 input/ 或 prd/ 的 frontmatter id）`);
			const gates = GATES.filter((g) => pkg.gates[g] !== null).map((g) => `${g}=${pkg.gates[g]}`).join(' ');
			const lines = [];
			lines.push(`【${pkg.id}】${pkg.id}　${pkg.status} → ${pkg.next.short}　${pkg.next.gate ? `（${pkg.next.gate}）` : ''}`);
			lines.push('');
			lines.push('✅ 完成了什么');
			lines.push('1. <人话，1~3 条，每条 ≤ 40 字；据 journal 尾部与最近报告提炼>');
			lines.push('');
			lines.push('❓ 还需要裁定什么');
			lines.push('1. 若只答一条，请答这条：<最值得质疑的点>');
			lines.push('（没有待裁事项就写「无，可放行」）');
			lines.push('');
			// 本轮门禁证据：本 Gate「跑没跑、退出码多少」是唯一可核验的机器侧判据。
			// 没记录就明说没记录 —— 「没跑就是没跑」，不得当已覆盖（与发布回归报告同一口径）。
			const gk = typeof pkg.next.gate === 'string' ? pkg.next.gate.toLowerCase() : null;
			const runs = (pkg.journal?.runs ?? []).filter((r) => gk === null || r.gate === null || r.gate === gk);
			const integ0 = pkg.journal?.integrity;
			const integNote =
				integ0 === undefined
					? ''
					: integ0.state === 'verified'
						? '｜完整性 ✓链式一致'
						: integ0.state === 'tampered'
							? `｜完整性 🚨${integ0.reason}`
							: `｜完整性 ⚠${integ0.reason}`;
			const runCount = pkg.journal?.runs?.length ?? 0;
			const redCount = (pkg.journal?.runs ?? []).filter((r) => r.exitCode !== null && r.exitCode !== 0).length;
			lines.push(`🔒 本轮门禁证据（机器侧，供人抽查）${integNote}｜run ${runCount} 条（非零 ${redCount}）`);
			if (pkg.journal === null) {
				lines.push('  ⚠ 无 journal：连「跑没跑」都无从查起。**没记录 ≠ 已覆盖**。');
			} else if (runs.length === 0) {
				lines.push(`  未记录：${gk ?? '本 Gate'} 找不到任何门禁执行记录（journal 里没有 action=run + exitCode）。**没跑就是没跑**，不得当已覆盖。`);
			} else {
				for (const r of runs) {
					const code = r.exitCode === null ? '退出码未记录 ⚠' : r.exitCode === 0 ? 'exit 0 ✓' : `exit ${r.exitCode} 🚨非零`;
					const art = r.artifact !== null ? `｜${r.artifact}` : '';
					lines.push(`  - ${r.gate ?? 'gate 未标'}｜${r.command ?? '命令未记录'}｜${code}${art}（${r.at ?? '?'} ${r.actor ?? ''}）`);
				}
			}
			// 没走到停点时退回显示「最近一条批准」的来源 —— AI 托管这件事任何时候都不该被藏起来
			const lastApproval = (pkg.journal?.approvals ?? []).at(-1) ?? null;
			const hostNote = gk !== null ? pkg.gateHost?.[gk] : (lastApproval?.via ?? null);
			const hostGate = gk ?? lastApproval?.gate ?? null;
			if (hostNote === 'ai-hosted') {
				lines.push(`  🤖 ${hostGate ?? '最近'} 的批准是 **AI 托管**，不是人签 —— 正式开发不得如此，只许出现在验收 / 回归装置里。`);
			} else if (hostNote === 'unrecorded') {
				lines.push('  ⚠ 状态位已 approved，但 journal 里查不到对应的批准记录：批准来源无从考证。');
			}
			lines.push('');
			const facts = [`journal ${pkg.journal?.lines ?? 0} 行（末条 ${pkg.journal?.lastAt ?? '—'}）`];
			if (pkg.openBugs.length > 0) facts.push(`open bugs ${pkg.openBugs.length}：${pkg.openBugs.join(', ')}`);
			const art = Object.entries(pkg.artifacts ?? {}).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`);
			if (art.length > 0) facts.push(art.join('｜'));
			facts.push('本波 subagent 新建 <N> / 复用 <M>（主控补）');
			lines.push(`📎 依据（不进正文，需要时展开）：${gates}${pkg.prdVersion ? `｜prdVersion ${pkg.prdVersion}` : ''}｜${facts.join('｜')}`);
			lines.push('');
			lines.push(`▶ 下一步（${pkg.next.gate ?? '无停点'}）：${pkg.next.action}`);
			return { id: pkg.id, status: pkg.status, gates: pkg.gates, next: pkg.next, skeleton: lines.join('\n') };
		},
	};
}

/** process_journal：安全追加 journal（机器时间）。 */
function journalTool() {
	return {
		name: 'process_journal',
		description:
			'向 docs/process/prd/<ID>.journal.jsonl 安全追加一条 journal（锁 + 指纹校验 + 原子替换 + 自校验）。at 取机器时间自动填；actor 必填。禁手工读-改-写 journal。action=run 必须带 command 与 exitCode（门禁跑了没、退出码多少，是 Gate 上唯一可核验的机器证据）；action=approve 建议带 gate 与 via（via=human|ai-hosted，AI 托管的批准必须留痕，不得冒充人签）。',
		parameters: {
			type: 'object',
			properties: {
				id: { type: 'string', description: '需求包 ID（journal 文件名主体）' },
				actor: { type: 'string', description: '谁做的（如 orchestrator / subagent:test-agent）' },
				step: { type: 'string', description: '环节（pm/architect/test/dev/uat/review/archives…）' },
				action: { type: 'string', description: '动作（write/run/approve/…）' },
				phase: { type: 'string', description: '阶段（可选）' },
				note: { type: 'string', description: '一句话事实（可选）' },
				files: { type: 'array', items: { type: 'string' }, description: '涉及文件（可选）' },
				gate: { type: 'string', enum: ['gate0', 'gate1', 'gate2', 'gate4'], description: '本条归属哪个 Gate（run / approve 时用）' },
				command: { type: 'string', description: 'action=run 必填：实际跑的门禁命令（原样，别用被管道掩盖退出码的写法）' },
				cmd: { type: 'string', description: '已弃用别名，等同 command（总纲旧例写作 cmd）；新记录请用 command' },
				exitCode: { type: 'integer', description: 'action=run 必填：该命令的真实退出码（0=绿，非零=红即缺口，不得掩盖）' },
				artifact: { type: 'string', description: '可选：证据指针（产物路径 / 报告文件），供人抽查' },
				via: { type: 'string', enum: ['human', 'ai-hosted'], description: 'action=approve 时用：这个批准是人给的还是 AI 托管的。正式开发只许 human；ai-hosted 仅限验收 / 回归装置，且必须留痕' },
			},
			required: ['id', 'actor'],
			additionalProperties: false,
		},
		output: {
			schema: { type: 'object', additionalProperties: true },
			render: (_args, value) => [{ type: 'text', text: `journal OK：${value.linesBefore} -> ${value.linesAfter} 行（+1）${value.file}` }],
		},
		timeoutMs: 20_000,
		async execute(args, exec) {
			const id = stringArg(args, 'id');
			const actor = stringArg(args, 'actor');
			if (id === undefined || !ID_PATTERN.test(id)) throw new Error('id 必填：需求包 ID');
			if (actor === undefined || actor.trim() === '') throw new Error('actor 必填（journal 每行必须自带 actor）');
			const files = Array.isArray(args.files) ? args.files.filter((f) => typeof f === 'string') : undefined;
			const action = stringArg(args, 'action');
			const command = stringArg(args, 'command') ?? stringArg(args, 'cmd');
			const exitCode = typeof args.exitCode === 'number' && Number.isInteger(args.exitCode) ? args.exitCode : undefined;
			const via = stringArg(args, 'via');
			const gate = stringArg(args, 'gate');
			// 未声明的字段过去会被**静默丢弃**（实测：4 条门禁记录的 command/exitCode 就这么没了，
			// 于是「我记了」变成「其实没记」）。宁可在写入前红一次，也不要留一条残缺的证据。
			const KNOWN_ARGS = [
				'id', 'actor', 'step', 'action', 'phase', 'note', 'files',
				'gate', 'command', 'cmd', 'exitCode', 'artifact', 'via',
			];
			const unknownKeys = Object.keys(args).filter((k) => !KNOWN_ARGS.includes(k));
			if (unknownKeys.length > 0) {
				const hints = unknownKeys.map((k) => {
					const near = KNOWN_ARGS.find((n) => n.toLowerCase() === k.toLowerCase());
					return near === undefined ? `\`${k}\`` : `\`${k}\`（是不是想写 \`${near}\`？）`;
				});
				throw new Error(
					`不认识的字段：${hints.join('、')} —— 本工具只接受 ${KNOWN_ARGS.join(' / ')}。` +
						`未声明的字段会被静默丢弃，所以这里直接拒绝；要记别的事实请写进 note。`,
				);
			}
			// 门禁执行记录必须自带命令与退出码：没有退出码的「跑过了」正是总纲禁止的
			// 「用被掩盖的退出码作红绿判据」。不是门禁执行就别用 run（用 note / write）。
			if (action === 'run') {
				if (command === undefined) throw new Error('action=run 必须带 command（原样记录实际跑的命令）');
				if (exitCode === undefined) throw new Error('action=run 必须带 exitCode（整数退出码；0=绿、非零=红，不得掩盖）');
			}
			// 批准记录必须能回答「哪个 Gate」与「谁签的」：这两项缺失时，一条 approve 在事后
			// 等于什么都证明不了（存量仓库 9 条批准记录里 0 条有 gate / via，只能靠读自然语言）。
			if (action === 'approve') {
				if (gate === undefined) {
					throw new Error('action=approve 必须带 gate（gate0 / gate1 / gate2 / gate4）：批准记录必须能回答「哪个 Gate」');
				}
				if (!['gate0', 'gate1', 'gate2', 'gate4'].includes(gate)) {
					throw new Error(`gate 取值只许 gate0 / gate1 / gate2 / gate4（收到：${gate}）`);
				}
				if (via === undefined) {
					throw new Error('action=approve 必须带 via（human=人签；ai-hosted 仅限验收 / 回归装置）：批准记录必须能回答「谁签的」');
				}
			}
			if (gate !== undefined && action !== 'run' && action !== 'approve') {
				throw new Error('gate 只在 action=run / action=approve 时有意义（它标注这条记录归属哪个 Gate）');
			}
			if (via !== undefined && action !== 'approve') throw new Error('via 只在 action=approve 时有意义：它标注「这个批准是谁给的」');
			const record = {
				at: new Date().toISOString(),
				actor: actor.trim(),
				id,
				...(stringArg(args, 'step') !== undefined ? { step: stringArg(args, 'step') } : {}),
				...(action !== undefined ? { action } : {}),
				...(stringArg(args, 'phase') !== undefined ? { phase: stringArg(args, 'phase') } : {}),
				...(files !== undefined ? { files } : {}),
				...(stringArg(args, 'note') !== undefined ? { note: stringArg(args, 'note') } : {}),
				...(gate !== undefined ? { gate } : {}),
				...(command !== undefined ? { command } : {}),
				...(exitCode !== undefined ? { exitCode } : {}),
				...(stringArg(args, 'artifact') !== undefined ? { artifact: stringArg(args, 'artifact') } : {}),
				...(via !== undefined ? { via } : {}),
			};
			return journalAppend(rootOf(exec), id, record);
		},
	};
}

/**
 * 该目录项是否属于「可发布内容」。
 *
 * 编辑器/工具做原子写时会在源目录留下 `.foo.md.<pid>.<uuid>.tmpdir/foo.md.tmp`
 * 这类临时产物；它们是写入过程中的残影，**绝不能**被当作骨架复制进用户仓库。
 * 点开头的条目与 `.tmp` / `.tmpdir` 一律视为噪音，静默跳过（既不算新建也不算跳过）。
 */
function isShippableName(name) {
	return !name.startsWith('.') && !name.endsWith('.tmp') && !name.includes('.tmpdir');
}

/**
 * 递归复制 `src` 到 `dest`，**只创建不覆盖**：目标已存在即跳过并记入 skipped。
 * 返回相对目标根的 created / skipped 列表，便于工具回报。
 */
async function copyTree(src, dest, options) {
	const created = [];
	const skipped = [];
	const updated = [];
	const walk = async (from, to) => {
		const entries = await readdir(from, { withFileTypes: true });
		for (const entry of entries) {
			if (!isShippableName(entry.name)) continue;
			const source = join(from, entry.name);
			const target = join(to, entry.name);
			if (entry.isDirectory()) {
				await mkdir(target, { recursive: true });
				await walk(source, target);
				continue;
			}
			if (!entry.isFile()) continue;
			const rel = relative(dest, target);
			if (await exists(target)) {
				// 升级模式：白名单内的文件按包内版本覆盖，旧版先备份；内容相同则不动。
				if (typeof options.overwrite !== 'function' || !options.overwrite(rel)) {
					skipped.push(rel);
					continue;
				}
				if (Buffer.compare(await readFile(source), await readFile(target)) === 0) {
					skipped.push(rel);
					continue;
				}
				if (options.dryRun !== true) {
					await copyFile(target, `${target}.bak-${options.stamp}`);
					await copyFile(source, target);
				}
				updated.push(rel);
				continue;
			}
			if (options.dryRun !== true) {
				await mkdir(dirname(target), { recursive: true });
				await copyFile(source, target);
			}
			created.push(rel);
		}
	};
	if (!(await exists(src))) throw new Error(`包内资源缺失：${src}（安装可能不完整）`);
	await walk(src, dest);
	return { created, skipped, updated };
}

/** 文件 sha256，用于判断「init 落的文件后来有没有被人改过」。 */
async function sha256OfFile(path) {
	return createHash('sha256').update(await readFile(path)).digest('hex');
}

/** 包版本（只用于清单溯源，不参与状态机）。 */
async function packageVersion() {
	try {
		const pkg = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
		return typeof pkg.version === 'string' ? pkg.version : 'unknown';
	} catch {
		return 'unknown';
	}
}

/** 读 `docs/process/.process-kit.json`；没有 / 坏掉 / 版本不认识都返回 null（走保守卸载）。 */
async function readManifest(root) {
	try {
		const raw = JSON.parse(await readFile(join(root, MANIFEST_REL), 'utf8'));
		if (raw === null || typeof raw !== 'object' || raw.schema !== 1) return null;
		return raw;
	} catch {
		return null;
	}
}

/** 比较清单是否真的变了：`updatedAt` 每次都会变，不能拿它当「有变更」。 */
function manifestFingerprint(manifest) {
	const copy = { ...manifest };
	delete copy.updatedAt;
	return JSON.stringify(copy);
}

function toPosix(rel) {
	return rel.split('\\').join('/');
}

/** parent 是否等于 child 或 child 的祖先（用于拒绝把 docs/ 这种宽目录当脚本落点）。 */
function isAncestorOrSame(parent, child) {
	const rel = relative(parent, child);
	return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** 只在目录为空时删；非空 / 不存在都当没发生。 */
async function rmdirIfEmpty(dir) {
	try {
		if ((await readdir(dir)).length === 0) await rmdir(dir);
	} catch {
		// 目录不存在或没权限：都不影响主流程
	}
}

/** 删掉一个文件后，向上清理空目录（只清到 stop 为止，不碰父级里别的东西）。 */
async function pruneEmptyParents(file, stop) {
	let dir = dirname(file);
	while (dir.startsWith(stop) && dir !== stop) {
		const before = dir;
		await rmdirIfEmpty(dir);
		if (await exists(dir)) break;
		dir = dirname(before);
	}
}

/** 读 frontmatter 里的 `processVersion`；读不到返回 null。 */
async function processVersionOf(file) {
	try {
		const match = /^processVersion:\s*(\S+)\s*$/m.exec(await readFile(file, 'utf8'));
		return match === null ? null : match[1];
	} catch {
		return null;
	}
}

/** 从 AGENTS 模板里抽出「开发流程」一节，供已有 AGENTS.md 的仓库人工并入。 */
async function agentsFlowSnippet() {
	const text = await readFile(join(PACKAGE_ROOT, 'AGENTS.template.md'), 'utf8');
	const start = text.indexOf('## 开发流程');
	if (start < 0) return '';
	const end = text.indexOf('\n---', start);
	return (end < 0 ? text.slice(start) : text.slice(start, end)).trimEnd();
}

/** process_init：把骨架与脚本落地到目标仓库（只增不改）。 */
/**
 * 把工具参数里的相对目录收窄到仓库内。
 *
 * `join(root, scriptsDir)` 对 `scriptsDir="../../../../tmp/pwn"` 会**直接落到仓库外**
 * （绝对路径反而不会被 honor）。tool args 由模型生成，而模型可能被仓库里的不可信内容
 * 诱导 —— 所以这里不接受任何能越出 `root` 的相对路径，宁可报错也不静默落到别处。
 */
function confinedRelDir(root, raw, keyName) {
	const p = String(raw).trim().replace(/^\.\//, '').replace(/[/\\]+$/, '');
	if (p === '') throw new Error(`${keyName} 不能为空`);
	if (isAbsolute(p)) throw new Error(`${keyName} 必须是相对路径，收到绝对路径：${raw}`);
	const abs = resolve(root, p);
	const rel = relative(root, abs);
	if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
		throw new Error(`${keyName} 不能越出工作区（收到 ${raw}）`);
	}
	return rel.split('\\').join('/');
}

function initTool() {
	return {
		name: 'process_init',
		description:
			'把流程骨架初始化到当前工作区：包内 scaffold/** → <仓库>/docs/process/**，脚本 → <仓库>/scripts/process/*.mjs，并在 AGENTS.md 缺失时按模板建一份项目级常驻指针（存在则跳过并给出待并入的段落）。默认**只创建不覆盖**（已存在的文件跳过并列出）；upgrade=true 时改为**升级已初始化的仓库**：框架自有文件（总纲 / 调度手册 / 模板 / 门禁脚本）按包内版本覆盖并**先备份为 <文件>.bak-<时间戳>**，项目可定制文件（PROJECT.md / ui/tokens.md / ui/recipe.md）永不覆盖、只报告差异供人合并。可选 skills=true 额外把 9 个通用角色技能落到 <仓库>/.dsh/skills/** 以便就地定制（不改则用插件自带版本）。同时写 `docs/process/.process-kit.json` 卸载清单，记录 init 真正创建的文件与哈希，供 `process_uninstall` 精确清理（不误删用户已有文件）。',
		parameters: {
			type: 'object',
			properties: {
				scriptsDir: { type: 'string', description: '脚本落点，默认 scripts/process；必须是专用子目录，不能是 docs/process 或其父目录' },
				skills: { type: 'boolean', description: '是否同时落地角色技能到 .dsh/skills/（默认 false）' },
				agents: { type: 'boolean', description: '是否保证项目级常驻指针 AGENTS.md 存在（默认 true；只在缺失时创建，绝不改写已有文件）' },
				dryRun: { type: 'boolean', description: '只列出将要创建 / 更新的文件，不写盘' },
				upgrade: { type: 'boolean', description: '升级模式：覆盖框架自有文件（先备份），项目可定制文件只报告不覆盖（默认 false）' },
			},
			additionalProperties: false,
		},
		output: {
			schema: { type: 'object', additionalProperties: true },
			render: (_args, value) => [{ type: 'text', text: value.report }],
		},
		timeoutMs: 20_000,
		async execute(args, exec) {
			const root = rootOf(exec);
			const scriptsDir = confinedRelDir(root, stringArg(args, 'scriptsDir') ?? 'scripts/process', 'scriptsDir');
			if (isAncestorOrSame(join(root, scriptsDir), join(root, PROCESS_REL))) {
				throw new Error('scriptsDir 不能是 docs/process 或其父目录：脚本会混进流程产物，卸载时也可能误删别的文档；请用专用子目录（如 scripts/process、tools/process）');
			}
			if (!scriptsDir.includes('/') && BROAD_SCRIPTS_DIRS.has(scriptsDir)) {
				throw new Error(`scriptsDir 不能是顶层宽目录 ${scriptsDir}：卸载会整目录删，容易带走项目自己的文件；请用专用子目录（如 scripts/process）`);
			}
			const withSkills = args?.skills === true;
			const agents = args?.agents !== false;
			const dryRun = args?.dryRun === true;
			const upgrade = args?.upgrade === true;
			const stamp = `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`;
			const processDir = join(root, PROCESS_REL);
			const existingManifest = await readManifest(root);
			const created = [];
			const skipped = [];
			const updated = [];
			const manual = [];

			const scaffold = await copyTree(join(PACKAGE_ROOT, 'scaffold'), processDir, {
				dryRun,
				stamp,
				overwrite: upgrade ? (rel) => UPGRADE_OVERWRITE.has(rel) : undefined,
			});
			created.push(...scaffold.created.map((f) => `${PROCESS_REL}/${f}`));
			skipped.push(...scaffold.skipped.map((f) => `${PROCESS_REL}/${f}`));
			updated.push(...scaffold.updated.map((f) => `${PROCESS_REL}/${f}`));

			const scripts = await copyTree(join(PACKAGE_ROOT, 'scripts'), join(root, scriptsDir), {
				dryRun,
				stamp,
				overwrite: upgrade ? (rel) => rel.endsWith('.mjs') : undefined,
			});
			created.push(...scripts.created.map((f) => `${scriptsDir}/${f}`));
			skipped.push(...scripts.skipped.map((f) => `${scriptsDir}/${f}`));
			updated.push(...scripts.updated.map((f) => `${scriptsDir}/${f}`));

			// 项目可定制文件：只报告差异，永不覆盖。
			if (upgrade) {
				for (const rel of UPGRADE_MANUAL) {
					const source = join(PACKAGE_ROOT, 'scaffold', rel);
					const target = join(processDir, rel);
					if (!(await exists(source)) || !(await exists(target))) continue;
					if (Buffer.compare(await readFile(source), await readFile(target)) !== 0) manual.push(`${PROCESS_REL}/${rel}`);
				}
			}

			let skillsCreated = [];
			if (withSkills) {
				const skills = await copyTree(join(PACKAGE_ROOT, 'skills'), join(root, '.dsh', 'skills'), { dryRun });
				skillsCreated = skills.created;
				created.push(...skills.created.map((f) => `.dsh/skills/${f}`));
				skipped.push(...skills.skipped.map((f) => `.dsh/skills/${f}`));
			}

			// 项目级常驻指针。插件自己只能提供**框架级** systemPrompt 段；「本项目流程真源
			// 在哪」必须留在仓库里（随仓库版本化、团队共享）。AGENTS.md 缺失时按模板建一份，
			// 已存在则**绝不改写**，只把该并入的段落打印出来。
			let agentsSnippet = '';
			const hasAgents = await exists(join(root, 'AGENTS.md'));
			if (agents) {
				if (hasAgents) {
					agentsSnippet = await agentsFlowSnippet();
					skipped.push('AGENTS.md（已存在，未改动）');
				} else {
					if (!dryRun) {
						await writeFile(join(root, 'AGENTS.md'), await readFile(join(PACKAGE_ROOT, 'AGENTS.template.md'), 'utf8'));
					}
					created.push('AGENTS.md');
				}
			}

			// 卸载清单：记录 init 真正创建的东西（尤其是 AGENTS.md 与 .dsh/skills 副本）。
			// 只记「创建时」的哈希，Uninstall 才能判断后来有没有被人改过；不记哈希就只能靠猜。
			const now = new Date().toISOString();
			const existingSkillFiles = existingManifest?.skills?.createdFiles;
			const createdSkillFiles = existingSkillFiles !== null && typeof existingSkillFiles === 'object' && !Array.isArray(existingSkillFiles) ? { ...existingSkillFiles } : {};
			for (const rel of skillsCreated) {
				const target = join(root, '.dsh', 'skills', rel);
				const source = join(PACKAGE_ROOT, 'skills', rel);
				const hashSource = (await exists(target)) ? target : source;
				createdSkillFiles[toPosix(rel)] = await sha256OfFile(hashSource);
			}
			let agentsRecord = existingManifest?.agents ?? null;
			if (agents && !hasAgents) {
				// dry-run 时 AGENTS.md 还没落盘，按将要写入的模板算哈希。
				const hashSource = dryRun ? join(PACKAGE_ROOT, 'AGENTS.template.md') : join(root, 'AGENTS.md');
				agentsRecord = { path: 'AGENTS.md', created: true, sha256: await sha256OfFile(hashSource) };
			} else if (hasAgents && agentsRecord === null) {
				agentsRecord = { path: 'AGENTS.md', created: false };
			}
			const manifest = {
				schema: 1,
				package: 'dsh-process-kit',
				version: await packageVersion(),
				installedAt: existingManifest?.installedAt ?? now,
				updatedAt: now,
				processDir: PROCESS_REL,
				scriptsDir,
				agents: agentsRecord,
				skills: Object.keys(createdSkillFiles).length > 0 ? { dir: '.dsh/skills', createdFiles: createdSkillFiles } : (existingManifest?.skills ?? null),
			};
			const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
			const manifestChanged = existingManifest === null || manifestFingerprint(existingManifest) !== manifestFingerprint(manifest);
			if (manifestChanged && !dryRun) {
				await writeFile(join(processDir, MANIFEST_NAME), manifestText, 'utf8');
			}

			const lines = [];
			lines.push(dryRun ? `# process_init（dry-run，未写盘）` : `# process_init 完成`);
			lines.push(`root: ${root}`);
			if (manifestChanged) lines.push(`卸载清单：${MANIFEST_REL}${dryRun ? '（dry-run 未写盘）' : '（已写入）'}`);
			lines.push('');
			lines.push(created.length > 0 ? `新建（${created.length}）：` : '新建（0）：');
			for (const f of created) lines.push(`  + ${f}`);
			if (updated.length > 0) {
				lines.push('');
				lines.push(`${dryRun ? '将更新' : '已更新'}（${updated.length}）：`);
				for (const f of updated) lines.push(dryRun ? `  ~ ${f}` : `  ~ ${f}（旧版备份 ${f}.bak-${stamp}）`);
			}
			if (skipped.length > 0) {
				lines.push('');
				lines.push(`已存在、跳过（${skipped.length}）：`);
				for (const f of skipped) lines.push(`  = ${f}`);
			}
			if (manual.length > 0) {
				lines.push('');
				lines.push(`需人工比对（${manual.length}，项目可定制，升级不覆盖）：`);
				for (const f of manual) lines.push(`  ? ${f}`);
				lines.push(`  对照包内模板：${join(PACKAGE_ROOT, 'scaffold')}/<同名文件>（直接 diff 即可）`);
			}
			if (upgrade) {
				const mine = await processVersionOf(join(processDir, 'PROJECT.md'));
				const theirs = await processVersionOf(join(PACKAGE_ROOT, 'scaffold', 'PROJECT.md'));
				if (mine !== null && theirs !== null && mine !== theirs) {
					lines.push('');
					lines.push(`⚠ ${PROCESS_REL}/PROJECT.md 的 processVersion 是 ${mine}，包内模板是 ${theirs} —— 该文件永不自动覆盖，请对照包内模板手工合并。`);
				}
			}
			lines.push('');
			if (upgrade) {
				lines.push('下一步：');
				if (manual.length > 0) {
					lines.push(`1. 手工合并「需人工比对」的文件（尤其 ${PROCESS_REL}/PROJECT.md）：对照包内模板逐段并入，不要整份覆盖。`);
					lines.push(`2. 核对备份 \`<文件>.bak-${stamp}\`${dryRun ? '（dry-run 未写盘，落地后才产生）' : ''}，确认升级无误后再删。`);
				} else {
					lines.push('1. 无需人工合并：项目可定制文件与包内模板一致。');
					if (updated.length > 0) lines.push(`2. 核对备份 \`<文件>.bak-${stamp}\`${dryRun ? '（dry-run 未写盘，落地后才产生）' : ''}，确认升级无误后再删。`);
				}
			} else {
				if (updated.length === 0 && skipped.some((f) => f.startsWith(PROCESS_REL) || f.startsWith(scriptsDir))) {
					lines.push('提示：本仓库已初始化过（框架文件已存在）。要升级到包内版本，跑 `process_init({ upgrade: true, dryRun: true })` 先预览，再去掉 dryRun 落地。');
					lines.push('');
				}
				lines.push('下一步：');
				lines.push(
					`1. 编辑 ${PROCESS_REL}/PROJECT.md —— **最小可用只填三节**：§1 端与目录、§2 命令槽（至少「快速验证」与「journal 追加」两行）、§3 产物属主表。§4 的每个键都有默认值，可先用着；§5 / §6 等到要跑 UAT 再填；§7 整节写「不适用」。`,
				);
				lines.push(
					`   注：§3 不填会让落点门禁直接 exit 1（刻意不静默放行），不是"以后再配也行"的那类可选项。`,
				);
				lines.push(
					`2. **第一个包建议走快速路径试水**：在需求核对件写 \`flow: fast\`，人签 Gate0 后直接派 dev + 存量回归 —— 先确认这套流程在你的项目里顺手，再上全流程（PRD + 契约 + 四道 Gate）。`,
				);
				lines.push(
					`   注：快速路径同样要核对件与 Gate0（没有绕过核对件的免流程路径）；触及 schema / RBAC / 金额 / 对外接口必须退回全流程。`,
				);
				lines.push(`3. 在 package.json 加脚本（示例）："process:journal": "node ${scriptsDir}/journal-append.mjs"、"check:rules": "node ${scriptsDir}/check-rules.mjs"、"check:artifact-paths": "node ${scriptsDir}/check-artifact-paths.mjs"、"check:ui-geometry": "node ${scriptsDir}/check-ui-geometry.mjs"。`);
				lines.push('4. 角色技能已由插件自带（rank 600，项目 .dsh/skills 可覆盖）；需要就地改就再跑一次 process_init 并带 skills=true。');
			}
			if (agents) {
				lines.push('');
				if (hasAgents) {
					lines.push('⚠ AGENTS.md 已存在，未改动。请把下面这段并入其流程一节（或确认已有等价内容）——');
					lines.push('  它才是「每轮上下文都在场」的项目级指针，插件只提供框架级提示，替不了它：');
					lines.push('');
					lines.push(agentsSnippet);
				} else {
					lines.push('已按模板新建 AGENTS.md（项目级常驻指针）：其中的「开发流程」节指向 docs/process，');
					lines.push('「项目概览 / 快速命令 / 目录结构」三节留有占位符，请填。');
				}
			}
			return {
				created,
				skipped,
				updated,
				manual,
				upgrade,
				dryRun,
				manifest: MANIFEST_REL,
				manifestChanged,
				report: lines.join('\n'),
			};
		},
	};
}

/** 递归列文件（仓库相对技能目录的 posix 路径），用于报告「清单之外还剩什么」。 */
async function listFilesUnder(dir) {
	const out = [];
	const walk = async (from) => {
		let entries;
		try {
			entries = await readdir(from, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const abs = join(from, entry.name);
			if (entry.isDirectory()) await walk(abs);
			else if (entry.isFile()) out.push(toPosix(relative(dir, abs)));
		}
	};
	await walk(dir);
	return out;
}

/** 递归数文件，用于卸载报告（不列全表，避免刷屏）。 */
async function countFilesUnder(dir) {
	let count = 0;
	const walk = async (from) => {
		let entries;
		try {
			entries = await readdir(from, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) await walk(join(from, entry.name));
			else if (entry.isFile()) count += 1;
		}
	};
	await walk(dir);
	return count;
}

/**
 * 旧安装没有技能清单时：只认「与包内 SKILL.md 逐字一致」的副本（没有用户内容，
 * 删掉不损失定制）；版本不同 / 被改过的一律保留。只扫包内已知的 9 个角色，不猜。
 */
async function legacySkillMatches(skillsBase) {
	const matches = [];
	const different = [];
	const roles = await listDirs(join(PACKAGE_ROOT, 'skills'));
	for (const role of roles) {
		if (!isShippableName(role)) continue;
		const rel = `${role}/SKILL.md`;
		const target = join(skillsBase, rel);
		if (!(await exists(target))) continue;
		const source = join(PACKAGE_ROOT, 'skills', rel);
		if ((await sha256OfFile(target)) === (await sha256OfFile(source))) matches.push({ rel, abs: target });
		else different.push(rel);
	}
	return { matches, different };
}

/**
 * 旧安装没有清单时：只有「与插件模板逐字一致」的 AGENTS.md 才敢认作 init 创建。
 * 比较前去掉「卸载提示」那一段，这样 0.6.0 生成、尚未带该段的老文件也能认出来。
 * 用户填过占位符 / 加过内容就不再相等，仍按用户文件保留。
 */
async function isExactAgentsTemplate(file) {
	try {
		const stripUninstall = (text) => text.replace(/\n\*\*不想继续用流程\*\*[^\n]*\n/g, '\n');
		const current = await readFile(file, 'utf8');
		const template = await readFile(join(PACKAGE_ROOT, 'AGENTS.template.md'), 'utf8');
		return stripUninstall(current) === stripUninstall(template);
	} catch {
		return false;
	}
}

/** package.json 里仍指向待删脚本的命令（只报告，不替人改 package.json）。 */
async function processScriptKeys(root, scriptsRel) {
	try {
		const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
		if (pkg === null || typeof pkg !== 'object' || typeof pkg.scripts !== 'object' || pkg.scripts === null) return [];
		const needle = `${toPosix(scriptsRel)}/`;
		return Object.entries(pkg.scripts)
			.filter(([, value]) => typeof value === 'string' && value.includes(needle))
			.map(([key]) => key);
	} catch {
		return [];
	}
}

/**
 * process_uninstall：只清「插件落进本仓库的流程内容」。
 *
 * 安全边界：
 * - 默认 dryRun，必须由人明确确认后 `confirm:true, dryRun:false` 才删；
 * - `docs/process/**` 与 `scripts/process/**` 整个目录是流程载体，确认后删；
 * - `AGENTS.md` 与 `.dsh/skills` 只删清单里证明是 init 创建、且未被改过的；
 * - 默认先把要删的东西备份到系统临时目录；备份失败就不删；
 * - 产品源码、测试、git 历史不在清理范围。
 */
function uninstallTool() {
	return {
		name: 'process_uninstall',
		description:
			'卸载本插件落在当前仓库的流程内容：删除 docs/process/** 与 scripts/process/**（或 init 时自定义的 scriptsDir），并删除 process_init 创建且未被修改过（或与插件模板逐字一致）的 AGENTS.md / .dsh/skills/<角色>/SKILL.md。默认 dryRun=true，只报告不删除；必须由人明确确认后传 confirm:true 且 dryRun:false 才执行。默认先备份到系统临时目录（backup=false 可关）；修改过的生成文件默认保留，force=true 才删（只对 init 创建的文件生效，绝不删含自定义内容的用户文件）。不改产品源码/测试，不删 git 历史，不改 package.json（只会报告仍指向已删脚本的命令）。',
		parameters: {
			type: 'object',
			properties: {
				dryRun: { type: 'boolean', description: '默认 true：只列出将删除 / 保留的内容，不写盘。确认后传 false' },
				confirm: { type: 'boolean', description: '必须由人明确同意；不传或 false 时拒绝真正删除' },
				force: { type: 'boolean', description: '删除 init 创建但后来被修改过的 AGENTS.md / 技能副本（不作用于用户已有文件）' },
				backup: { type: 'boolean', description: '删除前备份到系统临时目录（默认 true；备份失败则不删）' },
			},
			additionalProperties: false,
		},
		output: {
			schema: { type: 'object', additionalProperties: true },
			render: (_args, value) => [{ type: 'text', text: value.report }],
		},
		timeoutMs: 60_000,
		async execute(args, exec) {
			const root = rootOf(exec);
			const dryRun = args?.dryRun !== false;
			const confirm = args?.confirm === true;
			const force = args?.force === true;
			const backup = args?.backup !== false;
			const manifest = await readManifest(root);
			let scriptsRel = DEFAULT_SCRIPTS_REL;
			if (manifest?.scriptsDir !== undefined) {
				if (typeof manifest.scriptsDir !== 'string') throw new Error('卸载清单里的 scriptsDir 不是字符串：拒绝按它删任何目录');
				scriptsRel = confinedRelDir(root, manifest.scriptsDir, 'scriptsDir（清单记录）');
			}
			const processDir = join(root, PROCESS_REL);
			const scriptsDir = join(root, scriptsRel);
			const agentsPath = join(root, 'AGENTS.md');
			const skillsBase = join(root, '.dsh', 'skills');
			const dirs = [];
			const removed = [];
			const preserved = [];
			const notes = [];
			const skillDeletes = [];

			if (await exists(processDir)) dirs.push({ rel: PROCESS_REL, abs: processDir });
			const scriptsIsAncestor = isAncestorOrSame(scriptsDir, processDir);
			const scriptsIsBroad = !scriptsRel.includes('/') && BROAD_SCRIPTS_DIRS.has(scriptsRel);
			if (scriptsRel !== PROCESS_REL && (scriptsIsAncestor || scriptsIsBroad)) {
				notes.push(`卸载清单里的 scriptsDir（${scriptsRel}）是宽目录 / docs/process 的父目录：为免误删别的文件，未按目录删除；请人工确认后再处理`);
			} else if (scriptsRel !== PROCESS_REL && (await exists(scriptsDir))) {
				dirs.push({ rel: scriptsRel, abs: scriptsDir });
			}

			let agentsDelete = false;
			if (await exists(agentsPath)) {
				const record = manifest?.agents;
				const exactTemplate = await isExactAgentsTemplate(agentsPath);
				if (record?.created === true) {
					const current = await sha256OfFile(agentsPath);
					if (current === record.sha256 || exactTemplate || force) agentsDelete = true;
					else preserved.push('AGENTS.md（init 创建但已修改；确认不再需要可 force:true）');
				} else if (exactTemplate) {
					// 老安装没有清单，或清单只记了「本来就有」：逐字模板 = 没有用户内容，可安全删。
					agentsDelete = true;
				} else if (record?.created === false) {
					preserved.push('AGENTS.md（不是 process_init 创建，保留）');
				} else if (manifest === null) {
					preserved.push('AGENTS.md（无卸载清单，无法证明是 init 创建，保留；确认要删请手工处理）');
				} else {
					preserved.push('AGENTS.md（清单未记录为 init 创建，保留）');
				}
			}

			const createdFiles = manifest?.skills?.createdFiles;
			if (createdFiles !== null && typeof createdFiles === 'object' && !Array.isArray(createdFiles)) {
				const recorded = new Set(Object.keys(createdFiles).map(toPosix));
				for (const [rel, hash] of Object.entries(createdFiles)) {
					if (typeof rel !== 'string' || typeof hash !== 'string') continue;
					const abs = resolve(skillsBase, rel);
					const relToBase = relative(skillsBase, abs);
					if (relToBase === '' || relToBase.startsWith('..') || isAbsolute(relToBase)) {
						notes.push(`卸载清单里的技能路径越界，已跳过：${rel}`);
						continue;
					}
					if (!(await exists(abs))) continue;
					const current = await sha256OfFile(abs);
					if (current === hash || force) skillDeletes.push({ rel, abs });
					else preserved.push(`.dsh/skills/${rel}（init 创建但已修改；确认不再需要可 force:true）`);
				}
				const unknown = (await listFilesUnder(skillsBase)).filter((rel) => !recorded.has(rel));
				if (unknown.length > 0) {
					notes.push(`.dsh/skills 下 ${unknown.length} 个文件不在卸载清单中，保留：${unknown.join(', ')}`);
				}
			} else if (await exists(skillsBase)) {
				const legacy = await legacySkillMatches(skillsBase);
				skillDeletes.push(...legacy.matches);
				if (legacy.matches.length > 0) {
					notes.push(`旧安装没有技能清单：按与插件版本逐字一致清理 ${legacy.matches.length} 个技能副本`);
				}
				if (legacy.different.length > 0) {
					notes.push(`保留 ${legacy.different.length} 个与插件版本不同（可能已定制）的技能副本：${legacy.different.join(', ')}`);
					for (const rel of legacy.different) preserved.push(`.dsh/skills/${rel}（与包内版本不同，保留；确认不要可手工删）`);
				}
				const known = new Set([...legacy.matches, ...legacy.different.map((rel) => ({ rel }))].map((item) => toPosix(item.rel)));
				const unknown = (await listFilesUnder(skillsBase)).filter((rel) => !known.has(rel));
				if (unknown.length > 0) {
					notes.push(`.dsh/skills 下 ${unknown.length} 个文件不在已知角色模板中，保留：${unknown.join(', ')}`);
				}
				if (legacy.matches.length === 0 && legacy.different.length === 0 && unknown.length === 0) {
					notes.push('.dsh/skills 下没有可识别的插件技能副本，未改动');
				}
			}

			const dirDescriptions = [];
			for (const d of dirs) dirDescriptions.push(`${d.rel}/**（${await countFilesUnder(d.abs)} 个文件）`);
			const targetCount = dirs.length + (agentsDelete ? 1 : 0) + skillDeletes.length;
			const scriptKeys = await processScriptKeys(root, scriptsRel);

			const lines = [];
			lines.push(dryRun ? '# process_uninstall（dry-run，未删除）' : '# process_uninstall 完成');
			lines.push(`root: ${root}`);
			lines.push(manifest === null ? '卸载清单：无（旧安装；按目录 + 模板识别，保守处理）' : `卸载清单：${MANIFEST_REL}（v${manifest.version ?? '?'}）`);
			lines.push('');
			if (dirDescriptions.length > 0) {
				lines.push(dryRun ? '将删除目录：' : '已删除目录：');
				for (const d of dirDescriptions) lines.push(`  - ${d}`);
			}
			if (agentsDelete) lines.push(`${dryRun ? '将删除' : '已删除'}：AGENTS.md（init 创建）`);
			if (skillDeletes.length > 0) {
				lines.push(dryRun ? '将删除技能副本：' : '已删除技能副本：');
				for (const s of skillDeletes) lines.push(`  - .dsh/skills/${s.rel}`);
			}
			if (targetCount === 0) lines.push('未发现可清理的插件流程内容。');
			if (preserved.length > 0) {
				lines.push('');
				lines.push('保留（需人工确认）：');
				for (const p of preserved) lines.push(`  = ${p}`);
			}
			if (notes.length > 0) {
				lines.push('');
				for (const n of notes) lines.push(`  ⚠ ${n}`);
			}
			if (scriptKeys.length > 0) {
				lines.push('');
				lines.push(`package.json 仍有 ${scriptKeys.length} 条指向 ${scriptsRel}/ 的命令（本工具不改 package.json，请手工删）：`);
				lines.push(`  ${scriptKeys.join(' / ')}`);
			}
			lines.push('');
			lines.push('不包含：产品源码 / 测试 / git 历史；删除是工作区改动，需要你自己提交。');
			if (targetCount === 0) {
				return { dryRun, manifest: MANIFEST_REL, removed, preserved, backupDir: null, report: lines.join('\n') };
			}
			if (dryRun) {
				lines.push('');
				lines.push('下一步：由人明确确认后跑 process_uninstall({ confirm: true, dryRun: false })；默认先备份到系统临时目录。');
				return { dryRun, manifest: MANIFEST_REL, removed, preserved, backupDir: null, report: lines.join('\n') };
			}
			if (!confirm) throw new Error('未确认卸载：请先 dryRun 预览，由人明确同意后再传 confirm:true、dryRun:false。');

			let backupDir = null;
			if (backup) {
				const stamp = `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`;
				const suffix = Math.random().toString(36).slice(2, 8);
				backupDir = join(tmpdir(), `dsh-process-kit-uninstall-${stamp}-${suffix}`);
				await mkdir(backupDir, { recursive: true });
				for (const d of dirs) {
					const dest = join(backupDir, d.rel);
					await mkdir(dirname(dest), { recursive: true });
					await cp(d.abs, dest, { recursive: true });
				}
				if (agentsDelete) await cp(agentsPath, join(backupDir, 'AGENTS.md'));
				for (const s of skillDeletes) {
					const dest = join(backupDir, '.dsh', 'skills', s.rel);
					await mkdir(dirname(dest), { recursive: true });
					await cp(s.abs, dest);
				}
				lines.push('');
				lines.push(`备份：${backupDir}（系统临时目录；确认无误后可删）`);
			} else {
				lines.push('');
				lines.push('备份：未做（backup=false）；删除后不可从本工具恢复。');
			}

			for (const d of dirs) {
				await rm(d.abs, { recursive: true, force: true });
				removed.push(`${d.rel}/**`);
			}
			if (agentsDelete) {
				await rm(agentsPath, { force: true });
				removed.push('AGENTS.md');
			}
			for (const s of skillDeletes) {
				await rm(s.abs, { force: true });
				removed.push(`.dsh/skills/${s.rel}`);
				await pruneEmptyParents(s.abs, skillsBase);
			}
			await rmdirIfEmpty(skillsBase);
			await rmdirIfEmpty(join(root, '.dsh'));
			// 只删空目录：docs / scripts 里还有别的东西就保留（不越界清项目文件）。
			await rmdirIfEmpty(join(root, 'docs'));
			await rmdirIfEmpty(join(root, 'scripts'));

			lines.push('');
			lines.push(`已清理 ${removed.length} 项。`);
			lines.push('下一步：提交这次删除；如不再使用插件，先从 DSH 插件列表卸载（`npm uninstall` / 插件管理器）。');
			return { dryRun, manifest: MANIFEST_REL, removed, preserved, backupDir, report: lines.join('\n') };
		},
	};
}

/* ------------------------------------------------------------------ *
 * 角色技能（打包 provider，rank 600）
 * ------------------------------------------------------------------ */

/** 读取包内全部角色技能目录，返回目录名列表（按名字排序保证稳定）。 */
async function skillDirs() {
	const dirs = await listDirs(join(PACKAGE_ROOT, 'skills'));
	return dirs.filter(isShippableName).sort();
}

/**
 * 是否广播打包角色技能。
 *
 * **默认广播**。本插件是被有意安装的流程框架，「装上就有角色」是它的核心承诺。
 *
 * 早先版本按「工作区里有没有 `docs/process`」来门禁，实测会产生一个恶性陷阱：
 * 清空或尚未初始化流程目录时角色立刻消失，而技能目录是**按 cwd 缓存**的，
 * 于是 `process_init` 把 `docs/process` 建回来也不会让它们重新出现 —— 使用者
 * 只看到「角色没了」，只能靠再重启一次自救。
 *
 * 需要安静（只在已初始化流程的仓库里出现）就设 `PROCESS_KIT_SKILLS=off`。
 */
function skillsEnabled() {
	const value = process.env.PROCESS_KIT_SKILLS;
	if (typeof value !== 'string') return true;
	return !['off', '0', 'false', 'no'].includes(value.trim().toLowerCase());
}

/** 打包技能 provider：列表与加载都直接读包内文件。 */
function skillProvider() {
	return {
		name: SKILL_PROVIDER,
		async list() {
			if (!skillsEnabled()) return [];
			const candidates = [];
			for (const dir of await skillDirs()) {
				const file = join(PACKAGE_ROOT, 'skills', dir, 'SKILL.md');
				const fm = await readFrontmatter(file);
				if (fm === null) continue;
				const skillName = typeof fm.name === 'string' ? fm.name : dir;
				if (!SKILL_NAME_PATTERN.test(skillName)) continue;
				if (typeof fm.description !== 'string' || fm.description === '') continue;
				candidates.push({
					name: skillName,
					description: fm.description,
					...(typeof fm.whenToUse === 'string' ? { whenToUse: fm.whenToUse } : {}),
					invocation: { modelInvocable: true, userInvocable: true },
					source: 'bundled',
					provider: SKILL_PROVIDER,
					path: file,
					resourceBase: { kind: 'directory', path: join(PACKAGE_ROOT, 'skills', dir) },
					rank: BUNDLED_SKILL_RANK,
					locator: { dir },
					metadata: { ...fm },
				});
			}
			return candidates;
		},
		async get(candidate) {
			const dir = candidate?.locator?.dir;
			if (typeof dir !== 'string') return undefined;
			const file = join(PACKAGE_ROOT, 'skills', dir, 'SKILL.md');
			let text;
			try {
				text = await readFile(file, 'utf8');
			} catch {
				return undefined;
			}
			const body = stripFrontmatter(text);
			return {
				name: candidate.name,
				description: candidate.description,
				...(candidate.whenToUse !== undefined ? { whenToUse: candidate.whenToUse } : {}),
				invocation: candidate.invocation,
				source: candidate.source,
				provider: SKILL_PROVIDER,
				path: file,
				resourceBase: { kind: 'directory', path: join(PACKAGE_ROOT, 'skills', dir) },
				content: body,
				metadata: candidate.metadata,
			};
		},
	};
}

/** 去掉 frontmatter 段，保留正文（技能正文就是给模型读的指令）。 */
function stripFrontmatter(text) {
	const lines = text.split('\n');
	const limit = Math.min(lines.length, 15);
	let start = -1;
	for (let i = 0; i < limit; i += 1) {
		if (/^---\s*$/.test(lines[i])) {
			start = i;
			break;
		}
	}
	if (start === -1) return text;
	for (let i = start + 1; i < lines.length; i += 1) {
		if (/^---\s*$/.test(lines[i])) return lines.slice(i + 1).join('\n').replace(/^\n+/, '');
	}
	return text;
}

/** 注册全部资源。 */
function apply(ctx) {
	ctx.effect(() => ctx.tools.register(statusTool()), 'process-kit: process_status');
	ctx.effect(() => ctx.tools.register(summaryTool()), 'process-kit: gate_summary');
	ctx.effect(() => ctx.tools.register(journalTool()), 'process-kit: process_journal');
	ctx.effect(() => ctx.tools.register(initTool()), 'process-kit: process_init');
	ctx.effect(() => ctx.tools.register(uninstallTool()), 'process-kit: process_uninstall');

	// `skills` 是可选依赖：没有技能服务的组合里工具照常工作。
	ctx.inject(['skills'], (skillCtx) => {
		skillCtx.effect(() => skillCtx.skills.registerProvider(() => skillProvider()), 'process-kit: bundled role skills');
	});

	ctx.effect(
		() =>
			ctx.systemPrompt.section({
				name: 'process-kit-wake',
				order: 10300,
				text: [
					'## 开发流程（docs/process）',
					'当前工作区若已初始化 `docs/process/`（含 README.md 与 PROJECT.md），即按该流程执行单人开发协作流水线：',
					'- 每轮唤醒/续跑先调用 process_status 取状态机快照与下一步动作，不依赖聊天历史；未初始化时可用 process_init 落地骨架；不想继续用可先 dryRun 预览、人确认后调 process_uninstall 清理流程载体。',
					'- Gate0/1/2/4 是必停点，只有人能 approve；对人的一切输出用两段式（✅ 完成了什么 / ❓ 还需要裁定什么），可用 gate_summary 生成骨架。',
					'- journal 只追加不覆写：用 process_journal（机器时间），禁止手工读-改-写。',
					'- 角色由本插件自带的同名技能提供（product-manager / architect / ui-designer / test-agent / dev-agent / uat-agent / code-review-agent / security-review-agent / logic-review-agent）；派单时让 subagent 读对应技能，不要在提示里复述角色职责。',
					'- 同一仓库同一时刻只推进一个包；要并行就开独立 session，且先看协调板（PROJECT.md §1）比对落点，有交集停下报人，不硬开工。',
					'- git 只读：session 不 commit / 不 add -A / 不 push —— 默认归档 = 人提交；例外必须由人当轮明确授权。',
					'- 角色硬边界、状态机与门禁以 docs/process/README.md 为唯一真源，项目适配见 docs/process/PROJECT.md；本节只做提醒，不复述规则。',
				].join('\n'),
			}),
		'process-kit: wake section',
	);
}

export { apply, inject, name };
