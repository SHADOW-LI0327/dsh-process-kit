/**
 * dsh-process-kit 的 Web 客户端：左侧栏「研发流程」入口 + 主面板看板。
 *
 * 无构建、无外部依赖：走 DSH 的 ModuleLoader（React 由 baseline 提供）。
 * 数据来自同包 Host 路由 `/process-kit/status?cwd=<绝对路径>`；面板只读，
 * 不提供 Gate 批准 / 代签入口 —— 签名仍然只在对话的 Gate 摘要里发生。
 */
window.__ModuleLoader__.load({
  id: 'dsh-process-kit',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useState } = React;

    const TEXT = {
      zh: {
        title: '研发流程',
        modeFull: '逐步',
        modeManaged: '托管',
        modeFast: '快速',
        stepFull: ['需求确认', '方案确认', '测试确认', '验收确认'],
        stepFast: ['需求确认', '实现/回归', '交付'],
        workspace: '工作区',
        package: '需求包',
        next: '下一步',
        journal: 'journal',
        refresh: '刷新',
        noWorkspace: '还没有打开的工作区。先在左侧选择一个工作区 / 会话。',
        noProcess: '这个工作区还没有初始化流程（docs/process）。',
        noPackage: '这个工作区还没有需求包。把需求一句话发我，我来建包。',
        loading: '读取中…',
        error: '读取失败',
        managedNote: 'Gate1/2 由你在 Gate0 授权，不是人签；验收仍由你签。',
        delegated: 'Gate0 授权',
        notHuman: '不是人签',
        done: '人签',
        current: '当前停点',
        upcoming: '未开始',
        blocked: '已冻结',
        tampered: 'journal 篡改嫌疑：看板只报警、不推进；修好前任何 Gate 都不算数。',
        emptyHint: '4 个拍板点：需求确认 → 方案确认 → 测试确认 → 验收确认。',
      },
      en: {
        title: 'Dev process',
        modeFull: 'Step-by-step',
        modeManaged: 'Managed',
        modeFast: 'Fast',
        stepFull: ['Requirement', 'Design', 'Tests', 'Acceptance'],
        stepFast: ['Requirement', 'Implement/regress', 'Ship'],
        workspace: 'Workspace',
        package: 'Package',
        next: 'Next',
        journal: 'journal',
        refresh: 'Refresh',
        noWorkspace: 'No workspace open. Pick a workspace / session on the left first.',
        noProcess: 'This workspace has not initialized the process (docs/process).',
        noPackage: 'No package yet. Send me the requirement in one sentence and I will create one.',
        loading: 'Loading…',
        error: 'Failed to read',
        managedNote: 'Gate1/2 were delegated by you at Gate0, not human-signed; Gate4 still needs you.',
        delegated: 'Gate0 delegation',
        notHuman: 'not human-signed',
        done: 'signed',
        current: 'current stop',
        upcoming: 'upcoming',
        blocked: 'blocked',
        tampered: 'Journal tamper suspected: the board only alerts; no Gate counts until it is fixed.',
        emptyHint: 'Four decision points: Requirement → Design → Tests → Acceptance.',
      },
    };

    const MARK = { done: '✓', current: '●', delegated: '◌', upcoming: '○', blocked: '×' };

    function modeText(t, flow) {
      return flow === 'fast' ? t.modeFast : flow === 'managed' ? t.modeManaged : t.modeFull;
    }

    function modeClass(flow) {
      return flow === 'fast' ? 'pk-badge pk-badge--fast' : flow === 'managed' ? 'pk-badge pk-badge--managed' : 'pk-badge';
    }

    function stepsOf(pkg) {
      const tampered = pkg.journal?.integrity?.state === 'tampered';
      if (pkg.flow === 'fast') {
        const g0 = pkg.gates?.gate0;
        const cur = (pkg.next?.gate ?? '').toLowerCase();
        return [
          { key: 'gate0', label: 'g0', state: g0 === 'approved' ? 'done' : tampered ? 'blocked' : cur === 'gate0' ? 'current' : 'upcoming' },
          { key: 'impl', label: 'impl', state: tampered ? 'blocked' : g0 === 'approved' ? 'current' : 'upcoming' },
          { key: 'deliver', label: 'deliver', state: 'upcoming' },
        ];
      }
      const defs = [
        ['gate0', 'g0'],
        ['gate1', 'g1'],
        ['gate2', 'g2'],
        ['gate4', 'g4'],
      ];
      const cur = (pkg.next?.gate ?? '').toLowerCase();
      return defs.map(([key, label]) => {
        const value = pkg.gates?.[key];
        const host = pkg.gateHost?.[key];
        let state = 'upcoming';
        if (tampered) state = 'blocked';
        else if (host === 'delegated' && value === 'approved') state = 'delegated';
        else if (value === 'approved') state = 'done';
        else if (cur === key) state = 'current';
        else if (pkg.flow === 'managed' && (key === 'gate1' || key === 'gate2') && pkg.gates?.gate0 === 'approved') state = 'delegated';
        return { key, label, state };
      });
    }

    function stateNote(t, state) {
      return state === 'done' ? t.done : state === 'current' ? t.current : state === 'delegated' ? `${t.delegated} · ${t.notHuman}` : state === 'blocked' ? t.blocked : t.upcoming;
    }

    function journalOf(t, pkg) {
      const integ = pkg.journal?.integrity;
      if (integ === undefined || integ === null) return { tone: 'muted', text: '—' };
      if (integ.state === 'verified') return { tone: 'ok', text: '✓ 链式一致' };
      if (integ.state === 'legacy') return { tone: 'warn', text: '⚠ 旧格式' };
      if (integ.state === 'tampered') return { tone: 'danger', text: '🚨 篡改嫌疑' };
      return { tone: 'warn', text: '⚠ 未校验' };
    }

    function Board({ cwd }) {
      const [pkgId, setPkgId] = useState('');
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const [tick, setTick] = useState(0);

      useEffect(() => { setPkgId(''); }, [cwd]);

      useEffect(() => {
        if (!cwd) {
          setData(null);
          setError('');
          return undefined;
        }
        let alive = true;
        const controller = new AbortController();
        const load = async () => {
          try {
            const response = await fetch(`/process-kit/status?cwd=${encodeURIComponent(cwd)}`, {
              signal: controller.signal,
              cache: 'no-store',
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
            if (alive) {
              setData(payload);
              setError('');
            }
          } catch (err) {
            if (alive && err?.name !== 'AbortError') setError(String(err?.message ?? err));
          }
        };
        void load();
        const timer = setInterval(() => { void load(); }, 5000);
        return () => {
          alive = false;
          controller.abort();
          clearInterval(timer);
        };
      }, [cwd, tick]);

      const packages = data?.found ? data.packages ?? [] : [];
      const pkg = packages.find((item) => item.id === pkgId) ?? packages[0];
      useEffect(() => {
        if (!pkg && pkgId) setPkgId('');
        else if (pkg && pkg.id !== pkgId) setPkgId(pkg.id);
      }, [pkg, pkgId]);

      const lang = data?.lang === 'en' ? 'en' : 'zh';
      const t = TEXT[lang];
      const tampered = pkg?.journal?.integrity?.state === 'tampered';
      const steps = pkg ? stepsOf(pkg) : [];
      const labels = pkg?.flow === 'fast' ? t.stepFast : t.stepFull;
      const journal = pkg ? journalOf(t, pkg) : null;

      return h(
        'div',
        { className: 'pk-root', 'data-ui': 'process-panel' },
        h(
          'header',
          { className: 'pk-head' },
          h('div', null, h('h1', { className: 'pk-title' }, t.title), pkg ? h('div', { className: 'pk-sub' }, `${pkg.id} · ${pkg.status}`) : null),
          h(
            'div',
            { className: 'pk-controls' },
            pkg ? h('span', { className: modeClass(pkg.flow) }, modeText(t, pkg.flow)) : null,
            packages.length > 1
              ? h(
                  'label',
                  { className: 'pk-pick' },
                  h('span', { className: 'pk-sr' }, t.package),
                  h(
                    'select',
                    { value: pkg?.id ?? '', onChange: (event) => setPkgId(event.target.value), 'aria-label': t.package },
                    packages.map((item) => h('option', { key: item.id, value: item.id }, item.id)),
                  ),
                )
              : null,
            h('button', { type: 'button', className: 'pk-btn', onClick: () => setTick((value) => value + 1) }, t.refresh),
          ),
        ),
        !cwd ? h('div', { className: 'pk-empty' }, t.noWorkspace) : null,
        cwd && !data && !error ? h('div', { className: 'pk-empty' }, t.loading) : null,
        error ? h('div', { className: 'pk-alert pk-alert--danger' }, `${t.error}: ${error}`) : null,
        data && !data.found ? h('div', { className: 'pk-empty' }, h('div', { className: 'pk-empty__title' }, t.noProcess), h('code', null, cwd)) : null,
        data?.found && !pkg ? h('div', { className: 'pk-empty' }, h('div', { className: 'pk-empty__title' }, t.noPackage), h('div', { className: 'pk-hint' }, t.emptyHint)) : null,
        pkg
          ? h(
              'div',
              { className: 'pk-grid' },
              h(
                'section',
                { className: 'pk-card' },
                h('div', { className: 'pk-card__title' }, t.title),
                h(
                  'ol',
                  { className: 'pk-steps' },
                  steps.map((step, index) => h(Step, { key: step.key, step: { ...step, label: labels[index] ?? step.label }, t })),
                ),
              ),
              h(
                'section',
                { className: 'pk-card' },
                tampered ? h('div', { className: 'pk-alert pk-alert--danger', role: 'alert' }, t.tampered) : null,
                h('div', { className: 'pk-card__title' }, t.next),
                h('div', { className: 'pk-next' }, pkg.next?.short ?? '—'),
                h('div', { className: 'pk-next__action' }, pkg.next?.action ?? ''),
                pkg.flow === 'managed' ? h('div', { className: 'pk-note' }, t.managedNote) : null,
                h(
                  'div',
                  { className: 'pk-meta' },
                  h('span', { className: `pk-chip pk-chip--${journal.tone}` }, `${t.journal} ${journal.text}`),
                  h('span', { className: 'pk-chip' }, `${t.workspace}: ${pkg.prdVersion ? `v${pkg.prdVersion}` : '—'}`),
                  pkg.openBugs?.length ? h('span', { className: 'pk-chip pk-chip--warn' }, `open bugs: ${pkg.openBugs.length}`) : null,
                ),
                h('div', { className: 'pk-progress' }, pkg.progress ?? ''),
              ),
            )
          : null,
      );
    }

    function SessionView(props) {
      const { sessionId, useSessions } = props;
      const cwd = useSessions((s) => (sessionId ? s.byId?.[sessionId]?.cwd ?? '' : ''));
      return h(Board, { cwd });
    }

    class ViewBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      render() {
        if (this.state.error) {
          return h('div', { className: 'pk-root' }, h('div', { className: 'pk-alert pk-alert--danger', role: 'alert' }, `看板加载失败：${this.state.error.message}`));
        }
        return this.props.children;
      }
    }

    function SessionViewSafe(props) {
      return h(ViewBoundary, null, h(SessionView, props));
    }

    const CSS = `
:root{--pk-text:#1f2328;--pk-muted:#656d76;--pk-border:#d0d7de;--pk-bg:#fff;--pk-card:#f6f8fa;--pk-accent:#0969da;--pk-ok:#1a7f37;--pk-warn:#9a6700;--pk-danger:#cf222e}
body[data-ds-dark-theme]{--pk-text:#e6edf3;--pk-muted:#8d96a0;--pk-border:#30363d;--pk-bg:#0d1117;--pk-card:#161b22;--pk-accent:#2f81f7;--pk-ok:#3fb950;--pk-warn:#d29922;--pk-danger:#f85149}
.pk-root{box-sizing:border-box;max-width:980px;margin:0 auto;padding:30px 32px 48px;color:var(--pk-text);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.pk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.pk-title{margin:0;font-size:20px;font-weight:650;letter-spacing:.01em}
.pk-sub{margin-top:4px;color:var(--pk-muted);font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
.pk-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pk-badge{display:inline-flex;align-items:center;height:24px;padding:0 10px;border:1px solid var(--pk-border);border-radius:999px;color:var(--pk-muted);font-size:12px;background:var(--pk-card)}
.pk-badge--managed{color:var(--pk-warn);border-color:color-mix(in srgb,var(--pk-warn) 45%,transparent);background:color-mix(in srgb,var(--pk-warn) 12%,transparent)}
.pk-badge--fast{color:var(--pk-accent);border-color:color-mix(in srgb,var(--pk-accent) 45%,transparent);background:color-mix(in srgb,var(--pk-accent) 12%,transparent)}
.pk-pick select,.pk-btn{height:28px;border:1px solid var(--pk-border);border-radius:7px;background:var(--pk-bg);color:var(--pk-text);font:12px ui-sans-serif,system-ui,sans-serif;padding:0 8px;max-width:320px}
.pk-btn{cursor:pointer}.pk-btn:hover{background:var(--pk-card)}
.pk-grid{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:16px;align-items:start}
.pk-card{border:1px solid var(--pk-border);border-radius:12px;background:var(--pk-bg);padding:16px;min-width:0}
.pk-card__title{font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--pk-muted);margin-bottom:10px}
.pk-steps{list-style:none;margin:0;padding:0}
.pk-step{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;padding:7px 0;position:relative}
.pk-step:not(:last-child)::before{content:"";position:absolute;left:11px;top:31px;bottom:-1px;border-left:1px solid var(--pk-border)}
.pk-mark{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid var(--pk-border);color:var(--pk-muted);font-size:12px;background:var(--pk-bg);position:relative;z-index:1}
.pk-step--done .pk-mark{background:var(--pk-ok);border-color:var(--pk-ok);color:#fff}
.pk-step--current .pk-mark{border-color:var(--pk-accent);color:var(--pk-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--pk-accent) 18%,transparent)}
.pk-step--delegated .pk-mark{border:1.5px dashed var(--pk-warn);color:var(--pk-warn);background:transparent}
.pk-step--blocked .pk-mark{border-color:var(--pk-danger);color:var(--pk-danger)}
.pk-step__body{min-width:0}
.pk-step__label{display:block;font-weight:550}
.pk-step__note{display:block;color:var(--pk-muted);font-size:12px}
.pk-step--delegated .pk-step__note{color:var(--pk-warn)}
.pk-step--current .pk-step__label{color:var(--pk-accent)}
.pk-next{font-size:16px;font-weight:600;margin:2px 0 4px}
.pk-next__action{color:var(--pk-muted);font-size:13px;margin-bottom:12px}
.pk-note{margin:8px 0 12px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--pk-warn) 45%,transparent);border-radius:8px;background:color-mix(in srgb,var(--pk-warn) 10%,transparent);color:var(--pk-warn);font-size:13px}
.pk-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.pk-chip{display:inline-flex;align-items:center;height:24px;padding:0 8px;border:1px dashed var(--pk-border);border-radius:6px;color:var(--pk-muted);font-size:12px}
.pk-chip--ok{color:var(--pk-ok);border-color:color-mix(in srgb,var(--pk-ok) 40%,transparent)}
.pk-chip--warn{color:var(--pk-warn);border-color:color-mix(in srgb,var(--pk-warn) 40%,transparent)}
.pk-chip--danger{color:var(--pk-danger);border-color:color-mix(in srgb,var(--pk-danger) 45%,transparent)}
.pk-progress{margin-top:12px;padding-top:10px;border-top:1px solid var(--pk-border);color:var(--pk-muted);font-size:12px;word-break:break-word}
.pk-empty{border:1px solid var(--pk-border);border-radius:12px;background:var(--pk-card);padding:28px;color:var(--pk-muted)}
.pk-empty__title{color:var(--pk-text);font-weight:600;margin-bottom:6px}
.pk-hint{font-size:12px}
.pk-alert{border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px}
.pk-alert--danger{border:1px solid color-mix(in srgb,var(--pk-danger) 45%,transparent);background:color-mix(in srgb,var(--pk-danger) 10%,transparent);color:var(--pk-danger)}
.pk-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (max-width:760px){.pk-root{padding:20px 16px 36px}.pk-grid{grid-template-columns:1fr}.pk-pick select{max-width:210px}}
@media (prefers-reduced-motion:reduce){.pk-mark{transition:none}}
`;

    return {
      inject: ['slots', 'uiConversation'],
      apply(ctx) {
        ctx.effect(() => ctx.uiConversation.views.register({
          target: 'process',
          create: () => ({
            empty: null,
            replace: () => null,
            apply: () => null,
          }),
        }), 'process-kit: conversation view target');
        ctx.effect(() => {
          const style = document.createElement('style');
          style.id = 'process-kit-panel-styles';
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'process-kit: panel styles');
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'process',
          order: 30,
          label: '研发流程',
        }, SessionViewSafe));
      },
    };
  },
});
