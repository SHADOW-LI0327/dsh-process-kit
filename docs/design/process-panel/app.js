/* ==========================================================================
   研发流程看板 · 原型交互
   只做「状态切换 / 渲染 / 折叠 / 主题」；不接真实接口、不写业务逻辑。
   数据形状见 spec.md §2，对应 process_status 的归一化视图。
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     词表
     ------------------------------------------------------------------------ */

  var GATE_NAMES = {
    gate0: 'Gate0',
    gate1: 'Gate1',
    gate2: 'Gate2',
    gate4: 'Gate4'
  };

  var MODES = {
    full: {
      label: '逐步',
      cls: 'full',
      char: '逐',
      title: '逐步：Gate0/1/2/4 都停下等你',
      note: '逐步：4 个 Gate 都会停下等你。'
    },
    managed: {
      label: '托管',
      cls: 'managed',
      char: '托',
      title: '托管：Gate1/2 由 Gate0 授权，不是人签；验收仍由你签'
    },
    fast: {
      label: '快速',
      cls: 'fast',
      char: '快',
      title: '快速：只停需求确认',
      note: '快速：只在需求确认停 1 次，其余连续推进。'
    }
  };

  var JOURNAL = {
    verified: {
      glyph: '✓',
      label: '链式一致',
      tone: 'ok',
      title: 'meta.lines 与 chainHash 均一致（契约 3）'
    },
    legacy: {
      glyph: '⚠',
      label: '旧格式',
      tone: 'warn',
      title: 'meta 无 chainHash：只验了行数与末行，中间行不可验'
    },
    unverified: {
      glyph: '⚠',
      label: '未校验',
      tone: 'warn',
      title: '无 .meta.json 或指纹损坏：无法校验，不等于通过'
    },
    tampered: {
      glyph: '🚨',
      label: '篡改嫌疑',
      tone: 'danger',
      title: '行数 / lastHash / chainHash 对不上：停在这里，不推进'
    }
  };

  var STATUS = {
    draft: { tone: 'muted', gloss: 'draft：Gate1 前的需求 / 方案阶段' },
    frozen: { tone: 'warn', gloss: 'frozen：Gate1 已过，等测试归因' },
    red: { tone: 'danger', gloss: 'red：有验收测试未过' },
    implementing: { tone: 'accent', gloss: 'implementing：实现中' },
    verifying: { tone: 'accent', gloss: 'verifying：验证中' },
    uat: { tone: 'accent', gloss: 'uat：UAT 验收中，等你签 Gate4' },
    done: { tone: 'ok', gloss: 'done：已完成' },
    terminated: { tone: 'muted', gloss: 'terminated：已终止' }
  };

  /* ------------------------------------------------------------------------
     六个原型状态（数据形状与 process_status 的映射见 spec.md）
     ------------------------------------------------------------------------ */

  var STATES = {
    empty: {
      title: '空态',
      data: {
        mode: null,
        packageId: null,
        status: null,
        steps: [],
        next: null,
        qCount: null,
        journal: null
      }
    },

    'full-gate1': {
      title: '逐步 · 停在 Gate1',
      data: {
        mode: 'full',
        packageId: 'FEAT-001',
        status: 'draft',
        steps: [
          { key: 'gate0', label: '需求确认', state: 'done', at: '11-19 14:02' },
          { key: 'gate1', label: '方案确认', state: 'current', note: '当前停点' },
          { key: 'gate2', label: '测试确认', state: 'upcoming' },
          { key: 'gate4', label: '验收确认', state: 'upcoming' }
        ],
        next: {
          label: '等你拍板：方案确认',
          action: 'Gate1：确认方案后进测试；确认前不动测试和代码。'
        },
        qCount: 3,
        journal: 'verified'
      }
    },

    'managed-running': {
      title: '托管 · 推进中',
      data: {
        mode: 'managed',
        packageId: 'FEAT-007',
        status: 'implementing',
        steps: [
          { key: 'gate0', label: '需求确认', state: 'done', at: '11-19 14:02' },
          { key: 'gate1', label: '方案确认', state: 'delegated', delegatedBy: 'gate0', at: '11-19 14:03' },
          { key: 'gate2', label: '测试确认', state: 'delegated', delegatedBy: 'gate0', at: '11-19 14:03' },
          { key: 'gate4', label: '验收确认', state: 'upcoming', note: '未到 · 验收仍由你签' }
        ],
        next: {
          label: 'dev 实现中',
          action: 'Gate1/2 已由 Gate0 授权，不停；实现完成后出证据，等你在 Gate4 验收。'
        },
        qCount: 2,
        journal: 'verified'
      }
    },

    'managed-gate4': {
      title: '托管 · 停在 Gate4',
      data: {
        mode: 'managed',
        packageId: 'FEAT-009',
        status: 'uat',
        steps: [
          { key: 'gate0', label: '需求确认', state: 'done', at: '11-18 09:40' },
          { key: 'gate1', label: '方案确认', state: 'delegated', delegatedBy: 'gate0', at: '11-18 09:42' },
          { key: 'gate2', label: '测试确认', state: 'delegated', delegatedBy: 'gate0', at: '11-18 09:42' },
          { key: 'gate4', label: '验收确认', state: 'current', note: '当前停点 · 必须你签' }
        ],
        next: {
          label: '等你验收：跑一遍真机 UAT',
          action: 'Gate4：人签才算过；没过就退回，托管不代签。'
        },
        qCount: 1,
        journal: 'verified'
      }
    },

    fast: {
      title: '快速路径',
      data: {
        mode: 'fast',
        packageId: 'FEAT-012',
        status: 'implementing',
        steps: [
          { key: 'gate0', label: '需求确认', state: 'done', at: '11-19 10:20' },
          { key: 'impl', label: '实现/回归', state: 'current', note: '当前：连续推进' },
          { key: 'deliver', label: '交付', state: 'upcoming' }
        ],
        next: {
          label: '跑回归 + 出交付件',
          action: '实现完成后跑回归，把结果和证据一起给你；交付前你仍可叫停。'
        },
        qCount: 0,
        journal: 'verified'
      }
    },

    tampered: {
      title: 'journal 篡改',
      data: {
        mode: 'full',
        packageId: 'FEAT-003',
        status: 'frozen',
        steps: [
          { key: 'gate0', label: '需求确认', state: 'done', at: '11-18 16:40' },
          { key: 'gate1', label: '方案确认', state: 'blocked', note: '已冻结 · 校验失败' },
          { key: 'gate2', label: '测试确认', state: 'upcoming' },
          { key: 'gate4', label: '验收确认', state: 'upcoming' }
        ],
        next: {
          label: '先修复 journal',
          action: '从备份恢复 journal，或由人确认后重建指纹；修好前不推进、不签 Gate。'
        },
        qCount: null,
        journal: 'tampered',
        journalDetail: 'chainHash 与旁挂指纹不一致（第 3 行起）'
      }
    }
  };

  /* ------------------------------------------------------------------------
     DOM
     ------------------------------------------------------------------------ */

  var $ = function (id) {
    return document.getElementById(id);
  };

  var shell = $('shell');
  var panel = $('panel-region');
  var modeBadge = $('mode-badge');
  var pkg = $('pkg');
  var collapseBtn = $('collapse-btn');
  var rail = $('rail');
  var railDots = $('rail-dots');
  var railMode = $('rail-mode');
  var railJournal = $('rail-journal');
  var live = $('live');

  var alertBox = $('alert');
  var alertBody = $('alert-body');
  var timelineBlock = $('timeline-block');
  var timeline = $('timeline');
  var timelineFast = $('timeline-fast');
  var delegation = $('delegation');
  var modeNote = $('mode-note');
  var nextBox = $('next');
  var nextKicker = $('next-kicker');
  var nextText = $('next-text');
  var nextHint = $('next-hint');
  var nextPulse = $('next-pulse');
  var meta = $('meta');
  var qChip = $('q-chip');
  var qText = $('q-text');
  var journalChip = $('journal-chip');
  var journalGlyph = $('journal-glyph');
  var journalText = $('journal-text');
  var emptyBox = $('empty');

  var themeBtn = $('theme-toggle');
  var journalSelect = $('journal-override');
  var stateButtons = Array.prototype.slice.call(document.querySelectorAll('[data-demo-state]'));

  /* ------------------------------------------------------------------------
     运行时状态
     ------------------------------------------------------------------------ */

  var params = new URLSearchParams(window.location.search);
  var requestedState = params.get('state');
  var currentState = requestedState && STATES[requestedState] ? requestedState : 'full-gate1';

  var requestedJournal = params.get('journal');
  var journalOverride =
    requestedJournal === 'verified' || requestedJournal === 'legacy' || requestedJournal === 'unverified'
      ? requestedJournal
      : 'auto';

  var collapsed = params.get('collapsed') === '1';

  /* ------------------------------------------------------------------------
     渲染工具
     ------------------------------------------------------------------------ */

  function statusOf(data) {
    var tone = 'muted';
    var gloss = '';
    if (data.status && STATUS[data.status]) {
      tone = STATUS[data.status].tone;
      gloss = STATUS[data.status].gloss;
    }
    if (journalOf(data) === 'tampered') {
      tone = 'danger';
      gloss = 'frontmatter 写的是 ' + (data.status || 'unknown') + '，但 journal 校验失败，状态位不采信';
    }
    return { tone: tone, gloss: gloss };
  }

  function journalOf(data) {
    if (!data || !data.journal) return null;
    return data.journal;
  }

  function metaFor(step) {
    switch (step.state) {
      case 'done':
        return '人签' + (step.at ? ' · ' + step.at : '');
      case 'current':
        return step.note || '当前停点';
      case 'delegated':
        return '不是人签' + (step.at ? ' · ' + step.at : '');
      case 'blocked':
        return step.note || '已冻结 · 校验失败';
      default:
        return step.note || '未开始';
    }
  }

  function gateOf(step) {
    return GATE_NAMES[step.key] || null;
  }

  function makeStep(step) {
    var li = document.createElement('li');
    li.className = 'step step--' + step.state;
    li.setAttribute('data-step', step.key);
    li.setAttribute('data-state', step.state);
    if (step.state === 'current') li.setAttribute('aria-current', 'step');
    if (step.state === 'delegated') li.setAttribute('title', '托管：不是人签');

    var mark = document.createElement('span');
    mark.className = 'step__mark';
    mark.setAttribute('aria-hidden', 'true');
    if (step.state === 'done') mark.textContent = '✓';
    if (step.state === 'blocked') mark.textContent = '×';

    var box = document.createElement('div');
    box.className = 'step__box';

    var top = document.createElement('div');
    top.className = 'step__top';

    var label = document.createElement('span');
    label.className = 'step__label';
    label.textContent = step.label;
    top.appendChild(label);

    var gate = gateOf(step);
    if (gate) {
      var gateEl = document.createElement('span');
      gateEl.className = 'step__gate';
      gateEl.textContent = gate;
      top.appendChild(gateEl);
    }

    if (step.state === 'delegated') {
      var badge = document.createElement('span');
      badge.className = 'step__badge';
      badge.textContent = (GATE_NAMES[step.delegatedBy] || 'Gate0') + ' 授权';
      badge.setAttribute('title', '托管：不是人签');
      top.appendChild(badge);
    }

    var metaEl = document.createElement('p');
    metaEl.className = 'step__meta';
    metaEl.textContent = metaFor(step);

    box.appendChild(top);
    box.appendChild(metaEl);
    li.appendChild(mark);
    li.appendChild(box);
    return li;
  }

  function renderSteps(list, steps) {
    list.textContent = '';
    steps.forEach(function (step) {
      list.appendChild(makeStep(step));
    });
  }

  function renderPackage(data) {
    pkg.textContent = '';
    if (!data.packageId) {
      var empty = document.createElement('span');
      empty.className = 'pkg__empty';
      empty.textContent = '还没有需求包';
      pkg.appendChild(empty);
      pkg.removeAttribute('title');
      return;
    }

    var tone = statusOf(data);
    var id = document.createElement('span');
    id.className = 'pkg__id';
    id.textContent = data.packageId;

    var sep = document.createElement('span');
    sep.className = 'pkg__sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = ' · ';

    var dot = document.createElement('span');
    dot.className = 'pkg__dot pkg__dot--' + tone.tone;
    dot.setAttribute('aria-hidden', 'true');

    var status = document.createElement('span');
    status.className = 'pkg__status';
    status.textContent = data.status;

    pkg.appendChild(id);
    pkg.appendChild(sep);
    pkg.appendChild(dot);
    pkg.appendChild(status);
    pkg.setAttribute('title', tone.gloss);
  }

  function renderMode(data) {
    if (!data.mode || !MODES[data.mode]) {
      modeBadge.hidden = true;
      modeBadge.textContent = '';
      return;
    }
    var mode = MODES[data.mode];
    modeBadge.hidden = false;
    modeBadge.textContent = mode.label;
    modeBadge.className = 'mode-badge mode-badge--' + mode.cls;
    modeBadge.setAttribute('title', mode.title);
  }

  function renderAlert(data, journal) {
    if (journal !== 'tampered') {
      alertBox.hidden = true;
      return;
    }
    var detail = (data.journalDetail || '链式校验未通过').replace(/[。.]$/, '');
    alertBox.hidden = false;
    alertBody.textContent = detail + '。看板只报警、不推进；修好前任何 Gate 都不算数。';
  }

  function renderDelegation(data) {
    delegation.hidden = data.mode !== 'managed';
  }

  function renderModeNote(data) {
    if (!data.mode || !MODES[data.mode] || !MODES[data.mode].note) {
      modeNote.hidden = true;
      return;
    }
    modeNote.hidden = false;
    modeNote.textContent = MODES[data.mode].note;
  }

  function renderNext(data, journal) {
    if (!data.next) {
      nextBox.hidden = true;
      return;
    }
    var tampered = journal === 'tampered';
    var hasCurrent = data.steps.some(function (step) {
      return step.state === 'current';
    });

    nextBox.hidden = false;
    nextBox.classList.toggle('next--locked', tampered);
    nextKicker.textContent = tampered ? '下一步（已锁定）' : hasCurrent ? '下一步' : '现在';
    nextText.textContent = data.next.label;
    nextHint.textContent = data.next.action || '';
    nextPulse.hidden = tampered || hasCurrent;
  }

  function renderMeta(data, journal) {
    meta.hidden = false;

    if (typeof data.qCount === 'number' && data.qCount > 0) {
      qChip.hidden = false;
      qText.textContent = data.qCount + ' 个待确认';
      qChip.setAttribute('title', '还有 ' + data.qCount + ' 个问题等你拍板（Q）');
      qChip.setAttribute('aria-label', data.qCount + ' 个待确认问题');
    } else {
      qChip.hidden = true;
    }

    var j = JOURNAL[journal] || JOURNAL.unverified;
    journalChip.className = 'chip chip--' + j.tone;
    journalGlyph.textContent = j.glyph;
    journalText.textContent = j.label;
    journalChip.setAttribute('title', j.title);
    journalChip.setAttribute('aria-label', 'journal 完整性：' + j.label);
  }

  function renderRail(data, journal) {
    railDots.textContent = '';
    data.steps.forEach(function (step) {
      var dot = document.createElement('span');
      dot.className = 'rail__dot rail__dot--' + step.state;
      dot.setAttribute('title', step.label + '：' + metaFor(step));
      if (step.state === 'done') dot.textContent = '✓';
      if (step.state === 'blocked') dot.textContent = '×';
      railDots.appendChild(dot);
    });

    railMode.textContent = data.mode && MODES[data.mode] ? MODES[data.mode].char : '—';

    var j = journal ? JOURNAL[journal] : null;
    railJournal.textContent = j ? j.glyph : '—';
    railJournal.className = 'rail__journal' + (j ? ' rail__journal--' + j.tone : '');

    var modeLabel = data.mode && MODES[data.mode] ? MODES[data.mode].label + ' · ' : '';
    var current = data.steps.filter(function (step) {
      return step.state === 'current';
    })[0];
    var blocked = data.steps.filter(function (step) {
      return step.state === 'blocked';
    })[0];
    var delegated = data.steps.some(function (step) {
      return step.state === 'delegated';
    });
    var summary = current
      ? '停在' + current.label
      : blocked
        ? blocked.label + '已冻结'
        : delegated
          ? '托管推进中'
          : data.steps.length && data.steps.every(function (step) { return step.state === 'done'; })
            ? '全部完成'
            : '未开始';

    var label = data.packageId
      ? '展开研发流程看板：' + modeLabel + data.packageId + '，' + summary
      : '展开研发流程看板：还没有需求包';
    rail.setAttribute('aria-label', label);
    rail.setAttribute('title', label);
  }

  function render() {
    var entry = STATES[currentState] || STATES['full-gate1'];
    var data = entry.data;
    var journal = journalOf(data);

    if (journalOverride !== 'auto' && journal !== 'tampered') {
      journal = journalOverride;
    }

    panel.setAttribute('data-state', currentState);
    panel.setAttribute('data-mode', data.mode || 'none');
    panel.setAttribute('data-journal', journal || 'none');
    panel.setAttribute('aria-label', '研发流程看板' + (data.packageId ? '：' + data.packageId : '：还没有需求包'));

    /* 原型覆写只改健康徽标、不改步骤；篡改状态报警优先，不可覆写。 */
    if (journalSelect) {
      if (journalOf(data) === 'tampered') {
        journalSelect.value = 'auto';
        journalSelect.disabled = true;
        journalSelect.setAttribute('title', 'journal 已判定篡改：报警优先，不可覆写');
      } else {
        journalSelect.disabled = false;
        journalSelect.value = journalOverride;
        journalSelect.setAttribute('title', '仅原型演示：覆写健康徽标，不改步骤');
      }
    }

    renderMode(data);
    renderPackage(data);

    var isEmpty = !data.packageId;

    emptyBox.hidden = !isEmpty;
    timelineBlock.hidden = isEmpty;
    meta.hidden = isEmpty;
    alertBox.hidden = true;
    delegation.hidden = true;
    modeNote.hidden = true;
    nextBox.hidden = true;

    if (isEmpty) {
      renderRail(data, null);
      return;
    }

    renderAlert(data, journal);
    renderDelegation(data);
    renderModeNote(data);
    renderNext(data, journal);
    renderMeta(data, journal);

    if (data.mode === 'fast') {
      timeline.hidden = true;
      timelineFast.hidden = false;
      renderSteps(timelineFast, data.steps);
    } else {
      timelineFast.hidden = true;
      timeline.hidden = false;
      renderSteps(timeline, data.steps);
    }

    renderRail(data, journal);
  }

  /* ------------------------------------------------------------------------
     折叠
     ------------------------------------------------------------------------ */

  function applyCollapsed(value, moveFocus) {
    collapsed = value;
    shell.classList.toggle('shell--collapsed', collapsed);
    panel.hidden = collapsed;
    rail.hidden = !collapsed;
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    rail.setAttribute('aria-expanded', String(!collapsed));

    if (moveFocus) {
      (collapsed ? rail : collapseBtn).focus();
    }
  }

  /* ------------------------------------------------------------------------
     URL 同步（file:// 下 replaceState 可能被拒，失败不影响状态切换）
     ------------------------------------------------------------------------ */

  function syncUrl() {
    try {
      var next = new URLSearchParams(window.location.search);
      next.set('state', currentState);
      if (collapsed) next.set('collapsed', '1');
      else next.delete('collapsed');
      if (journalOverride !== 'auto') next.set('journal', journalOverride);
      else next.delete('journal');
      var theme = document.documentElement.getAttribute('data-theme') || 'dark';
      next.set('theme', theme);
      window.history.replaceState(null, '', window.location.pathname + '?' + next.toString());
    } catch (err) {
      /* 忽略：原型仍可切换，只是地址栏不更新 */
    }
  }

  function updatePressed() {
    stateButtons.forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-demo-state') === currentState));
    });
  }

  function announce(text) {
    if (live) live.textContent = text;
  }

  function setState(id) {
    if (!STATES[id]) return;
    currentState = id;
    render();
    updatePressed();
    announce('已切换到：' + STATES[id].title);
    syncUrl();
  }

  /* ------------------------------------------------------------------------
     主题
     ------------------------------------------------------------------------ */

  function themeLabel() {
    var theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = theme === 'dark' ? '浅色' : '深色';
    themeBtn.textContent = '切到' + next;
    themeBtn.setAttribute('aria-label', '切换到' + next + '主题');
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem('pp-theme', theme);
    } catch (err) {
      /* file:// 或隐私模式可能禁用 localStorage */
    }
    themeLabel();
    syncUrl();
  }

  /* ------------------------------------------------------------------------
     事件
     ------------------------------------------------------------------------ */

  stateButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setState(btn.getAttribute('data-demo-state'));
    });
  });

  collapseBtn.addEventListener('click', function () {
    applyCollapsed(true, true);
    announce('看板已折叠');
    syncUrl();
  });

  rail.addEventListener('click', function () {
    applyCollapsed(false, true);
    announce('看板已展开');
    syncUrl();
  });

  themeBtn.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    setTheme(next);
    announce('已切换到' + (next === 'dark' ? '深色' : '浅色') + '主题');
  });

  journalSelect.addEventListener('change', function () {
    var value = journalSelect.value;
    journalOverride = value === 'verified' || value === 'legacy' || value === 'unverified' ? value : 'auto';
    render();
    announce('journal 健康徽标已切换为：' + (journalOverride === 'auto' ? '跟随状态' : journalOverride));
    syncUrl();
  });

  /* ------------------------------------------------------------------------
     初始化
     ------------------------------------------------------------------------ */

  journalSelect.value = journalOverride;
  themeLabel();
  render();
  updatePressed();
  applyCollapsed(collapsed, false);
})();
