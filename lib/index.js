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
import { detectLangFromRepo, makeMsg, resolveLang } from '../scripts/i18n.mjs';

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

/**
 * 仓库语言：`docs/process/.process-kit.json` 的 `lang` → PROJECT.md frontmatter → 文档推断 → `zh`。
 * 与门禁脚本共用 `scripts/i18n.mjs`（单一真源，避免工具说英文、门禁说中文）。
 */
function repoLang(root) {
	return resolveLang(root);
}

/** 取词器（成对字面量，见 scripts/i18n.mjs 的说明）。 */
const t = (lang) => makeMsg(lang);

/**
 * 工具描述的**双语拼接**：描述在插件注册时就固定了，无法按仓库切换，
 * 所以英文段在前、中文段在后，两种用户都能读到自己的语言。
 */
const bi = (english, zh) => `${english}\n\n${zh}`;

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

/**
 * 一个包的下一步动作；gate 为 null 表示无停等点。
 * 文案按仓库语言取词（`lang`），逻辑与语言无关。
 */
function nextAction(pkg, lang) {
	const T = t(lang);
	const check = pkg.check;
	const prd = pkg.prd;
	if (!check && !prd) {
		return {
			short: T('起草核对件', 'draft the requirement check'),
			gate: 'Gate0',
			action: T(
				'input/ 有原料但无核对件：主控先判表达是否足以支撑可断言判据；不足则写 input/<ID>-research-brief.md，并行派 pm + architect 调研并汇合，再起草需求核对件（fast 路径不做调研），随后停等 Gate0',
				'input/ has raw material but no requirement check: the orchestrator first decides whether the request already supports assertable criteria; if not, write input/<ID>-research-brief.md, dispatch pm + architect to research in parallel, merge their findings, then draft the requirement check (the fast path skips research), then stop at Gate0',
			),
		};
	}
	if (!prd) {
		if (check.gate0 === 'approved' && check.flow === 'fast') {
			return {
				short: T('快速路径：直派 dev', 'fast path: dispatch dev'),
				gate: null,
				action: T(
					'核对件已裁定快速路径（flow: fast）：不派 pm、不产生 Gate1/Gate2、不做调研；直接派 dev 实现 + 存量回归，结论记 journal。若实际触及 schema/RBAC/金额/对外接口 ⇒ 退回全流程',
					'the check was ruled flow: fast — no pm, no Gate1/Gate2, no research: dispatch dev to implement plus run the existing regression suite, and record the conclusion in the journal. If it actually touches schema / RBAC / money / a public interface ⇒ send it back to the full flow',
				),
			};
		}
		if (check.gate0 === 'approved') {
			return {
				short: T('调 pm', 'dispatch pm'),
				gate: 'Gate1',
				action:
					check.uiDesign === 'required'
						? T(
								'gate0 已过（uiDesign: required）：调 pm 出 PRD + 契约 + 设计与说明；有架构影响时调 architect 出 prd/<ID>-arch.md（随 Gate1 加审）；再调 ui-designer 出 HTML 原型（prototypes/<ID>/index.html + handoff.md，交付主件；不产出 PNG/PSD）与 UI 规格（prd/<ID>-ui-spec.md，随 Gate1 一并审），随后停等 Gate1',
								'gate0 passed (uiDesign: required): dispatch pm for the PRD + contract + design spec; dispatch architect for prd/<ID>-arch.md when there is architectural impact (reviewed together at Gate1); then dispatch ui-designer for the HTML prototype (prototypes/<ID>/index.html + handoff.md, the deliverable; no PNG/PSD) and the UI spec (prd/<ID>-ui-spec.md, reviewed at Gate1 too), then stop at Gate1',
							)
						: T(
								'gate0 已过：调 pm 出 PRD + 契约 + 设计与说明；有架构影响时调 architect 出 prd/<ID>-arch.md（随 Gate1 加审），随后停等 Gate1',
								'gate0 passed: dispatch pm for the PRD + contract + design spec; dispatch architect for prd/<ID>-arch.md when there is architectural impact (reviewed at Gate1), then stop at Gate1',
							),
			};
		}
		if (check.gate0 === 'rejected') {
			return {
				short: T('修订核对件', 'revise the requirement check'),
				gate: 'Gate0',
				action: T('按人裁定修订核对件，重新停等 Gate0', 'revise the check per the human ruling, then stop at Gate0 again'),
			};
		}
		return {
			short: T('等 Gate0', 'waiting Gate0'),
			gate: 'Gate0',
			action: T('停等 Gate0 人签（核对件 frontmatter gate0: approved）', 'stop and wait for the human to sign Gate0 (requirement check frontmatter gate0: approved)'),
		};
	}
	if (prd.gate1 === 'pending') {
		return {
			short: T('等 Gate1', 'waiting Gate1'),
			gate: 'Gate1',
			action: T('停等 Gate1 人签（gate1: approved）', 'stop and wait for the human to sign Gate1 (gate1: approved)'),
		};
	}
	if (prd.gate1 === 'rejected') {
		return {
			short: T('修订送审件', 'revise the submitted docs'),
			gate: 'Gate1',
			action:
				check?.uiDesign === 'required'
					? T(
							'按驳回意见修订 PRD/契约/设计与说明/UI 规格（有 arch 时含 arch），重等 Gate1',
							'revise the PRD / contract / design spec / UI spec (and arch when present) per the rejection, then wait at Gate1 again',
						)
					: T(
							'按驳回意见修订 PRD/契约/设计与说明（有 arch 时含 arch），重等 Gate1',
							'revise the PRD / contract / design spec (and arch when present) per the rejection, then wait at Gate1 again',
						),
		};
	}
	if (prd.gate2 === 'pending') {
		return {
			short: T('调 test 写红', 'dispatch test for red tests'),
			gate: 'Gate2',
			action: T('调 test 生成测试 + 红灯归因，随后停等 Gate2', 'dispatch test to write tests + attribute the red ones, then stop at Gate2'),
		};
	}
	if (prd.gate2 === 'rejected') {
		return {
			short: T('修订判据', 'revise the criteria'),
			gate: 'Gate2',
			action: T('按驳回意见修订测试/判据，重等 Gate2', 'revise the tests / criteria per the rejection, then wait at Gate2 again'),
		};
	}
	switch (prd.status) {
		case 'red':
			return {
				short: T('调 dev 实现', 'dispatch dev to implement'),
				gate: null,
				action: T('gate2 已过：调 dev 实现到绿，status → implementing', 'gate2 passed: dispatch dev to implement until green, status → implementing'),
			};
		case 'implementing':
			return check?.uiDesign === 'required'
				? {
						short: T('test 复跑 + UI 核对', 'test re-run + UI parity check'),
						gate: null,
						action: T(
							'切片循环；L2 包验证绿后先调 ui-designer 做 UI 还原核对（reports/ui-review/<ID>.md），pass 后才 status → uat；fail/conditional 回 dev',
							'slice loop; once the L2 package verification is green, dispatch ui-designer for the UI parity check (reports/ui-review/<ID>.md); only a pass moves status → uat, fail/conditional goes back to dev',
						),
					}
				: {
						short: T('test 独立复跑', 'test independent re-run'),
						gate: null,
						action: T(
							'切片循环；全部完成后由 test 独立复跑 L2 包验证，status → uat',
							'slice loop; when every slice is done, test re-runs the L2 package verification independently, status → uat',
						),
					};
		case 'uat':
			if (prd.gate4 === 'approved') {
				return {
					short: T('收口', 'close out'),
					gate: null,
					action: T('gate4 已签：落 status=done，并提醒人提交（默认归档 = git）', 'gate4 signed: set status=done and remind the human to commit (archiving = git by default)'),
				};
			}
			return {
				short: T('uat → pm 审核', 'uat → pm review'),
				gate: 'Gate4',
				action: T('调 uat 黑盒验收 → pm 完备性审核 → 停等 Gate4', 'dispatch uat for black-box acceptance → pm completeness review → stop at Gate4'),
			};
		case 'done':
			return {
				short: T('done', 'done'),
				gate: null,
				action: T('已完成；多包 done 待上线时走发布前整体回归', 'done; when several done packages await release, run the pre-release full regression'),
			};
		case 'terminated':
			return {
				short: T('terminated', 'terminated'),
				gate: null,
				action: T('人裁终止：产物原地保留，不重做、不清场', 'terminated by the human: artifacts stay in place, no rework, no cleanup'),
			};
		case 'frozen':
			return {
				short: T('调 test 写红', 'dispatch test for red tests'),
				gate: 'Gate2',
				action: T('frozen：调 test 生成测试 + 归因，随后停等 Gate2', 'frozen: dispatch test to write tests + attribute them, then stop at Gate2'),
			};
		case 'draft':
		default:
			if (prd.gate2 === 'approved') {
				return {
					short: T('同步状态位', 'sync the status bits'),
					gate: null,
					action: T(
						'gate2 已 approved 但 status 仍是 draft：核对 frontmatter 后推进（red/implementing）',
						'gate2 is approved but status is still draft: check the frontmatter and move on (red/implementing)',
					),
				};
			}
			return {
				short: prd.status ?? T('未知', 'unknown'),
				gate: null,
				action: T('未知状态组合，人工判读 frontmatter', 'unknown status combination: read the frontmatter by hand'),
			};
	}
}

/** 状态位一致性；只报事实，不替人修。 */
function consistencyWarnings(pkg, warnings, lang) {
	const T = t(lang);
	const prd = pkg.prd;
	if (pkg.check?.flow === 'fast' && prd !== null) {
		warnings.push(
			T(
				`${pkg.id}: 核对件 flow=fast 但已存在 PRD（快速路径不建 PRD，两处需一起核）`,
				`${pkg.id}: requirement check says flow=fast but a PRD already exists (the fast path creates no PRD — reconcile both)`,
			),
		);
	}
	if (pkg.uiDesign !== null && pkg.uiDesign !== undefined && !['required', 'not-needed'].includes(pkg.uiDesign)) {
		warnings.push(
			T(
				`${pkg.id}: 核对件 uiDesign 取值异常 "${pkg.uiDesign}"（应为 required / not-needed）`,
				`${pkg.id}: requirement check has an invalid uiDesign value "${pkg.uiDesign}" (expected required / not-needed)`,
			),
		);
	}
	if (pkg.check?.flow === 'fast' && pkg.uiDesign === 'required') {
		warnings.push(
			T(
				`${pkg.id}: 核对件 flow=fast 与 uiDesign=required 冲突（快速路径不建 PRD、不过 Gate1，承载不了 UI 规格：改 flow=full 或 uiDesign=not-needed）`,
				`${pkg.id}: flow=fast conflicts with uiDesign=required (the fast path has no PRD and no Gate1, so it cannot carry a UI spec: switch to flow=full or uiDesign=not-needed)`,
			),
		);
	}
	if (pkg.check?.flow === 'fast' && (pkg.artifacts?.researchBrief || pkg.artifacts?.priorArt || pkg.artifacts?.techScan)) {
		warnings.push(
			T(
				`${pkg.id}: 核对件 flow=fast 但存在借鉴调研件（快速路径不做调研：删调研件或改 flow=full）`,
				`${pkg.id}: flow=fast but prior-art research files exist (the fast path does no research: delete them or switch to flow=full)`,
			),
		);
	}
	if (!prd) return;
	const where = `${pkg.id}`;
	if (prd.mainMissing) {
		const others = prd.otherFiles.map((f) => `${PROCESS_REL}/prd/${f}`).join(T('、', ', '));
		warnings.push(
			T(
				`${where}: 找不到主件 ${PROCESS_REL}/prd/${pkg.id}.md —— 状态位改读 ${prd.file}（同 ID 还有 ${others || '无'}；补上主件或改名，别让从件顶替）`,
				`${where}: main file ${PROCESS_REL}/prd/${pkg.id}.md is missing — status bits are being read from ${prd.file} (same ID also has ${others || 'nothing'}); restore the main file or rename, do not let a side file stand in`,
			),
		);
	}
	if (pkg.uiDesign === 'required' && prd.gate1 === 'approved') {
		if (pkg.artifacts?.uiSpec === null) {
			warnings.push(
				T(
					`${where}: 核对件 uiDesign=required 但 ${PROCESS_REL}/prd/${pkg.id}-ui-spec.md 缺失（Gate1 应审 UI 规格）`,
					`${where}: uiDesign=required but ${PROCESS_REL}/prd/${pkg.id}-ui-spec.md is missing (Gate1 should review the UI spec)`,
				),
			);
		}
		if (pkg.artifacts?.prototype === null) {
			warnings.push(
				T(
					`${where}: 核对件 uiDesign=required 但 ${PROCESS_REL}/prototypes/${pkg.id}/index.html 缺失（Gate1 应审可打开的 HTML 原型，PNG/PSD 不算交付）`,
					`${where}: uiDesign=required but ${PROCESS_REL}/prototypes/${pkg.id}/index.html is missing (Gate1 should review an openable HTML prototype; PNG/PSD do not count)`,
				),
			);
		}
	}
	if (pkg.uiDesign === 'required' && prd.status === 'uat' && pkg.artifacts?.uiReview === null) {
		warnings.push(
			T(
				`${where}: status=uat 但 reports/ui-review/${pkg.id}.md 缺失（有 UI 的包应先做 UI 还原核对，pass 后才进 UAT）`,
				`${where}: status=uat but reports/ui-review/${pkg.id}.md is missing (packages with UI must pass the UI parity check before UAT)`,
			),
		);
	}
	if (prd.status === 'frozen' && prd.gate1 !== 'approved') {
		warnings.push(
			T(
				`${where}: status=frozen 但 gate1=${prd.gate1}（frozen 定义为 Gate1 已过，两处需一起改）`,
				`${where}: status=frozen but gate1=${prd.gate1} (frozen means Gate1 passed — fix both)`,
			),
		);
	}
	if (prd.gate2 === 'approved' && ['draft', 'frozen'].includes(prd.status)) {
		warnings.push(
			T(
				`${where}: gate2=approved 但 status=${prd.status}（应已进 red/implementing）`,
				`${where}: gate2=approved but status=${prd.status} (it should be red/implementing by now)`,
			),
		);
	}
	if (prd.gate4 === 'approved' && prd.status !== 'done') {
		warnings.push(
			T(`${where}: gate4=approved 但 status=${prd.status}（应落 done）`, `${where}: gate4=approved but status=${prd.status} (it should be done)`),
		);
	}
	if (prd.status === 'uat' && prd.gate2 !== 'approved') {
		warnings.push(T(`${where}: status=uat 但 gate2=${prd.gate2}`, `${where}: status=uat but gate2=${prd.gate2}`));
	}
	for (const gate of GATES) {
		if (prd[gate] !== undefined && !['pending', 'approved', 'rejected'].includes(prd[gate])) {
			warnings.push(T(`${where}: ${gate} 取值异常 "${prd[gate]}"`, `${where}: ${gate} has an invalid value "${prd[gate]}"`));
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

/** 扫描工作区的流程状态；无流程目录时 { found:false }。`lang` 只影响文案。 */
async function scanProcess(root, lang) {
	const T = t(lang);
	const dir = join(root, PROCESS_REL);
	if (!(await exists(dir))) {
		return { found: false, root, lang };
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
			prototype: (await exists(join(dir, 'prototypes', id, 'index.html'))) ? `${PROCESS_REL}/prototypes/${id}/index.html` : null,
			uiReview: (await exists(join(root, 'reports', 'ui-review', `${id}.md`))) ? `reports/ui-review/${id}.md` : null,
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
					integrity: await journalIntegrity(journalPath, lines, lang),
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
					integrity: { state: 'unverified', reason: T('journal 读取失败', 'journal unreadable') },
				};
			}
		}
		const pkg = {
			id,
			status: prd?.status ?? (check ? T(`核对件:${check.status}`, `check:${check.status}`) : 'unknown'),
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
		consistencyWarnings(pkg, warnings, lang);
		pkg.gateHost = gateHostOf(journal, pkg.gates);
		pkg.next = nextAction(pkg, lang);
		pkg.statusClass = statusClass(prd?.status ?? 'unknown');
		packages.push(pkg);
	}
	if (orphanRawInputs.length > 0) {
		const researchCount = orphanRawInputs.filter((f) => /-(?:research-brief|prior-art|tech-scan)\.md$/.test(f)).length;
		packages.push({
			id: T('(input 原料未建核对件)', '(raw input without a requirement check)'),
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
							short: T('继续/汇合调研', 'finish/merge the research'),
							gate: 'Gate0',
							action: T(
								`input/ 有 ${orphanRawInputs.length} 份原料，其中 ${researchCount} 份为借鉴调研件：先确认两份研究件齐备且已汇合（architect 标注 C-NN / pm 反推需求），再折成核对件（已有核对件的补进 §4.1 / §5）；候选不得直接当裁定`,
								`input/ holds ${orphanRawInputs.length} raw inputs, ${researchCount} of them prior-art research: first make sure both research files are complete and merged (architect marks C-NN / pm derives requirements), then fold them into the requirement check (append to §4.1 / §5 if a check exists); candidates are never rulings`,
							),
					  }
					: {
							short: T('起草核对件', 'draft the requirement check'),
							gate: 'Gate0',
							action: T(
								`input/ 有 ${orphanRawInputs.length} 份原料未起草核对件`,
								`input/ holds ${orphanRawInputs.length} raw input(s) with no requirement check drafted`,
							),
					  },
		});
	}

	for (const [id, file] of archOnly) {
		if (!ids.has(id)) {
			warnings.push(
				T(
					`prd/${file} 是架构设计与取舍件，但找不到同 ID 的主件 PRD / 核对件：不单独当需求包（先补主件）`,
					`prd/${file} is an architecture decision file without a same-ID main PRD / requirement check: it does not stand alone as a package (add the main file first)`,
				),
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
		lang,
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
	const T = t(snapshot.lang);
	if (!snapshot.found) {
		return T(
			`未找到流程目录（${PROCESS_REL}）：当前工作区尚未初始化流程，可先调用 process_init 落地骨架。`,
			`no process directory (${PROCESS_REL}): this workspace has not initialized the process yet — call process_init to lay down the scaffold.`,
		);
	}
	const lines = [];
	lines.push(T(`# 流程状态（${snapshot.generatedAt}）`, `# Process status (${snapshot.generatedAt})`));
	lines.push(`root: ${snapshot.root}`);
	for (const pkg of snapshot.packages) {
		const gates = GATES.map((g) => {
			const v = pkg.gates[g];
			if (v === null) return `${g}:—`;
			const host = pkg.gateHost?.[g];
			// 批准来源必须显式带出来：AI 托管的批准不得看起来像人签
			const mark =
				host === 'ai-hosted' ? T('🤖AI托管', '🤖AI-hosted') : host === 'unrecorded' ? T('⚠无留痕', '⚠unrecorded') : '';
			return `${g}:${v}${mark}`;
		}).join(' ');
		lines.push('');
		lines.push(
			`## ${pkg.id}　[${pkg.status}]${pkg.prdVersion ? ` v${pkg.prdVersion}` : ''}${pkg.flow === 'fast' ? T('　⚡快速路径', '　⚡fast path') : ''}${pkg.uiDesign === 'required' ? T('　🎨UI 设计', '　🎨UI design') : ''}`,
		);
		lines.push(`  ${gates}`);
		if (pkg.journal !== null) {
			lines.push(
				T(
					`  journal: ${pkg.journal.lines} 行，末条 ${pkg.journal.lastAt ?? '?'} ${pkg.journal.lastActor ?? ''} ${pkg.journal.lastStep ?? ''}`,
					`  journal: ${pkg.journal.lines} line(s), last ${pkg.journal.lastAt ?? '?'} ${pkg.journal.lastActor ?? ''} ${pkg.journal.lastStep ?? ''}`,
				),
			);
			const integ = pkg.journal.integrity;
			if (integ !== undefined) {
				if (integ.state === 'tampered') {
					lines.push(T(`  🚨 journal 完整性：**篡改嫌疑** —— ${integ.reason}`, `  🚨 journal integrity: **tamper suspected** — ${integ.reason}`));
					lines.push(
						T(
							`     不得当正常 journal 用：先与 ${PROCESS_REL}/prd/<ID>.journal.jsonl.bak 比对，查清后再决定是否采信。`,
							`     do not treat it as a normal journal: diff it against ${PROCESS_REL}/prd/<ID>.journal.jsonl.bak first, then decide whether to trust it.`,
						),
					);
				} else if (integ.state === 'verified') {
					lines.push(T(`  ✓ journal 完整性：链式指纹一致（${integ.lines} 行）`, `  ✓ journal integrity: hash chain consistent (${integ.lines} lines)`));
				} else if (integ.state === 'legacy') {
					lines.push(T(`  ⚠ journal 完整性：${integ.reason}`, `  ⚠ journal integrity: ${integ.reason}`));
				} else {
					lines.push(T(`  ⚠ journal 完整性：**未校验** —— ${integ.reason}`, `  ⚠ journal integrity: **unverified** — ${integ.reason}`));
				}
			}
		}
		if (pkg.openBugs.length > 0) lines.push(`  open bugs: ${pkg.openBugs.join(', ')}`);
		if (pkg.rawInputs) lines.push(T(`  原料: ${pkg.rawInputs.join(', ')}`, `  raw input: ${pkg.rawInputs.join(', ')}`));
		const art = Object.entries(pkg.artifacts ?? {}).filter(([, v]) => v !== null).map(([k]) => k);
		if (art.length > 0) lines.push(T(`  产物: ${art.join(' / ')}`, `  artifacts: ${art.join(' / ')}`));
		lines.push(
			T(
				`  ▶ 下一步（${pkg.next.gate ?? '无停点'}）：${pkg.next.action}`,
				`  ▶ next (${pkg.next.gate ?? 'no stop point'}): ${pkg.next.action}`,
			),
		);
	}
	if (snapshot.packages.length === 0) lines.push(T('\n（无在途包）', '\n(no active package)'));
	if (snapshot.orphanBugs.length > 0) {
		lines.push('');
		lines.push(T('## 未挂包的 open bugs', '## Open bugs not attached to a package'));
		for (const b of snapshot.orphanBugs) lines.push(`  ${b.id} (${b.file})`);
	}
	if (snapshot.releasePending) {
		lines.push(
			T(
				`\n⚠ 有 ${snapshot.doneCount} 个包 done 待上线：上线前走发布前整体回归。`,
				`\n⚠ ${snapshot.doneCount} package(s) are done and await release: run the pre-release full regression before shipping.`,
			),
		);
		const reports = snapshot.releaseReports ?? [];
		if (reports.length > 0) {
			lines.push(
				T(
					`  已有 ${reports.length} 份发布回归报告（${reports.join(', ')}）—— 评审三件套是否跑过以报告索引为准。`,
					`  ${reports.length} release-regression report(s) exist (${reports.join(', ')}) — whether the review trio ran is decided by that index.`,
				),
			);
		} else {
			lines.push(
				T(
					`  ⚠ 未见 ${PROCESS_REL}/reports/release/** 报告：评审三件套（code / security / logic）**尚未执行**。`,
					`  ⚠ no report under ${PROCESS_REL}/reports/release/**: the review trio (code / security / logic) has **not run**.`,
				),
			);
			lines.push(
				T(
					'     它们只在发布回归跑（单包流程刻意不派）；未跑就是没有这层覆盖，不得当已覆盖。若要提前跑，在 Gate 摘要里点名。',
					'     they only run in the release regression (single-package flow deliberately skips them); not run = no coverage, never claim it. To run them early, name it in the Gate summary.',
				),
			);
		}
	}
	if (snapshot.warnings.length > 0) {
		lines.push('');
		lines.push(T('## 状态位不一致（如实报人，不自行修）', '## Inconsistent status bits (report to the human, never self-fix)'));
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
async function journalIntegrity(journalPath, lines, lang) {
	const T = t(lang);
	const metaFile = `${journalPath}.meta.json`;
	if (!(await exists(metaFile))) return { state: 'unverified', reason: T('无 .meta.json 旁挂指纹，无从校验', 'no .meta.json sidecar fingerprint — nothing to verify against') };
	let meta;
	try {
		meta = JSON.parse(await readFile(metaFile, 'utf8'));
	} catch {
		return { state: 'unverified', reason: T('.meta.json 损坏，无从校验', '.meta.json is corrupt — nothing to verify against') };
	}
	if (meta === null || typeof meta.lines !== 'number') return { state: 'unverified', reason: T('.meta.json 缺 lines 字段，无从校验', '.meta.json has no lines field — nothing to verify against') };
	if (meta.lines !== lines.length) {
		return {
			state: 'tampered',
			reason: T(
				`行数不符：meta 记 ${meta.lines} 行、实读 ${lines.length} 行（疑截断或未登记的追加）`,
				`line count mismatch: meta says ${meta.lines}, actually read ${lines.length} (truncation or an unrecorded append)`,
			),
		};
	}
	if (typeof meta.lastHash === 'string' && meta.lastHash !== hash16(lines[lines.length - 1] ?? '')) {
		return { state: 'tampered', reason: T('末行指纹不符（末行被改写）', 'last-line fingerprint mismatch (the last line was rewritten)') };
	}
	if (typeof meta.chainHash === 'string') {
		if (meta.chainHash !== journalChain(lines)) {
			return {
			state: 'tampered',
			reason: T('链式指纹不符（中间某行被改写、删行或换行）', 'hash chain mismatch (a middle line was rewritten, deleted or moved)'),
		};
		}
		return { state: 'verified', lines: lines.length };
	}
	return {
			state: 'legacy',
			reason: T(
				'meta 为旧格式（无 chainHash）：只验了行数与末行，中间行不可验',
				'legacy meta format (no chainHash): only the line count and last line were verified, middle lines cannot be',
			),
		};
}

/** `wx` 独占建锁；陈旧锁（>30s）清掉重试；10 秒拿不到即明确失败。 */
async function acquireLock(lockPath) {
	const deadline = Date.now() + LOCK_DEADLINE_MS;
	for (;;) {
		try {
			await writeFile(lockPath, `${process.pid}\n${new Date().toISOString()}\n`, { flag: 'wx' });
			return;
		} catch (error) {
			if (error.code !== 'EEXIST') throw new Error(T(`建锁失败：${error.message}`, `failed to create the lock: ${error.message}`));
			try {
				const info = await stat(lockPath);
				if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
					await unlink(lockPath);
					continue;
				}
			} catch {
				/* 锁刚被释放，直接重试 */
			}
			if (Date.now() > deadline) throw new Error(T('等待锁超时（另一进程正在写同一 journal）', 'timed out waiting for the lock (another process is writing the same journal)'));
			await sleep(20);
		}
	}
}

/** 安全追加：指纹校验 → 临时文件 → 备份 → rename → 自校验 → 更新 meta。 */
async function journalAppend(root, id, record, lang) {
	const T = t(lang);
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
					throw new Error(
			T(
				`检测到历史被截断：写入前 ${before.length} 行 < 上次记录 ${prior.lines} 行，疑似并发覆盖，已拒绝写入。备份见 ${backupPath}`,
				`history appears truncated: ${before.length} lines before writing < ${prior.lines} recorded earlier — likely a concurrent overwrite, write refused. Backup: ${backupPath}`,
			),
		);
				}
				if (before.length > prior.lines && hash16(before[prior.lines - 1] ?? '') !== prior.lastHash) {
					throw new Error(
			T(
				`检测到既有内容被改写：第 ${prior.lines} 行与上次记录不符，已拒绝写入。备份见 ${backupPath}`,
				`existing content was modified: line ${prior.lines} no longer matches the earlier record, write refused. Backup: ${backupPath}`,
			),
		);
				}
				// 链式指纹能盖住「中间某行被改」——只比末行是查不出来的。
				if (typeof prior.chainHash === 'string') {
					const priorChain = journalChain(before.slice(0, prior.lines));
					if (priorChain !== prior.chainHash) {
						throw new Error(
			T(
				`检测到既有内容被改写：前 ${prior.lines} 行的链式指纹与上次记录不符（中间行被改 / 删行 / 换行），已拒绝写入。备份见 ${backupPath}`,
				`existing content was modified: the hash chain of the first ${prior.lines} lines no longer matches (a middle line rewritten / deleted / moved), write refused. Backup: ${backupPath}`,
			),
		);
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
		if (after.length !== merged.length) {
			throw new Error(
				T(
					`自校验失败：预期 ${merged.length} 行、实际 ${after.length} 行`,
					`self-check failed: expected ${merged.length} lines, found ${after.length}`,
				),
			);
		}
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
	const root = rootOf(exec);
	return scanProcess(root, repoLang(root));
}

/** process_status：确定性状态机快照。 */
function statusTool() {
	return {
		name: 'process_status',
		description: bi(
			'Process state-machine snapshot: scans the input/prd/bugs frontmatter under docs/process and returns per-package status/gate0/gate1/gate2/gate4/prdVersion, the journal tail, open bugs, status-bit inconsistency warnings and the next action. Call it first on every wake-up/resume instead of relying on chat history; a repository without an initialized process returns not-found and points at process_init.',
			'开发流程状态机快照：扫描 docs/process 的 input/prd/bugs frontmatter，返回每包 status/gate0/gate1/gate2/gate4/prdVersion、journal 尾部、open bugs、状态位不一致警告与下一步动作。唤醒/续跑时先调它，不靠聊天历史；未初始化流程的仓库会返回 not-found 并提示 process_init。',
		),
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
		description: bi(
			'Render the two-part Gate interaction summary skeleton for one package: fills the [ID] header, gate values, journal tail, artifact paths and open bugs; the ✅/❓ body is left as placeholders for the orchestrator. Only for repositories that already initialized docs/process.',
			'渲染某需求包的 Gate 两段式交互摘要骨架：自动填【ID】抬头、gate 值、journal 尾部、产物路径与 open bugs；✅/❓ 内容段留占位由主控填。仅适用于已初始化 docs/process 的仓库。',
		),
		parameters: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'package ID (frontmatter id, e.g. FEAT-001) / 需求包 ID（frontmatter id，如 FEAT-001）' },
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
			const T = t(repoLang(rootOf(exec)));
			if (id === undefined || !ID_PATTERN.test(id)) {
				throw new Error(T('id 必填：需求包 ID（frontmatter id）', 'id is required: the package ID (frontmatter id)'));
			}
			const snapshot = await snapshotFor(exec);
			if (!snapshot.found) throw new Error(renderStatus(snapshot));
			const pkg = snapshot.packages.find((p) => p.id === id);
			if (pkg === undefined) {
				throw new Error(
					T(
						`包 ${id} 不在当前快照中（核对 input/ 或 prd/ 的 frontmatter id）`,
						`package ${id} is not in the current snapshot (check the frontmatter id under input/ or prd/)`,
					),
				);
			}
			const gates = GATES.filter((g) => pkg.gates[g] !== null).map((g) => `${g}=${pkg.gates[g]}`).join(' ');
			const lines = [];
			lines.push(
				pkg.next.gate
					? T(
							`【${pkg.id}】${pkg.id}　${pkg.status} → ${pkg.next.short}　（${pkg.next.gate}）`,
							`[${pkg.id}] ${pkg.id}　${pkg.status} → ${pkg.next.short}　(${pkg.next.gate})`,
						)
					: T(`【${pkg.id}】${pkg.id}　${pkg.status} → ${pkg.next.short}`, `[${pkg.id}] ${pkg.id}　${pkg.status} → ${pkg.next.short}`),
			);
			lines.push('');
			lines.push(T('✅ 完成了什么', '✅ What was done'));
			lines.push(
				T(
					'1. <人话，1~3 条，每条 ≤ 40 字；据 journal 尾部与最近报告提炼>',
					'1. <plain language, 1-3 bullets, each ≤ 40 words; distill from the journal tail and the latest reports>',
				),
			);
			lines.push('');
			lines.push(T('❓ 还需要裁定什么', '❓ What still needs a decision'));
			lines.push(T('1. 若只答一条，请答这条：<最值得质疑的点>', '1. If you answer only one, answer this: <the point most worth challenging>'));
			lines.push(T('（没有待裁事项就写「无，可放行」）', '(if nothing needs deciding, write "none — cleared to proceed")'));
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
						? T('｜完整性 ✓链式一致', ' | integrity ✓ chain consistent')
						: integ0.state === 'tampered'
							? T(`｜完整性 🚨${integ0.reason}`, ` | integrity 🚨 ${integ0.reason}`)
							: T(`｜完整性 ⚠${integ0.reason}`, ` | integrity ⚠ ${integ0.reason}`);
			const runCount = pkg.journal?.runs?.length ?? 0;
			const redCount = (pkg.journal?.runs ?? []).filter((r) => r.exitCode !== null && r.exitCode !== 0).length;
			lines.push(
				T(
					`🔒 本轮门禁证据（机器侧，供人抽查）${integNote}｜run ${runCount} 条（非零 ${redCount}）`,
					`🔒 Gate evidence for this round (machine-side, for human spot checks)${integNote} | ${runCount} run record(s) (${redCount} non-zero)`,
				),
			);
			if (pkg.journal === null) {
				lines.push(
					T(
						'  ⚠ 无 journal：连「跑没跑」都无从查起。**没记录 ≠ 已覆盖**。',
						'  ⚠ no journal: even "did it run" cannot be answered. **Not recorded ≠ covered**.',
					),
				);
			} else if (runs.length === 0) {
				lines.push(
					T(
						`  未记录：${gk ?? '本 Gate'} 找不到任何门禁执行记录（journal 里没有 action=run + exitCode）。**没跑就是没跑**，不得当已覆盖。`,
						`  not recorded: no gate execution record for ${gk ?? 'this Gate'} (no action=run + exitCode in the journal). **Not run means not run** — never claim coverage.`,
					),
				);
			} else {
				for (const r of runs) {
					const code =
						r.exitCode === null
							? T('退出码未记录 ⚠', 'exit code not recorded ⚠')
							: r.exitCode === 0
								? 'exit 0 ✓'
								: `exit ${r.exitCode} ${T('🚨非零', '🚨 non-zero')}`;
					const art = r.artifact !== null ? `｜${r.artifact}` : '';
					lines.push(
						`  - ${r.gate ?? T('gate 未标', 'gate unlabeled')}｜${r.command ?? T('命令未记录', 'command not recorded')}｜${code}${art}（${r.at ?? '?'} ${r.actor ?? ''}）`,
					);
				}
			}
			// 没走到停点时退回显示「最近一条批准」的来源 —— AI 托管这件事任何时候都不该被藏起来
			const lastApproval = (pkg.journal?.approvals ?? []).at(-1) ?? null;
			const hostNote = gk !== null ? pkg.gateHost?.[gk] : (lastApproval?.via ?? null);
			const hostGate = gk ?? lastApproval?.gate ?? null;
			if (hostNote === 'ai-hosted') {
				lines.push(
					T(
						`  🤖 ${hostGate ?? '最近'} 的批准是 **AI 托管**，不是人签 —— 正式开发不得如此，只许出现在验收 / 回归装置里。`,
						`  🤖 the approval on ${hostGate ?? 'the latest gate'} was **AI-hosted**, not human-signed — never allowed in real development, only in acceptance / regression harnesses.`,
					),
				);
			} else if (hostNote === 'unrecorded') {
				lines.push(
					T(
						'  ⚠ 状态位已 approved，但 journal 里查不到对应的批准记录：批准来源无从考证。',
						'  ⚠ the status bit is approved, but the journal has no matching approval record: the approval source cannot be verified.',
					),
				);
			}
			lines.push('');
			const facts = [
				T(
					`journal ${pkg.journal?.lines ?? 0} 行（末条 ${pkg.journal?.lastAt ?? '—'}）`,
					`journal ${pkg.journal?.lines ?? 0} line(s) (last ${pkg.journal?.lastAt ?? '—'})`,
				),
			];
			if (pkg.openBugs.length > 0) facts.push(`open bugs ${pkg.openBugs.length}${T('：', ': ')}${pkg.openBugs.join(', ')}`);
			const art = Object.entries(pkg.artifacts ?? {}).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`);
			if (art.length > 0) facts.push(art.join('｜'));
			facts.push(T('本波 subagent 新建 <N> / 复用 <M>（主控补）', 'subagents this round: new <N> / reused <M> (filled by the orchestrator)'));
			lines.push(
				T(
					`📎 依据（不进正文，需要时展开）：${gates}${pkg.prdVersion ? `｜prdVersion ${pkg.prdVersion}` : ''}｜${facts.join('｜')}`,
					`📎 Basis (not part of the body; expand if needed): ${gates}${pkg.prdVersion ? ` | prdVersion ${pkg.prdVersion}` : ''} | ${facts.join(' | ')}`,
				),
			);
			lines.push('');
			lines.push(T(`▶ 下一步（${pkg.next.gate ?? '无停点'}）：${pkg.next.action}`, `▶ next (${pkg.next.gate ?? 'no stop point'}): ${pkg.next.action}`));
			return { id: pkg.id, status: pkg.status, gates: pkg.gates, next: pkg.next, skeleton: lines.join('\n') };
		},
	};
}

/** process_journal：安全追加 journal（机器时间）。 */
function journalTool() {
	return {
		name: 'process_journal',
		description: bi(
			'Safely append one journal record to docs/process/prd/<ID>.journal.jsonl (lock + fingerprint check + atomic replace + self-check). `at` is filled from machine time; `actor` is required. Never read-modify-write the journal by hand. action=run MUST carry command and exitCode (whether the gate ran and with what exit code is the only machine-verifiable evidence at a Gate); action=approve should carry gate and via (via=human|ai-hosted — an AI-hosted approval must be recorded as such and never posing as a human signature).',
			'向 docs/process/prd/<ID>.journal.jsonl 安全追加一条 journal（锁 + 指纹校验 + 原子替换 + 自校验）。at 取机器时间自动填；actor 必填。禁手工读-改-写 journal。action=run 必须带 command 与 exitCode（门禁跑了没、退出码多少，是 Gate 上唯一可核验的机器证据）；action=approve 建议带 gate 与 via（via=human|ai-hosted，AI 托管的批准必须留痕，不得冒充人签）。',
		),
		parameters: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'package ID (the journal file name stem) / 需求包 ID（journal 文件名主体）' },
				actor: { type: 'string', description: 'who did it (e.g. orchestrator / subagent:test-agent) / 谁做的（如 orchestrator / subagent:test-agent）' },
				step: { type: 'string', description: 'stage (pm/architect/test/dev/uat/review/archives…) / 环节（pm/architect/test/dev/uat/review/archives…）' },
				action: { type: 'string', description: 'action (write/run/approve/…) / 动作（write/run/approve/…）' },
				phase: { type: 'string', description: 'phase (optional) / 阶段（可选）' },
				note: { type: 'string', description: 'one-line fact (optional) / 一句话事实（可选）' },
				files: { type: 'array', items: { type: 'string' }, description: 'files involved (optional) / 涉及文件（可选）' },
				gate: { type: 'string', enum: ['gate0', 'gate1', 'gate2', 'gate4'], description: 'which Gate this record belongs to (for run / approve) / 本条归属哪个 Gate（run / approve 时用）' },
				command: { type: 'string', description: 'required for action=run: the gate command actually executed (verbatim; never hide the exit code behind a pipe) / action=run 必填：实际跑的门禁命令（原样，别用被管道掩盖退出码的写法）' },
				cmd: { type: 'string', description: 'deprecated alias of command (old master-document examples used cmd); use command for new records / 已弃用别名，等同 command（总纲旧例写作 cmd）；新记录请用 command' },
				exitCode: { type: 'integer', description: 'required for action=run: the real exit code (0=green; non-zero=red, i.e. a gap — never mask it) / action=run 必填：该命令的真实退出码（0=绿，非零=红即缺口，不得掩盖）' },
				artifact: { type: 'string', description: 'optional: evidence pointer (artifact path / report file) for human spot checks / 可选：证据指针（产物路径 / 报告文件），供人抽查' },
				via: { type: 'string', enum: ['human', 'ai-hosted'], description: 'for action=approve: whether this approval came from a human or an AI host. Real development allows human only; ai-hosted is limited to acceptance / regression harnesses and must be recorded / action=approve 时用：这个批准是人给的还是 AI 托管的。正式开发只许 human；ai-hosted 仅限验收 / 回归装置，且必须留痕' },
			},
			required: ['id', 'actor'],
			additionalProperties: false,
		},
		output: {
			schema: { type: 'object', additionalProperties: true },
			render: (_args, value) => [{ type: 'text', text: `journal OK: ${value.linesBefore} -> ${value.linesAfter} lines (+1) ${value.file}` }],
		},
		timeoutMs: 20_000,
		async execute(args, exec) {
			const T = t(repoLang(rootOf(exec)));
			const id = stringArg(args, 'id');
			const actor = stringArg(args, 'actor');
			if (id === undefined || !ID_PATTERN.test(id)) throw new Error(T('id 必填：需求包 ID', 'id is required: the package ID'));
			if (actor === undefined || actor.trim() === '') {
				throw new Error(T('actor 必填（journal 每行必须自带 actor）', 'actor is required (every journal line must carry its actor)'));
			}
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
					return near === undefined
						? `\`${k}\``
						: T(`\`${k}\`（是不是想写 \`${near}\`？）`, `\`${k}\` (did you mean \`${near}\`?)`);
				});
				throw new Error(
					T(
						`不认识的字段：${hints.join('、')} —— 本工具只接受 ${KNOWN_ARGS.join(' / ')}。` +
							`未声明的字段会被静默丢弃，所以这里直接拒绝；要记别的事实请写进 note。`,
						`unknown field(s): ${hints.join(', ')} — this tool only accepts ${KNOWN_ARGS.join(' / ')}. ` +
							`Undeclared fields used to be dropped silently, so they are rejected here; record any other fact in note.`,
					),
				);
			}
			// 门禁执行记录必须自带命令与退出码：没有退出码的「跑过了」正是总纲禁止的
			// 「用被掩盖的退出码作红绿判据」。不是门禁执行就别用 run（用 note / write）。
			if (action === 'run') {
				if (command === undefined) {
					throw new Error(T('action=run 必须带 command（原样记录实际跑的命令）', 'action=run requires command (the command actually run, verbatim)'));
				}
				if (exitCode === undefined) {
					throw new Error(
						T(
							'action=run 必须带 exitCode（整数退出码；0=绿、非零=红，不得掩盖）',
							'action=run requires exitCode (an integer; 0=green, non-zero=red — never mask it)',
						),
					);
				}
			}
			// 批准记录必须能回答「哪个 Gate」与「谁签的」：这两项缺失时，一条 approve 在事后
			// 等于什么都证明不了（存量仓库 9 条批准记录里 0 条有 gate / via，只能靠读自然语言）。
			if (action === 'approve') {
				if (gate === undefined) {
					throw new Error(
						T(
							'action=approve 必须带 gate（gate0 / gate1 / gate2 / gate4）：批准记录必须能回答「哪个 Gate」',
							'action=approve requires gate (gate0 / gate1 / gate2 / gate4): an approval record must answer "which Gate"',
						),
					);
				}
				if (!['gate0', 'gate1', 'gate2', 'gate4'].includes(gate)) {
					throw new Error(
						T(`gate 取值只许 gate0 / gate1 / gate2 / gate4（收到：${gate}）`, `gate must be one of gate0 / gate1 / gate2 / gate4 (got: ${gate})`),
					);
				}
				if (via === undefined) {
					throw new Error(
						T(
							'action=approve 必须带 via（human=人签；ai-hosted 仅限验收 / 回归装置）：批准记录必须能回答「谁签的」',
							'action=approve requires via (human=human-signed; ai-hosted only for acceptance / regression harnesses): an approval record must answer "who signed"',
						),
					);
				}
			}
			if (gate !== undefined && action !== 'run' && action !== 'approve') {
				throw new Error(
					T(
						'gate 只在 action=run / action=approve 时有意义（它标注这条记录归属哪个 Gate）',
						'gate only makes sense for action=run / action=approve (it tags which Gate the record belongs to)',
					),
				);
			}
			if (via !== undefined && action !== 'approve') {
				throw new Error(
					T('via 只在 action=approve 时有意义：它标注「这个批准是谁给的」', 'via only makes sense for action=approve: it records who gave the approval'),
				);
			}
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
			return journalAppend(rootOf(exec), id, record, repoLang(rootOf(exec)));
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
				// `skip`：源目录里不该被复制进来的子目录（英文镜像 `scaffold/en` 就靠它挡掉）。
				const relDir = toPosix(relative(dest, target));
				if (options.skip !== undefined && options.skip.has(relDir)) continue;
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
	if (!(await exists(src))) throw new Error(`包内资源缺失 / missing bundled resource: ${src}（安装可能不完整 / the install may be incomplete）`);
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

/** 从 AGENTS 模板里抽出「开发流程 / Development process」一节，供已有 AGENTS.md 的仓库人工并入。 */
async function agentsFlowSnippet(lang) {
	const name = lang === 'en' ? 'AGENTS.template.en.md' : 'AGENTS.template.md';
	const heading = lang === 'en' ? '## Development process' : '## 开发流程';
	const text = await readFile(join(PACKAGE_ROOT, name), 'utf8');
	const start = text.indexOf(heading);
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
	if (p === '') throw new Error(`${keyName} 不能为空 / must not be empty`);
	if (isAbsolute(p)) throw new Error(`${keyName} 必须是相对路径 / must be a relative path；收到绝对路径 / got absolute: ${raw}`);
	const abs = resolve(root, p);
	const rel = relative(root, abs);
	if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
		throw new Error(`${keyName} 不能越出工作区 / must stay inside the workspace（收到 / got ${raw}）`);
	}
	return rel.split('\\').join('/');
}

function initTool() {
	return {
		name: 'process_init',
		description: bi(
			'Initialize the process scaffold into the current workspace: bundled scaffold/** → <repo>/docs/process/**, scripts → <repo>/scripts/process/*.mjs, plus a project-level AGENTS.md pointer built from the template when AGENTS.md is missing (if it exists it is skipped and the section to merge is printed). By default it **only creates, never overwrites** (existing files are skipped and listed); with upgrade=true it **upgrades an initialized repo**: framework-owned files (master document / dispatch handbook / templates / gate scripts) are overwritten from the package and **backed up first as <file>.bak-<timestamp>**, while project-customizable files (PROJECT.md / ui/tokens.md / ui/recipe.md) are never overwritten — only their differences are reported for a human merge. Optional skills=true also drops the 9 generic role skills into <repo>/.dsh/skills/** for in-place customization (unchanged ones come from the plugin). It also writes the `docs/process/.process-kit.json` uninstall manifest recording exactly what init created (with hashes) so process_uninstall can clean up precisely without deleting files the user already had. `lang` picks the scaffold language (zh / en / auto — auto follows the manifest, then the repository docs, then zh).',
			'把流程骨架初始化到当前工作区：包内 scaffold/** → <仓库>/docs/process/**，脚本 → <仓库>/scripts/process/*.mjs，并在 AGENTS.md 缺失时按模板建一份项目级常驻指针（存在则跳过并给出待并入的段落）。默认**只创建不覆盖**（已存在的文件跳过并列出）；upgrade=true 时改为**升级已初始化的仓库**：框架自有文件（总纲 / 调度手册 / 模板 / 门禁脚本）按包内版本覆盖并**先备份为 <文件>.bak-<时间戳>**，项目可定制文件（PROJECT.md / ui/tokens.md / ui/recipe.md）永不覆盖、只报告差异供人合并。可选 skills=true 额外把 9 个通用角色技能落到 <仓库>/.dsh/skills/** 以便就地定制（不改则用插件自带版本）。同时写 `docs/process/.process-kit.json` 卸载清单，记录 init 真正创建的文件与哈希，供 `process_uninstall` 精确清理（不误删用户已有文件）。`lang` 选骨架语言（zh / en / auto —— auto 依次看卸载清单、仓库文档、回退 zh）。',
		),
		parameters: {
			type: 'object',
			properties: {
				scriptsDir: {
					type: 'string',
					description:
						'where the scripts land, default scripts/process; must be a dedicated subdirectory, not docs/process or its parent / 脚本落点，默认 scripts/process；必须是专用子目录，不能是 docs/process 或其父目录',
				},
				skills: {
					type: 'boolean',
					description: 'also drop role skills into .dsh/skills/ (default false) / 是否同时落地角色技能到 .dsh/skills/（默认 false）',
				},
				agents: {
					type: 'boolean',
					description:
						'ensure the project-level AGENTS.md pointer exists (default true; only created when missing, existing files are never rewritten) / 是否保证项目级常驻指针 AGENTS.md 存在（默认 true；只在缺失时创建，绝不改写已有文件）',
				},
				dryRun: {
					type: 'boolean',
					description: 'only list the files that would be created / updated, write nothing / 只列出将要创建 / 更新的文件，不写盘',
				},
				upgrade: {
					type: 'boolean',
					description:
						'upgrade mode: overwrite framework-owned files (backed up first), report project-customizable ones without touching them (default false) / 升级模式：覆盖框架自有文件（先备份），项目可定制文件只报告不覆盖（默认 false）',
				},
				lang: {
					type: 'string',
					enum: ['zh', 'en', 'auto'],
					description:
						'scaffold language: en for English projects, zh for Chinese; auto (default) follows the uninstall manifest, then the repository docs (AGENTS.md / README.md), then zh. Switching the language of an initialized repo = upgrade:true together with the new lang. / 骨架语言：英文项目传 en，中文传 zh；auto（默认）依次看卸载清单、仓库文档（AGENTS.md / README.md）、回退 zh。给已初始化的仓库换语言 = upgrade:true 配合新 lang。',
				},
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
				throw new Error(
				'scriptsDir 不能是 docs/process 或其父目录：脚本会混进流程产物，卸载时也可能误删别的文档；请用专用子目录（如 scripts/process、tools/process） / '
					+ 'scriptsDir must not be docs/process or its parent: scripts would mix into process artifacts and uninstall might delete other docs; use a dedicated subdirectory (e.g. scripts/process, tools/process)',
			);
			}
			if (!scriptsDir.includes('/') && BROAD_SCRIPTS_DIRS.has(scriptsDir)) {
				throw new Error(
				`scriptsDir 不能是顶层宽目录 ${scriptsDir}：卸载会整目录删，容易带走项目自己的文件；请用专用子目录（如 scripts/process） / `
					+ `scriptsDir must not be the broad top-level directory ${scriptsDir}: uninstall deletes the whole directory and would take the project's own files with it; use a dedicated subdirectory (e.g. scripts/process)`,
			);
			}
			const withSkills = args?.skills === true;
			const agents = args?.agents !== false;
			const dryRun = args?.dryRun === true;
			const upgrade = args?.upgrade === true;
			const stamp = `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`;
			const processDir = join(root, PROCESS_REL);
			const existingManifest = await readManifest(root);

			// 语言：zh / en / auto（auto = 清单记录的 → 目标仓库文档推断 → zh）。
			const rawLang = args?.lang === undefined ? 'auto' : String(args.lang).trim().toLowerCase();
			if (!['auto', 'zh', 'en'].includes(rawLang)) {
				throw new Error(
					`lang 只接受 zh / en / auto（收到：${args?.lang}） / lang accepts zh / en / auto only (got: ${args?.lang})`,
				);
			}
			const manifestLang =
				existingManifest?.lang === 'zh' || existingManifest?.lang === 'en' ? existingManifest.lang : null;
			const detectedLang = detectLangFromRepo(root) ?? 'zh';
			const resolvedLang = rawLang === 'auto' ? (manifestLang ?? detectedLang) : rawLang;
			const langSwitched = manifestLang !== null && manifestLang !== resolvedLang;
			const T = t(resolvedLang);
			const scaffoldSrc = resolvedLang === 'en' ? join(PACKAGE_ROOT, 'scaffold', 'en') : join(PACKAGE_ROOT, 'scaffold');
			if (resolvedLang === 'en' && !(await exists(scaffoldSrc))) {
				throw new Error(
					`包内缺少英文骨架 scaffold/en/：请升级 dsh-process-kit，或改用 lang: "zh" / scaffold/en/ is missing from this package: upgrade dsh-process-kit, or use lang: "zh"`,
				);
			}
			const agentsTemplateName = resolvedLang === 'en' ? 'AGENTS.template.en.md' : 'AGENTS.template.md';

			const created = [];
			const skipped = [];
			const updated = [];
			const manual = [];

			const scaffold = await copyTree(scaffoldSrc, processDir, {
				dryRun,
				stamp,
				// 中文骨架源里同时住着英文镜像 `scaffold/en/**`：不挡掉就会把整棵英文树复制进
				// 用户的 docs/process/en/（用户仓库里凭空多出一份另一种语言的骨架）。
				skip: new Set(resolvedLang === 'en' ? [] : ['en']),
				overwrite: upgrade || langSwitched ? (rel) => UPGRADE_OVERWRITE.has(rel) : undefined,
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
			if (upgrade || langSwitched) {
				for (const rel of UPGRADE_MANUAL) {
					const source = join(scaffoldSrc, rel);
					const target = join(processDir, rel);
					if (!(await exists(source)) || !(await exists(target))) continue;
					if (Buffer.compare(await readFile(source), await readFile(target)) !== 0) manual.push(`${PROCESS_REL}/${rel}`);
				}
			}

			// 角色技能：**只落当前语言那一份**，统一命名为 SKILL.md（项目就地定制从这份开始）。
			// 整个目录直接复制会把 SKILL.en.md 也带进用户仓库，造成两套并存、以后不知道改哪份。
			const skillsCreated = [];
			if (withSkills) {
				const skillsRoot = join(PACKAGE_ROOT, 'skills');
				const sourceName = resolvedLang === 'en' ? 'SKILL.en.md' : 'SKILL.md';
				for (const role of await skillDirs()) {
					const source = join(skillsRoot, role, sourceName);
					if (!(await exists(source))) continue;
					const rel = `${role}/SKILL.md`;
					const target = join(root, '.dsh', 'skills', rel);
					if (await exists(target)) {
						skipped.push(`.dsh/skills/${rel}`);
						continue;
					}
					if (!dryRun) {
						await mkdir(dirname(target), { recursive: true });
						await writeFile(target, await readFile(source, 'utf8'), 'utf8');
					}
					skillsCreated.push(rel);
					created.push(`.dsh/skills/${rel}`);
				}
			}

			// 项目级常驻指针。插件自己只能提供**框架级** systemPrompt 段；「本项目流程真源
			// 在哪」必须留在仓库里（随仓库版本化、团队共享）。AGENTS.md 缺失时按模板建一份，
			// 已存在则**绝不改写**，只把该并入的段落打印出来。
			let agentsSnippet = '';
			const hasAgents = await exists(join(root, 'AGENTS.md'));
			if (agents) {
				if (hasAgents) {
					agentsSnippet = await agentsFlowSnippet(resolvedLang);
					skipped.push(T('AGENTS.md（已存在，未改动）', 'AGENTS.md (already exists, untouched)'));
				} else {
					if (!dryRun) {
						await writeFile(join(root, 'AGENTS.md'), await readFile(join(PACKAGE_ROOT, agentsTemplateName), 'utf8'));
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
				const hashSource = (await exists(target)) ? target : join(PACKAGE_ROOT, 'skills', rel);
				createdSkillFiles[toPosix(rel)] = await sha256OfFile(hashSource);
			}
			let agentsRecord = existingManifest?.agents ?? null;
			if (agents && !hasAgents) {
				// dry-run 时 AGENTS.md 还没落盘，按将要写入的模板算哈希。
				const hashSource = dryRun ? join(PACKAGE_ROOT, agentsTemplateName) : join(root, 'AGENTS.md');
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
				lang: resolvedLang,
				processDir: PROCESS_REL,
				scriptsDir,
				agents: agentsRecord,
				skills: Object.keys(createdSkillFiles).length > 0 ? { dir: '.dsh/skills', createdFiles: createdSkillFiles } : (existingManifest?.skills ?? null),
			};
			const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
			const manifestChanged =
				existingManifest === null ||
				manifestFingerprint(existingManifest) !== manifestFingerprint(manifest) ||
				existingManifest?.lang !== resolvedLang;
			if (manifestChanged && !dryRun) {
				await writeFile(join(processDir, MANIFEST_NAME), manifestText, 'utf8');
			}

			const lines = [];
			lines.push(
				dryRun
					? T('# process_init（dry-run，未写盘）', '# process_init (dry-run, nothing written)')
					: T('# process_init 完成', '# process_init complete'),
			);
			lines.push(`root: ${root}`);
			lines.push(T(`language: ${resolvedLang}`, `language: ${resolvedLang}`));
			if (rawLang === 'auto') {
				lines.push(
					T(
						`  （lang=auto → ${resolvedLang}：${manifestLang !== null ? '沿用卸载清单' : `按仓库文档推断，回退值 zh`}；要确定就显式传 lang）`,
						`  (lang=auto → ${resolvedLang}: ${manifestLang !== null ? 'from the uninstall manifest' : 'inferred from repository docs, falling back to zh'}; pass lang explicitly to pin it)`,
					),
				);
			}
			if (langSwitched) {
				lines.push(
					T(
						`⚠ 语言从 ${manifestLang} 切到 ${resolvedLang}：框架自有文件已按 ${resolvedLang} 覆盖（旧版已备份），项目可定制文件未覆盖。`,
						`⚠ language switched from ${manifestLang} to ${resolvedLang}: framework-owned files were overwritten in ${resolvedLang} (old versions backed up); project-customizable files were not touched.`,
					),
				);
			}
			if (manifestChanged) {
				lines.push(
					T(
						`卸载清单：${MANIFEST_REL}${dryRun ? '（dry-run 未写盘）' : '（已写入）'}`,
						`uninstall manifest: ${MANIFEST_REL}${dryRun ? ' (dry-run, not written)' : ' (written)'}`,
					),
				);
			}
			lines.push('');
			lines.push(T(`新建（${created.length}）：`, `created (${created.length}):`));
			for (const f of created) lines.push(`  + ${f}`);
			if (updated.length > 0) {
				lines.push('');
				lines.push(T(`${dryRun ? '将更新' : '已更新'}（${updated.length}）：`, `${dryRun ? 'would update' : 'updated'} (${updated.length}):`));
				for (const f of updated) {
					lines.push(dryRun ? `  ~ ${f}` : T(`  ~ ${f}（旧版备份 ${f}.bak-${stamp}）`, `  ~ ${f} (old version backed up as ${f}.bak-${stamp})`));
				}
			}
			if (skipped.length > 0) {
				lines.push('');
				lines.push(T(`已存在、跳过（${skipped.length}）：`, `already present, skipped (${skipped.length}):`));
				for (const f of skipped) lines.push(`  = ${f}`);
			}
			if (manual.length > 0) {
				lines.push('');
				lines.push(T(`需人工比对（${manual.length}，项目可定制，升级不覆盖）：`, `needs manual merge (${manual.length}; project-customizable, never overwritten):`));
				for (const f of manual) lines.push(`  ? ${f}`);
				lines.push(
					T(
						`  对照包内模板：${scaffoldSrc}/<同名文件>（直接 diff 即可）`,
						`  compare against the bundled template: ${scaffoldSrc}/<same file name> (just diff them)`,
					),
				);
			}
			if (upgrade) {
				const mine = await processVersionOf(join(processDir, 'PROJECT.md'));
				const theirs = await processVersionOf(join(scaffoldSrc, 'PROJECT.md'));
				if (mine !== null && theirs !== null && mine !== theirs) {
					lines.push('');
					lines.push(
						T(
							`⚠ ${PROCESS_REL}/PROJECT.md 的 processVersion 是 ${mine}，包内模板是 ${theirs} —— 该文件永不自动覆盖，请对照包内模板手工合并。`,
							`⚠ ${PROCESS_REL}/PROJECT.md has processVersion ${mine} but the bundled template has ${theirs} — that file is never overwritten automatically; merge it by hand against the bundled template.`,
						),
					);
				}
			}
			lines.push('');
			if (upgrade) {
				lines.push(T('下一步：', 'next steps:'));
				if (manual.length > 0) {
					lines.push(
						T(
							`1. 手工合并「需人工比对」的文件（尤其 ${PROCESS_REL}/PROJECT.md）：对照包内模板逐段并入，不要整份覆盖。`,
							`1. Merge the "needs manual merge" files (especially ${PROCESS_REL}/PROJECT.md) section by section against the bundled template — do not copy the whole file over.`,
						),
					);
					lines.push(
						T(
							`2. 核对备份 \`<文件>.bak-${stamp}\`${dryRun ? '（dry-run 未写盘，落地后才产生）' : ''}，确认升级无误后再删。`,
							`2. Check the backups \`<file>.bak-${stamp}\`${dryRun ? ' (dry-run: created only when you apply it)' : ''} and delete them once the upgrade is verified.`,
						),
					);
				} else {
					lines.push(T('1. 无需人工合并：项目可定制文件与包内模板一致。', '1. No manual merge needed: project-customizable files match the bundled template.'));
					if (updated.length > 0) {
						lines.push(
							T(
								`2. 核对备份 \`<文件>.bak-${stamp}\`${dryRun ? '（dry-run 未写盘，落地后才产生）' : ''}，确认升级无误后再删。`,
								`2. Check the backups \`<file>.bak-${stamp}\`${dryRun ? ' (dry-run: created only when you apply it)' : ''} and delete them once the upgrade is verified.`,
							),
						);
					}
				}
			} else {
				if (updated.length === 0 && skipped.some((f) => f.startsWith(PROCESS_REL) || f.startsWith(scriptsDir))) {
					lines.push(
						T(
							'提示：本仓库已初始化过（框架文件已存在）。要升级到包内版本，跑 `process_init({ upgrade: true, dryRun: true })` 先预览，再去掉 dryRun 落地。',
							'note: this repository is already initialized (framework files exist). To upgrade to the bundled version, run `process_init({ upgrade: true, dryRun: true })` to preview, then drop dryRun to apply.',
						),
					);
					lines.push('');
				}
				lines.push(T('下一步：', 'next steps:'));
				lines.push(
					T(
						`1. 编辑 ${PROCESS_REL}/PROJECT.md —— **最小可用只填三节**：§1 端与目录、§2 命令槽（至少「快速验证」与「journal 追加」两行）、§3 产物属主表。§4 的每个键都有默认值，可先用着；§5 / §6 等到要跑 UAT 再填；§7 整节写「不适用」。`,
						`1. Edit ${PROCESS_REL}/PROJECT.md — **the minimum viable set is three sections**: §1 clients and directories, §2 command slots (at least "fast verification" and "journal append"), §3 the artifact ownership table. Every §4 key has a default, so you can keep them as-is; fill §5 / §6 only when you are about to run UAT; write "not applicable" for all of §7.`,
					),
				);
				lines.push(
					T(
						`   注：§3 不填会让落点门禁直接 exit 1（刻意不静默放行），不是"以后再配也行"的那类可选项。`,
						`   note: leaving §3 empty makes the write-target gate exit 1 outright (deliberately no silent pass) — it is not the "configure it later" kind of option.`,
					),
				);
				lines.push(
					T(
						`2. **第一个包建议走快速路径试水**：在需求核对件写 \`flow: fast\`，人签 Gate0 后直接派 dev + 存量回归 —— 先确认这套流程在你的项目里顺手，再上全流程（PRD + 契约 + 四道 Gate）。`,
						`2. **Run the first package through the fast path as a trial**: write \`flow: fast\` in the requirement check; after the human signs Gate0, dispatch dev directly plus the existing regression suite — confirm the flow fits your project before going full (PRD + contract + four Gates).`,
					),
				);
				lines.push(
					T(
						`   注：快速路径同样要核对件与 Gate0（没有绕过核对件的免流程路径）；触及 schema / RBAC / 金额 / 对外接口必须退回全流程。`,
						`   note: the fast path still needs a requirement check and Gate0 (there is no process-free route); anything touching schema / RBAC / money / a public interface must go back to the full flow.`,
					),
				);
				lines.push(
					T(
						`3. 在 package.json 加脚本（示例）："process:journal": "node ${scriptsDir}/journal-append.mjs"、"check:rules": "node ${scriptsDir}/check-rules.mjs"、"check:artifact-paths": "node ${scriptsDir}/check-artifact-paths.mjs"、"check:ui-prototype": "node ${scriptsDir}/check-ui-prototype.mjs --pkg <ID>"。`,
						`3. Add scripts to package.json (examples): "process:journal": "node ${scriptsDir}/journal-append.mjs", "check:rules": "node ${scriptsDir}/check-rules.mjs", "check:artifact-paths": "node ${scriptsDir}/check-artifact-paths.mjs", "check:ui-prototype": "node ${scriptsDir}/check-ui-prototype.mjs --pkg <ID>".`,
					),
				);
				lines.push(
					T(
						'4. 角色技能已由插件自带（rank 600，项目 .dsh/skills 可覆盖）；需要就地改就再跑一次 process_init 并带 skills=true。',
						'4. Role skills ship with the plugin (rank 600; a project .dsh/skills copy overrides them). To customize them in place, run process_init again with skills=true.',
					),
				);
			}
			if (agents) {
				lines.push('');
				if (hasAgents) {
					lines.push(
						T(
							'⚠ AGENTS.md 已存在，未改动。请把下面这段并入其流程一节（或确认已有等价内容）——',
							'⚠ AGENTS.md already exists and was not touched. Merge the section below into its process section (or confirm an equivalent one is there) —',
						),
					);
					lines.push(
						T(
							'  它才是「每轮上下文都在场」的项目级指针，插件只提供框架级提示，替不了它：',
							'  that is the project-level pointer that is present in every round of context; the plugin only offers framework-level hints and cannot replace it:',
						),
					);
					lines.push('');
					lines.push(agentsSnippet);
				} else {
					lines.push(
						T(
							'已按模板新建 AGENTS.md（项目级常驻指针）：其中的「开发流程」节指向 docs/process，',
							'Created AGENTS.md from the template (the project-level pointer): its "Development process" section points at docs/process,',
						),
					);
					lines.push(
						T(
							'「项目概览 / 快速命令 / 目录结构」三节留有占位符，请填。',
							'and the "Project overview / Quick commands / Directory layout" sections still hold placeholders — fill them in.',
						),
					);
				}
			}
			return {
				created,
				skipped,
				updated,
				manual,
				upgrade,
				dryRun,
				lang: resolvedLang,
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
		const variants = ['SKILL.md', 'SKILL.en.md'].map((name) => join(PACKAGE_ROOT, 'skills', role, name));
		const hash = await sha256OfFile(target);
		let same = false;
		for (const source of variants) {
			if ((await exists(source)) && hash === (await sha256OfFile(source))) same = true;
		}
		if (same) matches.push({ rel, abs: target });
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
		// 两种语言的模板都算「插件产物」：切过语言的仓库留下的是另一份。
		for (const name of ['AGENTS.template.md', 'AGENTS.template.en.md']) {
			const template = await readFile(join(PACKAGE_ROOT, name), 'utf8');
			if (stripUninstall(current) === stripUninstall(template)) return true;
		}
		return false;
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
		description: bi(
			'Remove the process content this plugin placed in the current repository: deletes docs/process/** and scripts/process/** (or the scriptsDir chosen at init) plus any AGENTS.md / .dsh/skills/<role>/SKILL.md that process_init created and nobody modified (or that match the plugin template byte for byte). Defaults to dryRun=true, reporting only; it only deletes after the human explicitly confirms with confirm:true and dryRun:false. It backs things up to the system temp dir first (disable with backup=false); generated files that were modified are kept by default, force=true deletes them (only for files init created — files with your own content are never deleted). Product source/tests and git history are untouched, package.json is not edited (it only reports scripts still pointing at deleted files).',
			'卸载本插件落在当前仓库的流程内容：删除 docs/process/** 与 scripts/process/**（或 init 时自定义的 scriptsDir），并删除 process_init 创建且未被修改过（或与插件模板逐字一致）的 AGENTS.md / .dsh/skills/<角色>/SKILL.md。默认 dryRun=true，只报告不删除；必须由人明确确认后传 confirm:true 且 dryRun:false 才执行。默认先备份到系统临时目录（backup=false 可关）；修改过的生成文件默认保留，force=true 才删（只对 init 创建的文件生效，绝不删含自定义内容的用户文件）。不改产品源码/测试，不删 git 历史，不改 package.json（只会报告仍指向已删脚本的命令）。',
		),
		parameters: {
			type: 'object',
			properties: {
				dryRun: {
					type: 'boolean',
					description: 'default true: only list what would be deleted / preserved, write nothing; pass false once confirmed / 默认 true：只列出将删除 / 保留的内容，不写盘。确认后传 false',
				},
				confirm: {
					type: 'boolean',
					description: 'requires explicit human consent; missing or false refuses to actually delete / 必须由人明确同意；不传或 false 时拒绝真正删除',
				},
				force: {
					type: 'boolean',
					description:
						'delete AGENTS.md / skill copies that init created but were modified later (never applies to files you already had) / 删除 init 创建但后来被修改过的 AGENTS.md / 技能副本（不作用于用户已有文件）',
				},
				backup: {
					type: 'boolean',
					description: 'back up to the system temp dir before deleting (default true; if the backup fails, nothing is deleted) / 删除前备份到系统临时目录（默认 true；备份失败则不删）',
				},
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
			// 语言要在**删之前**解析：清单与 PROJECT.md 都在 docs/process 里，删完就没了。
			const T = t(repoLang(root));
			const dryRun = args?.dryRun !== false;
			const confirm = args?.confirm === true;
			const force = args?.force === true;
			const backup = args?.backup !== false;
			const manifest = await readManifest(root);
			let scriptsRel = DEFAULT_SCRIPTS_REL;
			if (manifest?.scriptsDir !== undefined) {
				if (typeof manifest.scriptsDir !== 'string') throw new Error(
					T(
						'卸载清单里的 scriptsDir 不是字符串：拒绝按它删任何目录',
						'scriptsDir in the uninstall manifest is not a string: refusing to delete any directory based on it',
					),
				);
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
				notes.push(
					T(
						`卸载清单里的 scriptsDir（${scriptsRel}）是宽目录 / docs/process 的父目录：为免误删别的文件，未按目录删除；请人工确认后再处理`,
						`scriptsDir in the uninstall manifest (${scriptsRel}) is a broad directory or the parent of docs/process: not deleted as a directory to avoid wiping other files — handle it by hand`,
					),
				);
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
					else preserved.push(T('AGENTS.md（init 创建但已修改；确认不再需要可 force:true）', 'AGENTS.md (created by init but modified since; pass force:true if you no longer need it)'));
				} else if (exactTemplate) {
					// 老安装没有清单，或清单只记了「本来就有」：逐字模板 = 没有用户内容，可安全删。
					agentsDelete = true;
				} else if (record?.created === false) {
					preserved.push(T('AGENTS.md（不是 process_init 创建，保留）', 'AGENTS.md (not created by process_init — kept)'));
				} else if (manifest === null) {
					preserved.push(
						T(
							'AGENTS.md（无卸载清单，无法证明是 init 创建，保留；确认要删请手工处理）',
							'AGENTS.md (no uninstall manifest, cannot prove init created it — kept; delete by hand if you are sure)',
						),
					);
				} else {
					preserved.push(T('AGENTS.md（清单未记录为 init 创建，保留）', 'AGENTS.md (the manifest does not record init creating it — kept)'));
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
						notes.push(T(`卸载清单里的技能路径越界，已跳过：${rel}`, `skill path in the uninstall manifest escapes the skills dir, skipped: ${rel}`));
						continue;
					}
					if (!(await exists(abs))) continue;
					const current = await sha256OfFile(abs);
					if (current === hash || force) skillDeletes.push({ rel, abs });
					else preserved.push(T(`.dsh/skills/${rel}（init 创建但已修改；确认不再需要可 force:true）`, `.dsh/skills/${rel} (created by init but modified since; pass force:true if you no longer need it)`));
				}
				const unknown = (await listFilesUnder(skillsBase)).filter((rel) => !recorded.has(rel));
				if (unknown.length > 0) {
					notes.push(
						T(
							`.dsh/skills 下 ${unknown.length} 个文件不在卸载清单中，保留：${unknown.join(', ')}`,
							`${unknown.length} file(s) under .dsh/skills are not in the uninstall manifest — kept: ${unknown.join(', ')}`,
						),
					);
				}
			} else if (await exists(skillsBase)) {
				const legacy = await legacySkillMatches(skillsBase);
				skillDeletes.push(...legacy.matches);
				if (legacy.matches.length > 0) {
					notes.push(
						T(
							`旧安装没有技能清单：按与插件版本逐字一致清理 ${legacy.matches.length} 个技能副本`,
							`legacy install without a skill manifest: removing ${legacy.matches.length} skill copies that match the plugin byte for byte`,
						),
					);
				}
				if (legacy.different.length > 0) {
					notes.push(
						T(
							`保留 ${legacy.different.length} 个与插件版本不同（可能已定制）的技能副本：${legacy.different.join(', ')}`,
							`kept ${legacy.different.length} skill copy(ies) that differ from the plugin version (probably customized): ${legacy.different.join(', ')}`,
						),
					);
					for (const rel of legacy.different) {
						preserved.push(
							T(
								`.dsh/skills/${rel}（与包内版本不同，保留；确认不要可手工删）`,
								`.dsh/skills/${rel} (differs from the bundled version — kept; delete by hand if unwanted)`,
							),
						);
					}
				}
				const known = new Set([...legacy.matches, ...legacy.different.map((rel) => ({ rel }))].map((item) => toPosix(item.rel)));
				const unknown = (await listFilesUnder(skillsBase)).filter((rel) => !known.has(rel));
				if (unknown.length > 0) {
					notes.push(
						T(
							`.dsh/skills 下 ${unknown.length} 个文件不在已知角色模板中，保留：${unknown.join(', ')}`,
							`${unknown.length} file(s) under .dsh/skills are not a known role template — kept: ${unknown.join(', ')}`,
						),
					);
				}
				if (legacy.matches.length === 0 && legacy.different.length === 0 && unknown.length === 0) {
					notes.push(T('.dsh/skills 下没有可识别的插件技能副本，未改动', 'no recognizable plugin skill copies under .dsh/skills — nothing touched'));
				}
			}

			const dirDescriptions = [];
			for (const d of dirs) {
				dirDescriptions.push(
					T(
						`${d.rel}/**（${await countFilesUnder(d.abs)} 个文件）`,
						`${d.rel}/** (${await countFilesUnder(d.abs)} files)`,
					),
				);
			}
			const targetCount = dirs.length + (agentsDelete ? 1 : 0) + skillDeletes.length;
			const scriptKeys = await processScriptKeys(root, scriptsRel);

			const lines = [];
			lines.push(dryRun ? T('# process_uninstall（dry-run，未删除）', '# process_uninstall (dry-run, nothing deleted)') : T('# process_uninstall 完成', '# process_uninstall complete'));
			lines.push(`root: ${root}`);
			lines.push(
				manifest === null
					? T(
							'卸载清单：无（旧安装；按目录 + 模板识别，保守处理）',
							'uninstall manifest: none (legacy install; identified by directory + template, handled conservatively)',
						)
					: T(`卸载清单：${MANIFEST_REL}（v${manifest.version ?? '?'}）`, `uninstall manifest: ${MANIFEST_REL} (v${manifest.version ?? '?'})`),
			);
			lines.push('');
			if (dirDescriptions.length > 0) {
				lines.push(dryRun ? T('将删除目录：', 'directories to delete:') : T('已删除目录：', 'deleted directories:'));
				for (const d of dirDescriptions) lines.push(`  - ${d}`);
			}
			if (agentsDelete) {
				lines.push(
					T(
						`${dryRun ? '将删除' : '已删除'}：AGENTS.md（init 创建）`,
						`${dryRun ? 'will delete' : 'deleted'}: AGENTS.md (created by init)`,
					),
				);
			}
			if (skillDeletes.length > 0) {
				lines.push(dryRun ? T('将删除技能副本：', 'skill copies to delete:') : T('已删除技能副本：', 'deleted skill copies:'));
				for (const s of skillDeletes) lines.push(`  - .dsh/skills/${s.rel}`);
			}
			if (targetCount === 0) lines.push(T('未发现可清理的插件流程内容。', 'no plugin process content found to clean up.'));
			if (preserved.length > 0) {
				lines.push('');
				lines.push(T('保留（需人工确认）：', 'preserved (needs a human decision):'));
				for (const p of preserved) lines.push(`  = ${p}`);
			}
			if (notes.length > 0) {
				lines.push('');
				for (const n of notes) lines.push(`  ⚠ ${n}`);
			}
			if (scriptKeys.length > 0) {
				lines.push('');
				lines.push(
					T(
						`package.json 仍有 ${scriptKeys.length} 条指向 ${scriptsRel}/ 的命令（本工具不改 package.json，请手工删）：`,
						`package.json still has ${scriptKeys.length} script(s) pointing at ${scriptsRel}/ (this tool does not edit package.json — remove them by hand):`,
					),
				);
				lines.push(`  ${scriptKeys.join(' / ')}`);
			}
			lines.push('');
			lines.push(
				T(
					'不包含：产品源码 / 测试 / git 历史；删除是工作区改动，需要你自己提交。',
					'not touched: product source / tests / git history; the deletions are working-tree changes you commit yourself.',
				),
			);
			if (targetCount === 0) {
				return { dryRun, manifest: MANIFEST_REL, removed, preserved, backupDir: null, report: lines.join('\n') };
			}
			if (dryRun) {
				lines.push('');
				lines.push(
					T(
						'下一步：由人明确确认后跑 process_uninstall({ confirm: true, dryRun: false })；默认先备份到系统临时目录。',
						'next: once the human explicitly confirms, run process_uninstall({ confirm: true, dryRun: false }); it backs up to the system temp dir by default.',
					),
				);
				return { dryRun, manifest: MANIFEST_REL, removed, preserved, backupDir: null, report: lines.join('\n') };
			}
			if (!confirm) {
				throw new Error(
					T(
						'未确认卸载：请先 dryRun 预览，由人明确同意后再传 confirm:true、dryRun:false。',
						'uninstall not confirmed: preview with dryRun first, then pass confirm:true and dryRun:false once the human explicitly agrees.',
					),
				);
			}

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
				lines.push(T(`备份：${backupDir}（系统临时目录；确认无误后可删）`, `backup: ${backupDir} (system temp dir; delete it once verified)`));
			} else {
				lines.push('');
				lines.push(T('备份：未做（backup=false）；删除后不可从本工具恢复。', 'backup: skipped (backup=false); deletions cannot be restored by this tool.'));
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
			lines.push(T(`已清理 ${removed.length} 项。`, `cleaned up ${removed.length} item(s).`));
			lines.push(
				T(
					'下一步：提交这次删除；如不再使用插件，先从 DSH 插件列表卸载（`npm uninstall` / 插件管理器）。',
					'next: commit these deletions; if you are done with the plugin, uninstall it from the DSH plugin list (`npm uninstall` / the plugin manager).',
				),
			);
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

/**
 * 技能语言：显式 `PROCESS_KIT_LANG` → 当前工作区（`process.cwd()`）的流程语言 → zh。
 *
 * 技能目录本来就**按 cwd 缓存**（见 `skillsEnabled` 的注释），所以这里用 cwd 推断与它同一口径；
 * 项目要钉死语言就在 `PROJECT.md` 或 `.process-kit.json` 里写 `lang`，不用靠环境变量。
 */
function skillLang() {
	return resolveLang(process.cwd());
}

/** 该角色的技能文件：英文仓库优先 `SKILL.en.md`，缺失则回退中文源。 */
async function skillFile(dir, lang) {
	if (lang === 'en') {
		const en = join(PACKAGE_ROOT, 'skills', dir, 'SKILL.en.md');
		if (await exists(en)) return en;
	}
	return join(PACKAGE_ROOT, 'skills', dir, 'SKILL.md');
}

/** 打包技能 provider：列表与加载都直接读包内文件。 */
function skillProvider() {
	return {
		name: SKILL_PROVIDER,
		async list() {
			if (!skillsEnabled()) return [];
			const candidates = [];
			const lang = skillLang();
			for (const dir of await skillDirs()) {
				const file = await skillFile(dir, lang);
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
			const file = await skillFile(dir, skillLang());
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
					'## Development process (docs/process) / 开发流程（docs/process）',
					'If this workspace has initialized `docs/process/` (README.md + PROJECT.md), run feature work through that single-person development pipeline. / 当前工作区若已初始化 `docs/process/`（含 README.md 与 PROJECT.md），即按该流程执行单人开发协作流水线。',
					'- Call process_status first on every wake-up/resume for the state-machine snapshot and next action — never rely on chat history; if not initialized, use process_init to lay down the scaffold; to stop using it, preview with process_uninstall dryRun and clean up after the human confirms. / 每轮唤醒/续跑先调用 process_status 取状态机快照与下一步动作，不依赖聊天历史；未初始化时可用 process_init 落地骨架；不想继续用可先 dryRun 预览、人确认后调 process_uninstall 清理流程载体。',
					'- Gate0/1/2/4 are mandatory stop points and only a human may approve them; use the two-part format for everything you tell the human (✅ what was done / ❓ what still needs a decision) — gate_summary renders the skeleton. / Gate0/1/2/4 是必停点，只有人能 approve；对人的一切输出用两段式（✅ 完成了什么 / ❓ 还需要裁定什么），可用 gate_summary 生成骨架。',
					'- **Language**: answer the human and write artifacts in the language recorded by the process — `lang` in `docs/process/.process-kit.json` (else `lang:` in PROJECT.md; default zh). Do not mix languages inside one document. / **语言**：与人的对话与产物的语言以流程记录为准 —— `docs/process/.process-kit.json` 的 `lang`（其次 PROJECT.md 的 `lang:`；默认 zh），同一份文档内不得中英混排。',
					'- The journal is append-only: use process_journal (machine time), never read-modify-write it by hand. / journal 只追加不覆写：用 process_journal（机器时间），禁止手工读-改-写。',
					'- Roles come from the same-named skills bundled with this plugin (product-manager / architect / ui-designer / test-agent / dev-agent / uat-agent / code-review-agent / security-review-agent / logic-review-agent); when dispatching, have the subagent read the skill — do not restate role duties in the prompt. / 角色由本插件自带的同名技能提供（product-manager / architect / ui-designer / test-agent / dev-agent / uat-agent / code-review-agent / security-review-agent / logic-review-agent）；派单时让 subagent 读对应技能，不要在提示里复述角色职责。',
					'- One package per repository at a time; to parallelize, open a separate session and first compare write targets on the coordination board (PROJECT.md §1) — stop and report if they overlap, never force it. / 同一仓库同一时刻只推进一个包；要并行就开独立 session，且先看协调板（PROJECT.md §1）比对落点，有交集停下报人，不硬开工。',
					'- git is read-only in a session: no commit / no add -A / no push — archiving = the human commits; exceptions need explicit human authorization in that round. / git 只读：session 不 commit / 不 add -A / 不 push —— 默认归档 = 人提交；例外必须由人当轮明确授权。',
					'- Role boundaries, the state machine and the gates are defined solely by docs/process/README.md; project adaptation lives in docs/process/PROJECT.md. This section is only a reminder and never restates the rules. / 角色硬边界、状态机与门禁以 docs/process/README.md 为唯一真源，项目适配见 docs/process/PROJECT.md；本节只做提醒，不复述规则。',
				].join('\n'),
			}),
		'process-kit: wake section',
	);
}

export { apply, inject, name };
