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
        packages: '需求包',
        path: '工作区',
        updated: '更新',
        approvals: '批准',
        runs: '门禁执行',
        artifacts: '产物',
        warnings: '状态告警',
        openBugs: 'open bugs',
        release: '发布',
        noRuns: '无执行记录',
        noApprovals: '无批准记录',
        aiHosted: 'AI 托管',
        unrecorded: '⚠ 无留痕',
        check: '核对件',
        prd: 'PRD',
        lines: '行数',
        none: '—',
        open: '查看',
        close: '关闭',
        docError: '文档读取失败',
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
        packages: 'Packages',
        path: 'Workspace',
        updated: 'Updated',
        approvals: 'Approvals',
        runs: 'Gate runs',
        artifacts: 'Artifacts',
        warnings: 'Status warnings',
        openBugs: 'open bugs',
        release: 'Release',
        noRuns: 'no runs',
        noApprovals: 'no approvals',
        aiHosted: 'AI-hosted',
        unrecorded: '⚠ no trace',
        check: 'Check',
        prd: 'PRD',
        lines: 'lines',
        none: '—',
        open: 'Open',
        close: 'Close',
        docError: 'Failed to read document',
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

    function Step({ step, t, detail }) {
      const note = stateNote(t, step.state);
      return h(
        'li',
        { className: `pk-step pk-step--${step.state}`, 'data-step': step.key, 'data-state': step.state },
        h('span', { className: 'pk-mark', 'aria-hidden': true }, MARK[step.state] ?? '○'),
        h(
          'span',
          { className: 'pk-step__body' },
          h('span', { className: 'pk-step__label' }, step.label),
          h('span', { className: 'pk-step__note' }, note),
          detail ? h('span', { className: 'pk-step__detail' }, detail) : null,
        ),
      );
    }

    function fmtTime(value) {
      if (!value) return '—';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function hostText(t, host) {
      if (host === 'human') return t.done;
      if (host === 'delegated') return `${t.delegated} · ${t.notHuman}`;
      if (host === 'ai-hosted') return t.aiHosted;
      if (host === 'unrecorded') return t.unrecorded;
      return t.none;
    }

    function runsFor(pkg, gate) {
      const key = String(gate).toLowerCase();
      return (pkg.journal?.runs ?? []).filter((run) => String(run.gate ?? '').toLowerCase() === key);
    }

    function approvalsFor(pkg, gate) {
      const key = String(gate).toLowerCase();
      return (pkg.journal?.approvals ?? []).filter((approval) => String(approval.gate ?? '').toLowerCase() === key);
    }

    function artifactsOf(t, pkg) {
      const rows = [];
      if (pkg.check?.file) rows.push([t.check, pkg.check.file]);
      if (pkg.prd?.file) rows.push([t.prd, pkg.prd.file]);
      for (const [key, value] of Object.entries(pkg.artifacts ?? {})) {
        if (typeof value === 'string' && value !== '') rows.push([key, value]);
      }
      return rows;
    }

    function Board({ cwd }) {
      const [pkgId, setPkgId] = useState('');
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const [tick, setTick] = useState(0);
      const [doc, setDoc] = useState(null);
      const [docError, setDocError] = useState('');

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

      const openDoc = async (path) => {
        setDocError('');
        try {
          const response = await fetch(`/process-kit/doc?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`, { cache: 'no-store' });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
          setDoc({ path: payload.path, text: payload.text });
        } catch (err) {
          setDoc({ path, text: '' });
          setDocError(String(err?.message ?? err));
        }
      };

      useEffect(() => {
        if (!doc) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') setDoc(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [doc]);

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
      const warnings = (data?.warnings ?? []).filter((warning) => !pkg || warning.includes(pkg.id));
      const artifacts = pkg ? artifactsOf(t, pkg) : [];
      const allRuns = pkg?.journal?.runs ?? [];
      const allApprovals = pkg?.journal?.approvals ?? [];

      const statusClassOf = (status) => (status === 'done' ? 'ok' : status === 'terminated' ? 'muted' : status === 'uat' || status === 'implementing' ? 'accent' : 'warn');

      return h(
        'div',
        { className: 'pk-root', 'data-ui': 'process-panel' },
        h(
          'header',
          { className: 'pk-head' },
          h(
            'div',
            { className: 'pk-head__main' },
            h('h1', { className: 'pk-title' }, t.title),
            h('div', { className: 'pk-path', title: cwd }, cwd || t.none),
          ),
          h(
            'div',
            { className: 'pk-controls' },
            pkg ? h('span', { className: modeClass(pkg.flow) }, modeText(t, pkg.flow)) : null,
            pkg ? h('span', { className: `pk-badge pk-badge--${statusClassOf(pkg.status)}` }, pkg.status) : null,
            data?.generatedAt ? h('span', { className: 'pk-muted' }, `${t.updated} ${fmtTime(data.generatedAt)}`) : null,
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
              { className: 'pk-layout' },
              h(
                'aside',
                { className: 'pk-col pk-col--packages' },
                h('div', { className: 'pk-col__title' }, `${t.packages} (${packages.length})`),
                h(
                  'div',
                  { className: 'pk-pkglist' },
                  packages.map((item) =>
                    h(
                      'button',
                      {
                        key: item.id,
                        type: 'button',
                        className: `pk-pkg${item.id === pkg.id ? ' is-active' : ''}`,
                        onClick: () => setPkgId(item.id),
                      },
                      h('span', { className: 'pk-pkg__id' }, item.id),
                      h('span', { className: `pk-pkg__status pk-pkg__status--${statusClassOf(item.status)}` }, item.status),
                      h('span', { className: 'pk-pkg__mode' }, modeText(t, item.flow)),
                    ),
                  ),
                ),
              ),
              h(
                'main',
                { className: 'pk-col pk-col--main' },
                h(
                  'section',
                  { className: 'pk-card pk-summary' },
                  tampered ? h('div', { className: 'pk-alert pk-alert--danger', role: 'alert' }, t.tampered) : null,
                  h(
                    'div',
                    { className: 'pk-summary__top' },
                    h('span', { className: 'pk-kicker' }, pkg.id),
                    h('span', { className: `pk-badge pk-badge--${statusClassOf(pkg.status)}` }, pkg.status),
                    h('span', { className: modeClass(pkg.flow) }, modeText(t, pkg.flow)),
                    pkg.prdVersion ? h('span', { className: 'pk-muted' }, `prdVersion v${pkg.prdVersion}`) : null,
                  ),
                  h('div', { className: 'pk-next' }, pkg.next?.short ?? '—'),
                  h('div', { className: 'pk-next__action' }, pkg.next?.action ?? ''),
                  h('div', { className: 'pk-progress' }, pkg.progress ?? ''),
                  pkg.flow === 'managed' ? h('div', { className: 'pk-note' }, t.managedNote) : null,
                ),
                h(
                  'section',
                  { className: 'pk-card' },
                  h('div', { className: 'pk-card__title' }, t.gateEvidence),
                  h(
                    'ol',
                    { className: 'pk-steps' },
                    steps.map((step, index) => {
                      const runs = runsFor(pkg, step.key);
                      const red = runs.filter((run) => run.exitCode !== null && run.exitCode !== 0).length;
                      const approval = approvalsFor(pkg, step.key).at(-1);
                      const host = pkg.gateHost?.[step.key];
                      const hostLabel = hostText(t, host);
                      const bits = [hostLabel === t.none && step.state === 'delegated' ? `${t.delegated} · ${t.notHuman}` : hostLabel];
                      bits.push(runs.length ? `run ${runs.length}${red ? ` · exit ${runs.at(-1).exitCode} 🚨` : ''}` : t.noRuns);
                      if (approval) bits.push(`${fmtTime(approval.at)} ${approval.actor ?? ''}`.trim());
                      return h(Step, {
                        key: step.key,
                        step: { ...step, label: labels[index] ?? step.label },
                        t,
                        detail: bits.join(' ｜ '),
                      });
                    }),
                  ),
                ),
                warnings.length
                  ? h(
                      'section',
                      { className: 'pk-card pk-card--warn' },
                      h('div', { className: 'pk-card__title' }, t.warnings),
                      warnings.map((warning) => h('div', { key: warning, className: 'pk-line' }, warning)),
                    )
                  : null,
              ),
              h(
                'aside',
                { className: 'pk-col pk-col--side' },
                h(
                  'section',
                  { className: 'pk-card' },
                  h('div', { className: 'pk-card__title' }, t.journal),
                  h(
                    'div',
                    { className: 'pk-kv' },
                    h('span', { className: `pk-chip pk-chip--${journal.tone}` }, journal.text),
                    h('span', { className: 'pk-chip' }, `${t.lines} ${pkg.journal?.lines ?? 0}`),
                    h('span', { className: 'pk-chip' }, `${t.updated} ${fmtTime(pkg.journal?.lastAt)}`),
                  ),
                  h('div', { className: 'pk-subtitle' }, t.approvals),
                  allApprovals.length
                    ? h(
                        'div',
                        { className: 'pk-rows' },
                        allApprovals.slice(-5).reverse().map((approval, index) =>
                          h(
                            'div',
                            { key: `${approval.at}-${index}`, className: 'pk-row' },
                            h('span', { className: 'pk-row__gate' }, approval.gate ?? '?'),
                            h('span', { className: 'pk-row__main' }, `${approval.actor ?? '—'} · ${approval.via ?? '?'}${Array.isArray(approval.delegate) && approval.delegate.length ? ` · delegate ${approval.delegate.join(',')}` : ''}`),
                            h('span', { className: 'pk-row__time' }, fmtTime(approval.at)),
                          ),
                        ),
                      )
                    : h('div', { className: 'pk-muted' }, t.noApprovals),
                  h('div', { className: 'pk-subtitle' }, t.runs),
                  allRuns.length
                    ? h(
                        'div',
                        { className: 'pk-rows' },
                        allRuns.slice(-5).reverse().map((run, index) =>
                          h(
                            'div',
                            { key: `${run.at}-${index}`, className: `pk-row${run.exitCode !== null && run.exitCode !== 0 ? ' pk-row--red' : ''}` },
                            h('span', { className: 'pk-row__gate' }, run.gate ?? '?'),
                            h('span', { className: 'pk-row__main', title: run.command ?? '' }, run.command ?? '—'),
                            h('span', { className: 'pk-row__time' }, run.exitCode === null ? '—' : `exit ${run.exitCode}`),
                          ),
                        ),
                      )
                    : h('div', { className: 'pk-muted' }, t.noRuns),
                ),
                h(
                  'section',
                  { className: 'pk-card' },
                  h('div', { className: 'pk-card__title' }, t.artifacts),
                  artifacts.length
                    ? h(
                        'div',
                        { className: 'pk-artifacts' },
                        artifacts.map(([label, value]) =>
                          h(
                            'button',
                            {
                              key: `${label}-${value}`,
                              type: 'button',
                              className: 'pk-artifact',
                              title: value,
                              onClick: () => openDoc(value),
                            },
                            h('span', { className: 'pk-artifact__label' }, label),
                            h('code', { title: value }, value),
                          ),
                        ),
                      )
                    : h('div', { className: 'pk-muted' }, t.none),
                ),
                pkg.openBugs?.length || data?.releasePending || data?.doneCount
                  ? h(
                      'section',
                      { className: 'pk-card' },
                      h('div', { className: 'pk-card__title' }, t.release),
                      pkg.openBugs?.length ? h('div', { className: 'pk-line' }, `${t.openBugs}: ${pkg.openBugs.join(', ')}`) : null,
                      data?.doneCount ? h('div', { className: 'pk-line' }, `done: ${data.doneCount}`) : null,
                      data?.releasePending ? h('div', { className: 'pk-line pk-line--warn' }, 'awaiting release regression') : null,
                    )
                  : null,
              ),
            )
          : null,
        doc
          ? h(
              'div',
              { className: 'pk-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': doc.path },
              h(
                'div',
                { className: 'pk-modal__panel' },
                h(
                  'div',
                  { className: 'pk-modal__head' },
                  h('code', { title: doc.path }, doc.path),
                  h('button', { type: 'button', className: 'pk-btn', onClick: () => setDoc(null) }, t.close),
                ),
                docError ? h('div', { className: 'pk-alert pk-alert--danger' }, `${t.docError}: ${docError}`) : null,
                h('pre', { className: 'pk-modal__body' }, doc.text),
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
.pk-root{box-sizing:border-box;max-width:1280px;margin:0 auto;padding:30px 32px 48px;color:var(--pk-text);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
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
.pk-head__main{min-width:0}
.pk-path{max-width:760px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--pk-muted);font:12px ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:4px}
.pk-layout{display:grid;grid-template-columns:220px minmax(0,1fr) 340px;gap:16px;align-items:start}
.pk-col{min-width:0;display:flex;flex-direction:column;gap:12px}
.pk-col__title{font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--pk-muted);padding:0 2px}
.pk-pkglist{display:flex;flex-direction:column;gap:4px}
.pk-pkg{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;width:100%;text-align:left;border:1px solid var(--pk-border);background:var(--pk-bg);border-radius:9px;padding:9px 10px;color:var(--pk-text);cursor:pointer;font:13px/1.35 ui-sans-serif,system-ui,sans-serif}
.pk-pkg:hover{background:var(--pk-card)}
.pk-pkg.is-active{border-color:var(--pk-accent);box-shadow:0 0 0 1px var(--pk-accent) inset}
.pk-pkg__id{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pk-pkg__mode{grid-column:2;grid-row:1;color:var(--pk-muted);font-size:11px}
.pk-pkg__status{grid-column:1/-1;font-size:12px}
.pk-pkg__status--ok{color:var(--pk-ok)}.pk-pkg__status--warn{color:var(--pk-warn)}.pk-pkg__status--danger{color:var(--pk-danger)}.pk-pkg__status--accent{color:var(--pk-accent)}.pk-pkg__status--muted{color:var(--pk-muted)}
.pk-summary{padding:18px}
.pk-summary__top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.pk-kicker{font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--pk-muted)}
.pk-step__detail{display:block;color:var(--pk-muted);font-size:12px;margin-top:2px;word-break:break-word}
.pk-badge--ok{color:var(--pk-ok);border-color:color-mix(in srgb,var(--pk-ok) 45%,transparent);background:color-mix(in srgb,var(--pk-ok) 10%,transparent)}
.pk-badge--warn{color:var(--pk-warn);border-color:color-mix(in srgb,var(--pk-warn) 45%,transparent);background:color-mix(in srgb,var(--pk-warn) 10%,transparent)}
.pk-badge--accent{color:var(--pk-accent);border-color:color-mix(in srgb,var(--pk-accent) 45%,transparent);background:color-mix(in srgb,var(--pk-accent) 10%,transparent)}
.pk-badge--muted{color:var(--pk-muted)}
.pk-kv{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.pk-subtitle{margin:12px 0 6px;color:var(--pk-muted);font-size:11px;font-weight:650;letter-spacing:.06em;text-transform:uppercase}
.pk-rows{display:flex;flex-direction:column;gap:4px}
.pk-row{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:8px;align-items:baseline;padding:5px 0;border-top:1px solid color-mix(in srgb,var(--pk-border) 65%,transparent);font-size:12px}
.pk-row__gate{font:600 11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--pk-muted)}
.pk-row__main{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pk-row__time{color:var(--pk-muted);white-space:nowrap}
.pk-row--red .pk-row__time{color:var(--pk-danger)}
.pk-artifacts{display:flex;flex-direction:column;gap:6px}
.pk-artifact{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;font-size:12px}
.pk-artifact__label{color:var(--pk-muted)}
.pk-artifact code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px ui-monospace,SFMono-Regular,Menlo,monospace}
.pk-line{font-size:13px;padding:3px 0;word-break:break-word}
.pk-line--warn{color:var(--pk-warn)}
.pk-muted{color:var(--pk-muted);font-size:12px}
.pk-card--warn{border-color:color-mix(in srgb,var(--pk-warn) 45%,transparent)}
@media (max-width:1180px){.pk-layout{grid-template-columns:200px minmax(0,1fr)}.pk-col--side{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr}}
@media (max-width:820px){.pk-layout{grid-template-columns:1fr}.pk-col--side{display:flex}}
.pk-artifact{border:0;background:transparent;padding:3px 0;text-align:left;color:var(--pk-text);cursor:pointer;font:inherit}
.pk-artifact:hover code{color:var(--pk-accent);text-decoration:underline}
.pk-artifact code{color:var(--pk-text)}
.pk-modal{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:24px}
.pk-modal__panel{width:min(980px,100%);max-height:86vh;display:flex;flex-direction:column;background:var(--pk-bg);border:1px solid var(--pk-border);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.35);overflow:hidden}
.pk-modal__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid var(--pk-border)}
.pk-modal__head code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
.pk-modal__body{margin:0;padding:16px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--pk-text)}
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
