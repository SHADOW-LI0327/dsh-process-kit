/**
 * 通用单人开发流程框架（dsh-process-kit），服务端部分（在 dsh 进程里跑）。
 *
 * 四件东西：
 *
 * - **角色技能**：把包内 `skills/<name>/SKILL.md` 通过 `ctx.skills.registerProvider`
 *   注册为 rank 600 的打包技能（DSH 官方定义的 bundled 档）——**安装即得基础
 *   subagent**，默认在所有工作区广播（`PROCESS_KIT_SKILLS=off` 可关）。项目自己的
 *   `.dsh/skills/**`（rank 100/200）永远覆盖它，所以「插件给基线、项目可覆盖」。
 * - **三个流程工具**：`process_status`（扫 frontmatter 出状态机快照与下一步动作）、
 *   `gate_summary`（两段式 Gate 摘要骨架）、`process_journal`（安全追加 journal，
 *   语义与仓库侧 `scripts/process/journal-append.mjs` 对等）。
 * - **初始化工具 `process_init`**：把包内 `scaffold/**` 落到目标仓库
 *   `docs/process/**`、`scripts/*.mjs` 落到 `scripts/process/**`；只创建、不覆盖。
 * - **只读看板**：`GET /process-kit` 供页面部分（在网页里跑）渲染右下角状态看板。
 *
 * 设计红线：**目标仓库的 `docs/process/**` 文件是唯一真源**。本插件不另存状态，
 * 每次调用现读；无流程目录的仓库一律返回 not-found，初始化也只增不改。
 *
 * @module dsh-process-kit
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cordis function-plugin name. */
const name = 'process-kit';

/**
 * 硬依赖：工具注册、系统提示、浏览器路由与请求栅栏、会话表（看板定位工作区）。
 * `skills` 走可选注入（`ctx.inject`），缺少技能服务的组合里工具与看板照常工作。
 */
const inject = ['tools', 'systemPrompt', 'webServer', 'connection', 'sessions', 'sessionQuery'];

/** 看板轮询的只读路由。 */
const ROUTE = '/process-kit';

/** 相对工作区根的流程目录（框架自身约定）。 */
const PROCESS_REL = 'docs/process';

/** 打包技能的优先级：DSH 定义的 bundled 档（数值越大优先级越低）。 */
const BUNDLED_SKILL_RANK = 600;

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

/** 状态的看板配色分类。 */
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
		return { short: '起草核对件', gate: 'Gate0', action: 'input/ 有原料但无核对件：主控起草需求核对件后停等 Gate0' };
	}
	if (!prd) {
		if (check.gate0 === 'approved' && check.flow === 'fast') {
			return {
				short: '快速路径：直派 dev',
				gate: null,
				action:
					'核对件已裁定快速路径（flow: fast）：不派 pm、不产生 Gate1/Gate2；直接派 dev 实现 + 存量回归，结论记 journal。若实际触及 schema/RBAC/金额/对外接口 ⇒ 退回全流程',
			};
		}
		if (check.gate0 === 'approved') {
			return { short: '调 pm', gate: 'Gate1', action: 'gate0 已过：调 pm 出 PRD + 契约 + 设计与说明；触及 UI 的包再调 ui-designer 出 UI 规格，随后停等 Gate1' };
		}
		if (check.gate0 === 'rejected') {
			return { short: '修订核对件', gate: 'Gate0', action: '按人裁定修订核对件，重新停等 Gate0' };
		}
		return { short: '等 Gate0', gate: 'Gate0', action: '停等 Gate0 人签（核对件 frontmatter gate0: approved）' };
	}
	if (prd.gate1 === 'pending') return { short: '等 Gate1', gate: 'Gate1', action: '停等 Gate1 人签（gate1: approved）' };
	if (prd.gate1 === 'rejected') return { short: '修订三件套', gate: 'Gate1', action: '按驳回意见修订 PRD/契约/设计与说明（触及 UI 的包含 UI 规格），重等 Gate1' };
	if (prd.gate2 === 'pending') {
		return { short: '调 test 写红', gate: 'Gate2', action: '调 test 生成测试 + 红灯归因，随后停等 Gate2' };
	}
	if (prd.gate2 === 'rejected') return { short: '修订判据', gate: 'Gate2', action: '按驳回意见修订测试/判据，重等 Gate2' };
	switch (prd.status) {
		case 'red':
			return { short: '调 dev 实现', gate: null, action: 'gate2 已过：调 dev 实现到绿，status → implementing' };
		case 'implementing':
			return { short: 'test 独立复跑', gate: null, action: '切片循环；全部完成后由 test 独立复跑快速验证，status → uat' };
		case 'uat':
			if (prd.gate4 === 'approved') {
				return { short: '收口', gate: null, action: 'gate4 已签：落 status=done 并发收口通知' };
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
	if (!prd) return;
	const where = `${pkg.id}`;
	if (prd.status === 'frozen' && prd.gate1 !== 'approved') {
		warnings.push(`${where}: status=frozen 但 gate1=${prd.gate1}（frozen 定义为 Gate1 已过，两处需一起改）`);
	}
	if (prd.gate2 === 'approved' && ['draft', 'frozen'].includes(prd.status)) {
		warnings.push(`${where}: gate2=approved 但 status=${prd.status}（应已进 red/implementing）`);
	}
	if (prd.gate4 === 'approved' && prd.status !== 'done') {
		warnings.push(`${where}: gate4=approved 但 status=${prd.status}（应落 done 并通知）`);
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
	for (const file of inputFiles) {
		if (!file.endsWith('.md') || file.startsWith('_')) continue;
		const fm = await readFrontmatter(join(dir, 'input', file));
		if (fm !== null && fm.kind === 'requirement-check' && ID_PATTERN.test(fm.id ?? '')) {
			checks.set(fm.id, {
				file: `${PROCESS_REL}/input/${file}`,
				status: fm.status ?? 'unknown',
				gate0: fm.gate0 ?? 'pending',
				flow: fm.flow ?? 'full',
			});
		} else {
			rawInputs.push(file);
		}
	}

	/** PRD：prd/<ID>.md（模板与杂项跳过）。 */
	const prds = new Map();
	for (const file of prdFiles) {
		if (!file.endsWith('.md') || file.startsWith('_')) continue;
		const fm = await readFrontmatter(join(dir, 'prd', file));
		if (fm === null || fm.id === undefined || !ID_PATTERN.test(fm.id)) continue;
		if (prds.has(fm.id)) continue;
		prds.set(fm.id, {
			file: `${PROCESS_REL}/prd/${file}`,
			status: fm.status ?? 'unknown',
			gate1: fm.gate1 ?? 'pending',
			gate2: fm.gate2 ?? 'pending',
			gate4: fm.gate4 ?? 'pending',
			prdVersion: fm.prdVersion,
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
	const packages = [];
	const warnings = [];
	for (const id of ids) {
		const check = checks.get(id) ?? null;
		const prd = prds.get(id) ?? null;
		const journalPath = join(dir, 'prd', `${id}.journal.jsonl`);
		const artifacts = {
			design: (await exists(join(dir, 'prd', `${id}-design.md`))) ? `${PROCESS_REL}/prd/${id}-design.md` : null,
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
				journal = {
					file: `${PROCESS_REL}/prd/${id}.journal.jsonl`,
					lines: lines.length,
					lastAt: typeof last?.at === 'string' ? last.at : null,
					lastActor: typeof last?.actor === 'string' ? last.actor : null,
					lastStep: typeof last?.step === 'string' ? last.step : null,
				};
			} catch {
				journal = { file: `${PROCESS_REL}/prd/${id}.journal.jsonl`, lines: -1, lastAt: null, lastActor: null, lastStep: null };
			}
		}
		const pkg = {
			id,
			status: prd?.status ?? (check ? `核对件:${check.status}` : 'unknown'),
			flow: check?.flow ?? null,
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
		pkg.next = nextAction(pkg);
		pkg.statusClass = statusClass(prd?.status ?? 'unknown');
		packages.push(pkg);
	}
	if (rawInputs.length > 0) {
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
			rawInputs,
			next: { short: '起草核对件', gate: 'Gate0', action: `input/ 有 ${rawInputs.length} 份原料未起草核对件` },
		});
	}

	const orphanBugs = bugs.filter((b) => b.status === 'open' && (b.prd === null || !ids.has(b.prd)));
	const doneCount = packages.filter((p) => p.prd?.status === 'done').length;

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
			return v === null ? `${g}:—` : `${g}:${v}`;
		}).join(' ');
		lines.push('');
		lines.push(`## ${pkg.id}　[${pkg.status}]${pkg.prdVersion ? ` v${pkg.prdVersion}` : ''}${pkg.flow === 'fast' ? '　⚡快速路径' : ''}`);
		lines.push(`  ${gates}`);
		if (pkg.journal !== null) {
			lines.push(`  journal: ${pkg.journal.lines} 行，末条 ${pkg.journal.lastAt ?? '?'} ${pkg.journal.lastActor ?? ''} ${pkg.journal.lastStep ?? ''}`);
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
	if (snapshot.releasePending) lines.push(`\n⚠ 有 ${snapshot.doneCount} 个包 done 待上线：上线前走发布前整体回归。`);
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
		await writeFile(metaPath, `${JSON.stringify({ lines: after.length, lastHash: hash16(after[after.length - 1] ?? '') }, null, 2)}\n`, 'utf8');
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
			'向 docs/process/prd/<ID>.journal.jsonl 安全追加一条 journal（锁 + 指纹校验 + 原子替换 + 自校验）。at 取机器时间自动填；actor 必填。禁手工读-改-写 journal。',
		parameters: {
			type: 'object',
			properties: {
				id: { type: 'string', description: '需求包 ID（journal 文件名主体）' },
				actor: { type: 'string', description: '谁做的（如 orchestrator / subagent:test-agent）' },
				step: { type: 'string', description: '环节（pm/test/dev/uat/review/archives…）' },
				action: { type: 'string', description: '动作（write/run/approve/…）' },
				phase: { type: 'string', description: '阶段（可选）' },
				note: { type: 'string', description: '一句话事实（可选）' },
				files: { type: 'array', items: { type: 'string' }, description: '涉及文件（可选）' },
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
			const record = {
				at: new Date().toISOString(),
				actor: actor.trim(),
				id,
				...(stringArg(args, 'step') !== undefined ? { step: stringArg(args, 'step') } : {}),
				...(stringArg(args, 'action') !== undefined ? { action: stringArg(args, 'action') } : {}),
				...(stringArg(args, 'phase') !== undefined ? { phase: stringArg(args, 'phase') } : {}),
				...(files !== undefined ? { files } : {}),
				...(stringArg(args, 'note') !== undefined ? { note: stringArg(args, 'note') } : {}),
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
				skipped.push(rel);
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
	return { created, skipped };
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
function initTool() {
	return {
		name: 'process_init',
		description:
			'把流程骨架初始化到当前工作区：包内 scaffold/** → <仓库>/docs/process/**，脚本 → <仓库>/scripts/process/*.mjs，并在 AGENTS.md 缺失时按模板建一份项目级常驻指针（存在则跳过并给出待并入的段落）。只创建不覆盖（已存在的文件跳过并列出）。可选 skills=true 额外把 8 个通用角色技能落到 <仓库>/.dsh/skills/** 以便就地定制（不改则用插件自带版本）。',
		parameters: {
			type: 'object',
			properties: {
				scriptsDir: { type: 'string', description: '脚本落点，默认 scripts/process' },
				skills: { type: 'boolean', description: '是否同时落地角色技能到 .dsh/skills/（默认 false）' },
				agents: { type: 'boolean', description: '是否保证项目级常驻指针 AGENTS.md 存在（默认 true；只在缺失时创建，绝不改写已有文件）' },
				dryRun: { type: 'boolean', description: '只列出将要创建的文件，不写盘' },
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
			const scriptsDir = stringArg(args, 'scriptsDir') ?? 'scripts/process';
			const withSkills = args?.skills === true;
			const agents = args?.agents !== false;
			const dryRun = args?.dryRun === true;
			const processDir = join(root, PROCESS_REL);
			const created = [];
			const skipped = [];

			const scaffold = await copyTree(join(PACKAGE_ROOT, 'scaffold'), processDir, { dryRun });
			created.push(...scaffold.created.map((f) => `${PROCESS_REL}/${f}`));
			skipped.push(...scaffold.skipped.map((f) => `${PROCESS_REL}/${f}`));

			const scripts = await copyTree(join(PACKAGE_ROOT, 'scripts'), join(root, scriptsDir), { dryRun });
			created.push(...scripts.created.map((f) => `${scriptsDir}/${f}`));
			skipped.push(...scripts.skipped.map((f) => `${scriptsDir}/${f}`));

			if (withSkills) {
				const skills = await copyTree(join(PACKAGE_ROOT, 'skills'), join(root, '.dsh', 'skills'), { dryRun });
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

			const lines = [];
			lines.push(dryRun ? `# process_init（dry-run，未写盘）` : `# process_init 完成`);
			lines.push(`root: ${root}`);
			lines.push('');
			lines.push(created.length > 0 ? `新建（${created.length}）：` : '新建（0）：');
			for (const f of created) lines.push(`  + ${f}`);
			if (skipped.length > 0) {
				lines.push('');
				lines.push(`已存在、跳过（${skipped.length}）：`);
				for (const f of skipped) lines.push(`  = ${f}`);
			}
			lines.push('');
			lines.push('下一步：');
			lines.push(`1. 编辑 ${PROCESS_REL}/PROJECT.md：填端与目录、命令槽、产物属主表（这是通用流程与项目的唯一接口）。`);
			lines.push(`2. 在 package.json 加脚本（示例）："process:journal": "node ${scriptsDir}/journal-append.mjs"、"check:rules": "node ${scriptsDir}/check-rules.mjs"、"check:artifact-paths": "node ${scriptsDir}/check-artifact-paths.mjs"。`);
			lines.push('3. 角色技能已由插件自带（rank 600，项目 .dsh/skills 可覆盖）；需要就地改就再跑一次 process_init 并带 skills=true。');
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
				dryRun,
				report: lines.join('\n'),
			};
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

/* ------------------------------------------------------------------ *
 * 看板路由（只读）与常驻提醒
 * ------------------------------------------------------------------ */

/**
 * 看板的工作区根：环境变量优先，其次「日志推进最远的非 subagent 活会话」，
 * 没有活会话退持久化清单的第一个非 subagent 会话。整帧浮层拿不到「正在看哪个
 * 会话」，口径与其它浮层插件一致。
 */
async function panelRoot(ctx) {
	const override = rootOverride();
	if (override !== undefined) return override;
	const live = ctx.sessions.list().filter((session) => session?.header?.origin !== 'subagent');
	if (live.length > 0) {
		let best = live[0];
		for (const session of live) if ((session.seq ?? -1) > (best.seq ?? -1)) best = session;
		if (typeof best.header?.cwd === 'string' && best.header.cwd !== '') return best.header.cwd;
	}
	try {
		const records = await ctx.sessionQuery.listSessions();
		const record = records.find(
			(entry) => entry?.header?.origin !== 'subagent' && typeof entry?.header?.cwd === 'string' && entry.header.cwd !== '',
		);
		if (record !== undefined) return record.header.cwd;
	} catch {
		/* 没有会话可查：退 process.cwd()（大概率未初始化，面板会显示 not-found） */
	}
	return process.cwd();
}

/** 注册全部资源。 */
function apply(ctx) {
	ctx.effect(() => ctx.tools.register(statusTool()), 'process-kit: process_status');
	ctx.effect(() => ctx.tools.register(summaryTool()), 'process-kit: gate_summary');
	ctx.effect(() => ctx.tools.register(journalTool()), 'process-kit: process_journal');
	ctx.effect(() => ctx.tools.register(initTool()), 'process-kit: process_init');

	// `skills` 是可选依赖：没有技能服务的组合里，工具与看板照常工作。
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
					'- 每轮唤醒/续跑先调用 process_status 取状态机快照与下一步动作，不依赖聊天历史；未初始化时可用 process_init 落地骨架。',
					'- Gate0/1/2/4 是必停点，只有人能 approve；对人的一切输出用两段式（✅ 完成了什么 / ❓ 还需要裁定什么），可用 gate_summary 生成骨架。',
					'- journal 只追加不覆写：用 process_journal（机器时间），禁止手工读-改-写。',
					'- 角色由本插件自带的同名技能提供（product-manager / ui-designer / test-agent / dev-agent / uat-agent / code-review-agent / security-review-agent / logic-review-agent）；派单时让 subagent 读对应技能，不要在提示里复述角色职责。',
					'- 角色硬边界、状态机与门禁以 docs/process/README.md 为唯一真源，项目适配见 docs/process/PROJECT.md；本节只做提醒，不复述规则。',
				].join('\n'),
			}),
		'process-kit: wake section',
	);

	ctx.effect(
		() =>
			ctx.webServer.register({
				kind: 'exact',
				path: ROUTE,
				handler: async (req, res) => {
					try {
						const rejection = ctx.connection.requestRejection(req);
						if (rejection !== undefined) {
							res.statusCode = rejection;
							res.end();
							return;
						}
						const root = await panelRoot(ctx);
						const payload = await scanProcess(root);
						res.statusCode = 200;
						res.setHeader('content-type', 'application/json; charset=utf-8');
						res.setHeader('cache-control', 'no-store');
						res.end(JSON.stringify(payload));
					} catch (error) {
						ctx.logger.warn('process-kit: %s', error?.message ?? error);
						if (!res.writableEnded) {
							res.statusCode = 500;
							res.setHeader('content-type', 'application/json; charset=utf-8');
							res.end(JSON.stringify({ error: 'internal' }));
						}
					}
				},
			}),
		`process-kit: ${ROUTE}`,
	);
}

export { apply, inject, name };
