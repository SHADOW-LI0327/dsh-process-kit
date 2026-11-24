/**
 * Hub client used by the process-kit tools.
 *
 * Credentials live outside the repository in ~/.dsh/collab.json:
 *   { "hubUrl": "http://server:8787", "token": "col_...", "name": "A" }
 * The repository only carries docs/process/.hub.json:
 *   { "projectId": "shop", "featureId": "FEAT-001" }
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';

export const DEFAULT_HUB = 'http://127.0.0.1:8787';

function configPath() {
	return process.env.COLLAB_CONFIG ?? join(homedir(), '.dsh', 'collab.json');
}

export async function loadHubConfig() {
	let file = {};
	try {
		file = JSON.parse(await readFile(configPath(), 'utf8'));
	} catch (error) {
		if (error.code !== 'ENOENT') throw new Error(`cannot read ${configPath()}: ${error.message}`);
	}
	return {
		hubUrl: process.env.COLLAB_HUB_URL ?? file.hubUrl ?? DEFAULT_HUB,
		token: process.env.COLLAB_TOKEN ?? file.token ?? '',
		name: process.env.COLLAB_NAME ?? file.name ?? '',
	};
}

function mimeFor(filename) {
	const ext = extname(filename).toLowerCase();
	return (
		{
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.webp': 'image/webp',
			'.gif': 'image/gif',
			'.html': 'text/html',
			'.htm': 'text/html',
			'.md': 'text/markdown',
			'.markdown': 'text/markdown',
			'.txt': 'text/plain',
			'.pdf': 'application/pdf',
		}[ext] ?? 'application/octet-stream'
	);
}

function clip(value, max = 180) {
	const text = String(value ?? '').replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ago(value) {
	const delta = Date.now() - Date.parse(value ?? '');
	if (!Number.isFinite(delta) || delta < 0) return '?';
	const minutes = Math.floor(delta / 60_000);
	if (minutes < 1) return 'now';
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export class HubClient {
	constructor({ hubUrl = DEFAULT_HUB, token = '', name = '' } = {}) {
		this.hubUrl = String(hubUrl).replace(/\/+$/, '');
		this.token = token;
		this.name = name;
	}

	static async fromConfig() {
		return new HubClient(await loadHubConfig());
	}

	url(path) {
		return `${this.hubUrl}${path.startsWith('/') ? path : `/${path}`}`;
	}

	async request(method, path, { json, body, headers = {}, signal } = {}) {
		const finalHeaders = { ...headers };
		if (this.token) finalHeaders.authorization = `Bearer ${this.token}`;
		if (json !== undefined) {
			finalHeaders['content-type'] = 'application/json';
			body = JSON.stringify(json);
		}
		let response;
		try {
			response = await fetch(this.url(path), { method, headers: finalHeaders, body, signal });
		} catch (error) {
			throw new Error(`hub unreachable at ${this.hubUrl}: ${error.message}; check collab config / server`);
		}
		if (!response.ok) {
			let message = `HTTP ${response.status}`;
			try {
				const payload = await response.json();
				if (payload?.error) message = payload.error;
			} catch {
				// keep status
			}
			throw new Error(message);
		}
		return response.json();
	}

	register(name, role) {
		return this.request('POST', '/api/register', { json: { name, role } });
	}

	board() {
		return this.request('GET', '/api/board');
	}

	createProject({ id, name, description = '', repos = [] }) {
		return this.request('POST', '/api/projects', { json: { id, name, description, repos } });
	}

	project(id) {
		return this.request('GET', `/api/projects/${encodeURIComponent(id)}`);
	}

	createFeature({ projectId, id, title, repos, brief = '' }) {
		return this.request('POST', `/api/projects/${encodeURIComponent(projectId)}/features`, {
			json: { id, title, repos, brief },
		});
	}

	context(feature, since = 0) {
		const query = since ? `?since=${encodeURIComponent(since)}` : '';
		return this.request('GET', `/api/features/${encodeURIComponent(feature)}/context${query}`);
	}

	delta(feature, since = 0) {
		const query = since ? `?since=${encodeURIComponent(since)}` : '';
		return this.request('GET', `/api/features/${encodeURIComponent(feature)}/delta${query}`);
	}

	status(feature, { state, focus, blocker }) {
		return this.request('POST', `/api/features/${encodeURIComponent(feature)}/status`, {
			json: { state, focus, blocker },
		});
	}

	async publish(feature, filePath, { kind = 'design', summary = '' } = {}) {
		const data = await readFile(filePath);
		const filename = basename(filePath);
		return this.request('POST', `/api/features/${encodeURIComponent(feature)}/artifacts`, {
			body: data,
			headers: {
				'content-type': mimeFor(filename),
				'x-filename': filename,
				'x-kind': kind,
				'x-summary': summary,
			},
		});
	}

	question(feature, text) {
		return this.request('POST', `/api/features/${encodeURIComponent(feature)}/questions`, { json: { text } });
	}

	answer(question, text) {
		return this.request('POST', `/api/questions/${encodeURIComponent(question)}/answer`, { json: { text } });
	}

	handoff(feature, note) {
		return this.request('POST', `/api/features/${encodeURIComponent(feature)}/handoff`, { json: { note } });
	}

	absoluteUrl(path) {
		return this.url(path);
	}

	/** Non-blocking probe used by hub_health; never mutates Hub state. */
	async health(feature, timeoutMs = 2500) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const me = await this.request('GET', '/api/me', { signal: controller.signal });
			let context = null;
			if (feature) {
				context = await this.request('GET', `/api/features/${encodeURIComponent(feature)}/context`, {
					signal: controller.signal,
				});
			}
			return {
				ok: true,
				member: me.member,
				feature: feature || null,
				featureExists: context !== null,
				project: context?.project ?? null,
				context,
				statuses: context?.statuses?.length ?? 0,
				artifacts: context?.artifacts?.length ?? 0,
				questions: context?.questions?.filter((question) => question.status === 'open').length ?? 0,
			};
		} catch (error) {
			return {
				ok: false,
				feature: feature || null,
				error: error.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : error.message,
			};
		} finally {
			clearTimeout(timer);
		}
	}
}

/** Read the committed project/feature mapping from docs/process/.hub.json. */
export async function readHubMapping(cwd) {
	try {
		const value = JSON.parse(await readFile(join(cwd, 'docs/process/.hub.json'), 'utf8'));
		return {
			projectId: typeof value.projectId === 'string' ? value.projectId : '',
			featureId: typeof value.featureId === 'string' ? value.featureId : '',
		};
	} catch (error) {
		if (error.code === 'ENOENT') return null;
		throw new Error(`cannot read docs/process/.hub.json: ${error.message}`);
	}
}

/** Write the committed project/feature mapping (no credentials). */
export async function writeHubMapping(cwd, { projectId, featureId }) {
	const path = join(cwd, 'docs/process/.hub.json');
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify({ projectId, featureId }, null, 2)}\n`, 'utf8');
	return path;
}

/** Resolve an explicit feature or the repository mapping. */
export async function resolveFeature(cwd, explicit) {
	if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim();
	const mapping = await readHubMapping(cwd);
	if (mapping?.featureId) return mapping.featureId;
	throw new Error(
		'no feature selected: pass `feature`, or bind this repo with hub_link (writes docs/process/.hub.json)',
	);
}

/** Cheap local detection: config + repository binding, never contacts the Hub. */
export async function detectHub(cwd) {
	let config;
	try {
		config = await loadHubConfig();
	} catch (error) {
		return { configured: false, token: false, reachable: null, error: error.message };
	}
	let mapping = null;
	let mappingError = null;
	try {
		mapping = await readHubMapping(cwd);
	} catch (error) {
		mappingError = error.message;
	}
	const configured = Boolean(config.token && mapping?.featureId);
	return {
		configured,
		token: Boolean(config.token),
		hubUrl: config.hubUrl,
		member: config.name || null,
		projectId: mapping?.projectId ?? null,
		featureId: mapping?.featureId ?? null,
		...(mappingError ? { error: mappingError } : {}),
	};
}

/** Human/agent text for hub_health; failures are reported, never thrown as process failures. */
export function renderHubHealth(detection, health) {
	const lines = [];
	lines.push(`Hub: ${detection.hubUrl}`);
	lines.push(`member: ${detection.member ?? '(not registered)'}`);
	lines.push(`binding: ${detection.projectId ?? '?'} / ${detection.featureId ?? '(not linked)'}`);
	if (!detection.token) {
		lines.push('状态: 未配置（可选协作；主流程不受影响）');
		lines.push('配置: 在成员本机运行 collab register，随后 hub_link(project, feature)');
		return lines.join('\n');
	}
	if (!detection.featureId) {
		lines.push('状态: 已注册成员，但本仓库未绑定 feature');
		lines.push('配置: 运行 hub_link(project, feature) 写 docs/process/.hub.json');
		return lines.join('\n');
	}
	if (health?.ok) {
		lines.push(`状态: 已连接 · ${health.member?.name ?? '?'} · ${health.project?.name ?? detection.projectId}/${detection.featureId}`);
		lines.push(`上下文: ${health.statuses} 个状态 / ${health.artifacts} 个产物 / ${health.questions} 个未决问题`);
	} else {
		lines.push(`状态: 不可达 —— ${health?.error ?? 'unknown error'}`);
		lines.push('处理: 检查 Hub 是否启动、hubUrl / token 是否正确；主流程不受影响');
	}
	return lines.join('\n');
}

export function renderHubContext(ctx) {
	const lines = [];
	lines.push(`Project: ${ctx.project?.id ?? '?'} · ${ctx.project?.name ?? '?'}`);
	lines.push(`Feature: ${ctx.feature?.id ?? '?'} · ${ctx.feature?.title ?? '?'}`);
	if (ctx.feature?.repos?.length) lines.push(`Repos: ${ctx.feature.repos.join(', ')}`);
	if (ctx.feature?.brief) lines.push(`Brief: ${clip(ctx.feature.brief, 400)}`);
	lines.push('', 'Members:');
	if (!ctx.statuses?.length) lines.push('- no status yet');
	for (const status of ctx.statuses ?? []) {
		lines.push(
			`- ${status.member}${status.role ? ` (${status.role})` : ''}: ${status.state}${status.focus ? ` · ${clip(status.focus)}` : ''}${status.blocker ? ` · blocked: ${clip(status.blocker)}` : ''}${status.stale ? ' [stale]' : ''} (${ago(status.updatedAt)})`,
		);
	}
	const open = (ctx.questions ?? []).filter((question) => question.status === 'open');
	lines.push('', 'Open questions:');
	if (!open.length) lines.push('- none');
	for (const question of open) lines.push(`- [${question.id}] ${question.author}: ${clip(question.text, 300)}`);
	lines.push('', 'Artifacts:');
	if (!ctx.artifacts?.length) lines.push('- none');
	for (const artifact of (ctx.artifacts ?? []).slice(0, 12)) {
		lines.push(
			`- [${artifact.kind}] ${artifact.filename} v${artifact.version} · ${artifact.author} — ${clip(artifact.summary, 220)} (${artifact.id})`,
		);
	}
	if (ctx.events?.length) {
		lines.push('', 'Recent changes:');
		for (const event of ctx.events.slice(-10)) {
			const payload = event.payload?.summary ?? event.payload?.text ?? event.payload?.note ?? event.payload?.state ?? '';
			lines.push(`- #${event.id} ${event.type}${payload ? ` · ${clip(payload)}` : ''} (${ago(event.createdAt)})`);
		}
	}
	lines.push('', `Cursor: ${ctx.cursor}`);
	return lines.join('\n');
}

export function renderHubBoard(board) {
	const lines = ['Team board:'];
	for (const project of board.projects ?? []) {
		lines.push(`\n## ${project.id} · ${project.name}`);
		for (const feature of project.features ?? []) {
			lines.push(`- ${feature.id} · ${feature.title} · ${feature.statuses?.length ?? 0} status / ${feature.artifactCount ?? 0} artifacts / ${feature.openQuestions ?? 0} questions`);
			for (const status of feature.statuses ?? []) {
				lines.push(`  - ${status.member}: ${status.state}${status.focus ? ` · ${clip(status.focus)}` : ''}${status.blocker ? ` · blocked: ${clip(status.blocker)}` : ''}`);
			}
		}
	}
	return lines.join('\n');
}
