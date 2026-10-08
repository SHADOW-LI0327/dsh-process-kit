/**
 * 流程看板，页面部分（在网页里跑）。
 *
 * `shell.overlay` 浮层（右下角）：把 docs/process 的文件状态机投到 GUI——每包
 * status / Gate 四灯 / 下一步动作 / open bugs / 状态位不一致警告。数据全部来自
 * 服务端部分的只读路由（每次现读工作区文件），面板不缓存、不可编辑：文件仍是唯一
 * 真源，这里只是一面镜子。
 *
 * @module dsh-process-kit/client
 */
window.__ModuleLoader__.load({
	id: 'dsh-process-kit',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		const { jsx, jsxs } = require('react/jsx-runtime');
		const React = require('react');

		/** Client service dependencies: the slot registry only. */
		const inject = ['slots'];

		/** The Host half's read-only route. */
		const ROUTE = '/process-kit';

		/** Panel identity; also the shell.overlay entry id. */
		const PANEL_ID = 'process-kit';

		/** Refresh cadence; roles keep editing the same files behind our back. */
		const POLL_MS = 6000;

		/** Collapsed state is a browser preference. */
		const OPEN_KEY = 'dsh-process-kit.open';

		const T = {
			title: '流程看板',
			loading: '读取中…',
			refresh: '刷新',
			collapse: '收起',
			expand: '展开流程看板',
			notFound: '当前工作区没有 docs/process',
			notFoundHint: '看板跟随日志推进最远的会话；该工作区尚未初始化流程时，可让 Agent 调用 process_init 落地骨架。',
			failed: '读取失败',
			noPackages: '无在途包',
			releasePending: '个包 done 待上线：上线前走发布前整体回归',
			openBugs: 'open bugs',
			warnings: '状态位不一致',
			orphanBugs: '未挂包的 open bugs',
			next: '下一步',
			journal: 'journal',
			rawInputs: '原料',
			packages: '包',
			gate: { gate0: 'G0', gate1: 'G1', gate2: 'G2', gate4: 'G4' },
			gateState: { pending: '待签', approved: '已签', rejected: '驳回' },
		};

		/** Status badge → theme token. */
		const STATUS_COLOR = {
			done: 'var(--dsw-alias-state-success-primary)',
			warn: 'var(--dsw-alias-state-warn-primary)',
			accent: 'var(--dsw-alias-brand-primary)',
			muted: 'var(--dsw-alias-label-secondary)',
			normal: 'var(--dsw-alias-label-primary)',
		};

		/** Panel chrome: floating card anchored bottom-right inside the overlay layer. */
		const S = {
			pill: {
				position: 'absolute',
				right: '14px',
				bottom: '14px',
				display: 'inline-flex',
				alignItems: 'center',
				gap: '5px',
				padding: '4px 10px',
				borderRadius: '999px',
				border: '1px solid var(--dsw-alias-border-l2)',
				background: 'var(--dsw-alias-bg-layer-2)',
				boxShadow: '0 6px 18px rgba(0, 0, 0, .16)',
				color: 'var(--dsw-alias-label-primary)',
				fontFamily: 'inherit',
				fontSize: '12px',
				cursor: 'pointer',
			},
			wrap: {
				position: 'absolute',
				right: '14px',
				bottom: '14px',
				width: '340px',
				maxHeight: 'min(62vh, 560px)',
				display: 'flex',
				flexDirection: 'column',
				boxSizing: 'border-box',
				padding: '10px',
				borderRadius: '10px',
				border: '1px solid var(--dsw-alias-border-l2)',
				background: 'var(--dsw-alias-bg-layer-2)',
				boxShadow: '0 8px 24px rgba(0, 0, 0, .18), 0 2px 6px rgba(0, 0, 0, .08)',
				color: 'var(--dsw-alias-label-primary)',
				fontFamily: 'inherit',
				fontSize: '12px',
				lineHeight: '16px',
			},
			head: {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: '6px',
				marginBottom: '6px',
				flex: 'none',
			},
			title: { fontSize: '12.5px', fontWeight: 600, flex: '1 1 auto' },
			count: {
				fontSize: '11px',
				color: 'var(--dsw-alias-label-secondary)',
				fontVariantNumeric: 'tabular-nums',
			},
			iconButton: {
				font: 'inherit',
				fontSize: '11px',
				lineHeight: '15px',
				height: '20px',
				boxSizing: 'border-box',
				padding: '0 6px',
				borderRadius: '5px',
				border: '1px solid var(--dsw-alias-border-l2)',
				background: 'transparent',
				color: 'var(--dsw-alias-label-secondary)',
				cursor: 'pointer',
				flex: 'none',
			},
			body: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto' },
			pkg: {
				padding: '6px 7px',
				marginBottom: '6px',
				border: '1px solid var(--dsw-alias-border-l2)',
				borderRadius: '7px',
			},
			pkgTop: { display: 'flex', alignItems: 'center', gap: '6px' },
			pkgId: { flex: '1 1 auto', minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
			status: { flex: 'none', fontSize: '10.5px', lineHeight: '14px', padding: '0 5px', borderRadius: '999px', border: '1px solid currentColor' },
			gates: { display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap' },
			gate: {
				display: 'inline-flex',
				alignItems: 'center',
				gap: '3px',
				fontSize: '10.5px',
				lineHeight: '14px',
				color: 'var(--dsw-alias-label-secondary)',
				fontVariantNumeric: 'tabular-nums',
			},
			next: {
				marginTop: '4px',
				fontSize: '11px',
				lineHeight: '15px',
				color: 'var(--dsw-alias-label-secondary)',
			},
			nextLabel: { color: 'var(--dsw-alias-brand-primary)' },
			meta: { marginTop: '3px', fontSize: '10.5px', lineHeight: '14px', color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
			section: { marginTop: '2px', marginBottom: '6px' },
			sectionTitle: { fontSize: '11px', fontWeight: 600, marginBottom: '3px', color: 'var(--dsw-alias-state-warn-primary)' },
			warnLine: { fontSize: '11px', lineHeight: '15px', color: 'var(--dsw-alias-state-warn-primary)', wordBreak: 'break-word' },
			note: { fontSize: '11px', lineHeight: '16px', color: 'var(--dsw-alias-label-secondary)' },
			noteError: { fontSize: '11px', lineHeight: '16px', color: 'var(--dsw-alias-state-error-primary)' },
			foot: {
				marginTop: '2px',
				paddingTop: '6px',
				borderTop: '1px solid var(--dsw-alias-border-l2)',
				fontSize: '10.5px',
				color: 'var(--dsw-alias-label-secondary)',
				overflow: 'hidden',
				textOverflow: 'ellipsis',
				whiteSpace: 'nowrap',
				flex: 'none',
			},
		};

		/** Gate 灯：符号 + 颜色 + 悬停说明。 */
		function gateDot(value) {
			if (value === null || value === undefined) return { text: '·', color: 'var(--dsw-alias-border-l2)', label: '未设' };
			if (value === 'approved') return { text: '●', color: 'var(--dsw-alias-state-success-primary)', label: '已签' };
			if (value === 'rejected') return { text: '✕', color: 'var(--dsw-alias-state-error-primary)', label: '驳回' };
			return { text: '○', color: 'var(--dsw-alias-label-secondary)', label: '待签' };
		}

		function readOpen() {
			try {
				return window.localStorage.getItem(OPEN_KEY) !== '0';
			} catch {
				return true;
			}
		}

		function saveOpen(open) {
			try {
				window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
			} catch {
				/* the panel still works */
			}
		}

		/** One round trip to the Host route. */
		async function call() {
			const response = await fetch(ROUTE, { headers: { accept: 'application/json' } });
			let payload = null;
			try {
				payload = await response.json();
			} catch {
				payload = null;
			}
			return { ok: response.ok, status: response.status, payload };
		}

		/** The frame-wide process board. */
		function ProcessPanel() {
			const [model, setModel] = React.useState({ phase: 'loading' });
			const [open, setOpen] = React.useState(readOpen);

			const load = React.useCallback(async () => {
				try {
					const result = await call();
					if (!result.ok || result.payload === null || typeof result.payload !== 'object') {
						setModel({ phase: 'failed', code: `HTTP ${result.status}` });
						return;
					}
					setModel({ phase: 'ready', payload: result.payload });
				} catch (error) {
					setModel({ phase: 'failed', code: String(error?.message ?? error) });
				}
			}, []);

			React.useEffect(() => {
				void load();
				const timer = window.setInterval(() => void load(), POLL_MS);
				return () => window.clearInterval(timer);
			}, [load]);

			const toggle = (next) => {
				setOpen(next);
				saveOpen(next);
			};

			const payload = model.phase === 'ready' ? model.payload : null;
			const packages = payload?.found ? payload.packages ?? [] : [];
			const activeCount = packages.filter((p) => p.prd === null || !['done', 'terminated'].includes(p.prd?.status)).length;

			if (!open) {
				return jsxs('button', {
					type: 'button',
					style: S.pill,
					title: T.expand,
					onClick: () => toggle(true),
					children: [
						jsx('span', { 'aria-hidden': 'true', children: '⛭' }),
						jsx('span', {
							children: model.phase === 'ready' ? (payload?.found ? `${activeCount} ${T.packages}${payload.openBugCount > 0 ? ` / ${payload.openBugCount} bug` : ''}` : '—') : model.phase === 'failed' ? '!' : '…',
						}),
					],
				});
			}

			const gatesOf = (pkg) =>
				['gate0', 'gate1', 'gate2', 'gate4'].map((gate) => {
					const dot = gateDot(pkg.gates?.[gate]);
					return jsxs(
						'span',
						{
							style: S.gate,
							title: `${T.gate[gate]}：${dot.label}`,
							children: [jsx('span', { style: { color: dot.color }, children: dot.text }), T.gate[gate]],
						},
						gate,
					);
				});

			const body =
				model.phase === 'loading'
					? jsx('div', { style: S.note, children: T.loading })
					: model.phase === 'failed'
						? jsx('div', { style: S.noteError, children: `${T.failed}：${model.code}` })
						: !payload.found
							? jsxs('div', { style: S.note, children: [T.notFound, '。', jsx('br', {}), T.notFoundHint] })
							: packages.length === 0
								? jsx('div', { style: S.note, children: T.noPackages })
								: packages.map((pkg) =>
										jsxs(
											'div',
											{
												style: S.pkg,
												children: [
													jsxs('div', {
														style: S.pkgTop,
														children: [
															jsx('span', {
																style: S.pkgId,
																title: pkg.id,
																children: pkg.prd === null && pkg.check !== null ? `${pkg.id}（仅核对件）` : pkg.id,
															}),
															jsx('span', {
																style: { ...S.status, color: STATUS_COLOR[pkg.statusClass] ?? STATUS_COLOR.normal },
																children: pkg.status,
															}),
														],
													}),
													jsx('div', { style: S.gates, children: gatesOf(pkg) }),
													(pkg.rawInputs ?? []).length > 0
														? jsx('div', { style: S.meta, children: `${T.rawInputs}：${pkg.rawInputs.join('、')}` })
														: null,
													pkg.journal !== null && pkg.journal !== undefined
														? jsx('div', {
																style: S.meta,
																title: `${pkg.journal.file}（末条 ${pkg.journal.lastAt ?? '?'}）`,
																children: `${T.journal} ${pkg.journal.lines} 行 · ${pkg.journal.lastStep ?? ''} ${pkg.journal.lastActor ?? ''}`,
															})
														: null,
													pkg.openBugs !== undefined && pkg.openBugs.length > 0
														? jsx('div', { style: { ...S.meta, color: 'var(--dsw-alias-state-error-primary)' }, children: `${T.openBugs}：${pkg.openBugs.join('、')}` })
														: null,
													jsxs('div', {
														style: S.next,
														children: [
															jsx('span', { style: S.nextLabel, children: `▶ ${T.next}${pkg.next.gate ? `（${pkg.next.gate}）` : ''}：` }),
															pkg.next.action,
														],
													}),
												],
											},
											pkg.id,
										),
									);

			const warnings = payload?.found ? payload.warnings ?? [] : [];
			const orphanBugs = payload?.found ? payload.orphanBugs ?? [] : [];

			return jsxs('div', {
				style: S.wrap,
				children: [
					jsxs('div', {
						style: S.head,
						children: [
							jsx('span', { style: S.title, children: T.title }),
							jsx('span', { style: S.count, children: payload?.found ? `${packages.length} ${T.packages} · ${payload.openBugCount} bug` : '' }),
							jsx('button', {
								type: 'button',
								style: S.iconButton,
								title: T.refresh,
								onClick: () => void load(),
								children: '↻',
							}),
							jsx('button', {
								type: 'button',
								style: S.iconButton,
								title: T.collapse,
								onClick: () => toggle(false),
								children: '—',
							}),
						],
					}),
					payload?.found && payload.releasePending
						? jsx('div', { style: { ...S.warnLine, marginBottom: '6px' }, children: `⚠ ${payload.doneCount} ${T.releasePending}` })
						: null,
					jsx('div', { style: S.body, children: body }),
					warnings.length > 0 || orphanBugs.length > 0
						? jsxs('div', {
								style: S.section,
								children: [
									warnings.length > 0
										? jsxs('div', {
												style: S.sectionTitle,
												children: [`⚠ ${T.warnings}（${warnings.length}）`],
											})
										: null,
									warnings.map((warning) =>
										jsx('div', { style: S.warnLine, children: warning }, warning),
									),
									orphanBugs.length > 0
										? jsxs('div', { style: S.sectionTitle, children: [`${T.orphanBugs}（${orphanBugs.length}）`] })
										: null,
									orphanBugs.map((bug) =>
										jsx('div', { style: S.warnLine, children: `${bug.id}（${bug.file}）` }, bug.id),
									),
								],
							})
						: null,
					jsx('div', { style: S.foot, title: payload?.root ?? '', children: payload?.found ? `${payload.root} · ${payload.generatedAt ?? ''}` : '—' }),
				],
			});
		}

		/**
		 * Register the board in the frame-wide overlay layer, bottom-right so it
		 * never collides with the todo card anchored top-right in the same layer.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.slots.inject('shell.overlay', () =>
				ctx.slots.register({ name: 'shell.overlay', id: PANEL_ID, order: 60 }, ProcessPanel),
			);
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
