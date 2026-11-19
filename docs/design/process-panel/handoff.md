# process-panel · 研发流程看板 UI 交接

> 给 dev 的落地桥：`UI-NN → 选择器 → 组件判定 → 状态 → 令牌 → 文案 → 测试钩子`。
> 完整规格见同目录 `spec.md`；数据形状与边界见 §2。**本目录不是生产代码**，`index.html` / `styles.css` / `app.js` 只是设计载体。

## 入口与状态

- 入口：`docs/design/process-panel/index.html`（双击 / 静态服务器均可打开；无构建、无外部网络）
- 样式：`styles.css`；交互：`app.js`（只做状态切换、折叠、主题；不接真实 API）
- 六个状态：`?state=empty` / `?state=full-gate1` / `?state=managed-running` / `?state=managed-gate4` / `?state=fast` / `?state=tampered`
- 折叠：`?collapsed=1`；也可点头部折叠按钮 / 摘要栏
- 主题：`?theme=light` / `?theme=dark`；生产跟随宿主主题，不出现工具条
- journal 覆写（**仅原型工具条**）：`?journal=legacy` / `?journal=unverified`；只改健康徽标、不改步骤；`tampered` 报警优先、不可覆写
- 浏览器核对：Microsoft Edge 157.0.4341.60（headless）· 1280×900 · 390×844（CDP）· 另看 492×1000
- 未核对：Safari / Firefox、真机触屏、屏幕阅读器实际播报（只核了 ARIA 结构与属性）

## UI-NN 交接表

| UI-NN | 选择器 | 组件判定 | 状态 | 数据字段 | 令牌 | 文案 | 测试钩子 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UI-01` | `.panel[data-ui="UI-01"]` | `new:C-1` 面板容器 | 六态；折叠时 `hidden` | `found` / `packages[]` | `--surface` `#161b22` / `#ffffff`；`--border`；圆角 `12px`；宽 `280–320px`（演示 `300px`） | — | `ui-01` / `data-state` |
| `UI-02` | `#collapse-btn[data-ui="UI-02"]` | `new:C-7` 折叠控制 | 展开态可见；折叠后隐藏 | `?collapsed`（展示态） | `--text-soft`；`26×26px`；焦点环 `--focus` | `折叠研发流程看板`（aria） | `ui-02` / `aria-expanded` |
| `UI-03` | `.panel__heading[data-ui="UI-03"]` + `#mode-badge` | `new:C-4` 模式徽标 | `full` / `managed` / `fast`；空态隐藏 | `flow` → `mode` | `--surface-2` / `--warn-soft` / `--accent-soft`；`12px`；圆角 `999px` | `研发流程`；`逐步` / `托管` / `快速`；托管 title 见 W-14 | `ui-03` / `.mode-badge--*` |
| `UI-04` | `#pkg[data-ui="UI-04"]` | `new:C-5` 包 ID + 状态 | 非空态；空态显示空文案 | `id` / `status` | `--text` / `--text-soft`；等宽 `12px`；状态点 `7px` | `{packageId} · {status}`；空态 `还没有需求包` | `ui-04` |
| `UI-05` | `#timeline-block[data-ui="UI-05"]` | `new:C-2` 时间线容器 | 非空态；空态隐藏 | `gates` / `next.gate` | `--border` 连接线 `2px`；块间距 `8px` | — | `ui-05` |
| `UI-06` | `#timeline[data-ui="UI-06"]`；子选择器 `.step[data-step="gate1"] .step__mark` | `new:C-3` 步骤状态标记 | `done` / `current` / `delegated` / `upcoming` / `blocked` | `gates` / `gateHost` / `steps[].state` | done `--success-fill` `#238636`/`#1a7f37` + 白 ✓；current `--accent-fill`；delegated `--warn-fill` 虚线；upcoming `--border-strong`；blocked `--danger-fill` | 步骤名 + gate 辅注；done `人签`；current `当前停点`；delegated `Gate0 授权` + `不是人签`；upcoming `未开始`；blocked `已冻结 · 校验失败` | `ui-06` / `.step--delegated` / `aria-current="step"` |
| `UI-07` | `#delegation[data-ui="UI-07"]` | `new:C-8` 托管授权说明 | 仅 `managed` | `flow=managed` | `--warn` / `--warn-soft` / `--warn-border`；`13px` | `托管怎么算数`；`Gate1/2 由你在 Gate0 授权，不是人签；验收仍由你签。` | `ui-07` |
| `UI-08` | `#next[data-ui="UI-08"]` + `#next-kicker` | `new:C-6` 下一步卡片 | 非空态；`tampered` 加 `.next--locked` | `next.short` / `next.action` | `--surface-2` / `--border`；locked 用 `--danger-soft` / `--danger`；`14px` | `下一步` / `现在` / `下一步（已锁定）`；`{next.label}`；`{next.action}` | `ui-08` / `.next--locked` |
| `UI-09` | `#q-chip[data-ui="UI-09"]` | `new:C-6` 信息区 chip | `qCount>0` 显示，否则 `hidden` | `qCount` | `--text-soft`；`--border` 虚线；高 `24px` | `{qCount} 个待确认`；title `还有 {qCount} 个问题等你拍板（Q）` | `ui-09` |
| `UI-10` | `#journal-chip[data-ui="UI-10"]` | `new:C-6` 信息区 chip | `verified` / `legacy` / `unverified` / `tampered`；空态隐藏 | `journal.integrity.state` | `--success-soft` / `--warn-soft` / `--danger-soft` + 对应 `--*-border`；`12px` | `✓ 链式一致` / `⚠ 旧格式` / `⚠ 未校验` / `🚨 篡改嫌疑` | `ui-10` / `.chip--ok` / `.chip--warn` / `.chip--danger` |
| `UI-11` | `#empty[data-ui="UI-11"]` | `new:C-10` 空态引导 | 仅 `packageId=null` | `found=false` / `packageId=null` | `--text-soft`；`15px` 标题；`8px` 圆角/分隔线 | `把需求一句话发我，我来建包`；4 个拍板点；见 W-18–W-22 | `ui-11` |
| `UI-12` | `#timeline-fast[data-ui="UI-12"]` | `new:C-2` 快速时间线 | 仅 `mode=fast` | `flow=fast` / `progress` | 同 UI-05；3 步 | `需求确认` / `实现/回归` / `交付` | `ui-12` |
| `UI-13` | `#alert[data-ui="UI-13"]` | `new:C-9` 篡改报警 | 仅 `journal=tampered`；`role="alert"` | `journal.integrity.state=tampered` / `reason` | `--danger` / `--danger-soft` / `--danger-border`；左 `3px` 实线 | `🚨 journal 篡改嫌疑`；`{journalDetail}。看板只报警、不推进；修好前任何 Gate 都不算数。` | `ui-13` / `role="alert"` |
| `UI-14` | `#rail[data-ui="UI-14"]` | `new:C-7` 折叠摘要栏 | 仅折叠态 | `flow` / `id` / `steps` / `journal` | `--surface`；宽 `48px`；竖排 `12px`；glyph `✓ ● ◌ ○ ×` | 竖排 `研发流程`；模式首字 `逐 / 托 / 快`；aria 模板见 W-29/W-30 | `ui-14` / `aria-label` |

> `data-ui` 是稳定钩子，`data-testid="ui-01"`…`ui-14` 与之一一对应。**不要用 class 作为唯一测试选择器**；class 可重构，`data-ui` / `data-testid` / `data-state` / `data-step` 不可随意改。

## 数据接线

### 字段映射

| 看板字段 | 来源 | 备注 |
| --- | --- | --- |
| `mode` | `package.flow` | `full` / `managed` / `fast` |
| `packageId` | `package.id` | 空态 `null` |
| `status` | `package.status` | 原样显示；中文释义只放 `title` |
| `steps` | `gates` + `gateHost` + `next.gate` | 四步固定 Gate0/1/2/4；fast 用 `gate0/impl/deliver` |
| `steps[].state=done` | `gates[k]=approved` 且 `gateHost[k]=human` | **只有 human 才画绿 ✓** |
| `steps[].state=delegated` | `gates[k]=approved` 且 `gateHost[k]=delegated` | 空心 ◌ + `Gate0 授权`；**绝不 done** |
| `steps[].state=current` | `gates[k]!=approved` 且 `next.gate=GateN` | `aria-current="step"` |
| `steps[].state=upcoming` | 当前停点之后 | ○ |
| `steps[].state=blocked` | `journal.integrity.state=tampered` / 驳回 | ×；不推进 |
| `steps[].delegatedBy` | Gate0 的 `delegate[]` | 显示 `{GateN} 授权` |
| `next.label` | `package.next.short` | 一行 |
| `next.action` | `package.next.action` | 说明行 |
| `qCount` | **契约无此字段**（UQ-1） | 暂按 PRD/核对件 Q 数；缺失时隐藏 chip |
| `journal` | `package.journal.integrity.state` | `verified` / `legacy` / `tampered` / `unverified` |
| `journalDetail` | `journal.integrity.reason` | 可缺省 |
| 空态 | `snapshot.found=false` 或 `packages.length=0` | 不显示假包 |

### 三条硬规则（不要实现成别的）

1. **delegated 不是人签**：`gates[k]=approved` + `gateHost[k]=delegated` 必须走 `step--delegated`，用琥珀虚线空心 ◌ + 「Gate0 授权」+「不是人签」；不得用 `step--done` / 绿色 / ✓。
2. **tampered 只报警、不推进**：`journal=tampered` 时显示 UI-13、把下一步置为「下一步（已锁定）」、不提供任何批准 / 重试 / 跳转入口；`journal=legacy|unverified` 用 ⚠，不得显示 ✓。
3. **托管文案逐字**：`Gate1/2 由你在 Gate0 授权，不是人签；验收仍由你签。` 不得改写、不得省略「不是人签」「验收仍由你签」。

### 状态到达与断言

| `?state=` | 模式 | 关键断言 |
| --- | --- | --- |
| `empty` | — | 标题「把需求一句话发我，我来建包」；4 个拍板点；无 Gate 术语；无时间线 |
| `full-gate1` | 逐步 | `gate0=done`、`gate1=current`、`gate2/gate4=upcoming`；下一步「等你拍板：方案确认」；`3 个待确认`；`✓ 链式一致` |
| `managed-running` | 托管 | `gate1/gate2=delegated` 且各带「Gate0 授权」+「不是人签」；无绿色 ✓ 落在 Gate1/2；下一步标签「现在」；托管说明逐字 |
| `managed-gate4` | 托管 | `gate1/gate2=delegated`；`gate4=current` +「必须你签」；下一步「等你验收：跑一遍真机 UAT」 |
| `fast` | 快速 | 只有 3 步「需求确认 / 实现/回归 / 交付」；不出现 Gate1/2/4 步骤；`qCount=0` 隐藏 |
| `tampered` | 逐步 | 顶部 `role="alert"`；`gate1=blocked`；下一步「下一步（已锁定）」；`🚨 篡改嫌疑`；无批准入口 |

## dev 必须保留 / 可自由替换

### 必须保留（改了就是偏离设计）

- 六个状态与文案：`W-01`–`W-30` 逐字；尤其 W-14 托管说明、W-17 journal、W-18–W-22 空态、W-25–W-26 篡改。
- 状态语义：`done` 只能是人签；`delegated` 必须是「琥珀虚线空心 + Gate0 授权 + 不是人签」，不得是绿色 ✓；`blocked` 是 ×。
- 模式：逐步 / 托管 / 快速；快速只显示 3 步，不硬套四步。
- journal 四态：`✓ / ⚠ / ⚠ / 🚨`，`legacy` / `unverified` 不得升级成 ✓。
- 篡改态：只报警、不推进；无批准按钮；下一步锁定。
- 只读定位：面板不提供 Gate 批准 / 代签入口。
- 宽度 `280–320px`；折叠栏 `48px`；浅色 / 深色都可用；焦点环、`aria-current`、`aria-expanded`、`role="alert"`。
- `data-ui` / `data-testid` / `data-state` / `data-step` 稳定。

### 可自由替换

- DOM 结构、class 名、框架组件、图标实现（但 glyph 语义要保留：✓ / ● / ◌ / ○ / × 必须可区分）。
- 动画实现（脉冲 / 过渡）；`prefers-reduced-motion` 必须保留。
- 颜色映射到宿主令牌（若宿主有项目令牌）：**必须保持语义 + 对比度**；delegated 不得因换色变绿，journal 的 ⚠ 不得变 ✓。
- 数据适配层：如何从 `process_status` 折成 `steps`、如何取 `qCount`、多包取哪一包。
- 滚动容器、内部间距的微调（±4px 内），但面板宽度与折叠栏宽度不变。

### 偏差登记

- 与 `spec.md` §10 的 `UD-1`–`UD-11` 一致；dev 若发现必须偏离，**回写本节并报主控**，不要静默改口径。
- 特别说明：`full-gate1` 用 `status=draft` 而不是 `frozen`；按契约 `frozen` 表示 Gate1 已过。`tampered` 保留 `frozen`，用来展示「状态位写 frozen 但链断」。
- `?journal=legacy|unverified` 是原型工具条专用，生产不出现。

## 自检

### 静态 / 门禁

- `node --check app.js`：通过。
- `data-ui`：`UI-01`–`UI-14` 共 14 个，唯一、无越界；每个有 `data-testid`。
- 外部资源：0 个 `http(s)://` / `//cdn` / `@import` / `url(...)`；本地 `href/src` 均存在。
- 六个 `?state=` 均可达；折叠 `?collapsed=1` 可达；`?theme=light|dark` 可达。
- 对比度：主文字 / 辅助文字 / 语义色 / chip 均 ≥ 4.5:1（计算值见 `spec.md` §8.5）；白色 ✓ on 绿底 ≥ 4.63:1。
- 浏览器：Edge 157.0.4341.60 headless；1280×900 + 390×844（CDP，`scrollWidth=390` 无横向滚动）。
- CDP 逐态断言：六态的 `data-state` / 模式 / 步骤序列均匹配；`managed-*` 的 `delegation` 可见且 Gate1/2 为 `delegated`；`tampered` 的 `alert` 可见、下一步锁定；`?collapsed=1` 时 `panel.hidden=true` / `rail.hidden=false`，焦点落在 `rail`，展开后回到 `collapse-btn`。
- 静态一致性：15 / 15 PASS（`data-ui` 14/14、`data-testid` 14/14、无外链、文案约束、CSS 配平）。

### 原型门禁原始输出

> 本仓库不是流程仓，`check-ui-prototype.mjs` 需要 `docs/process` 结构。为验证交付完整性，在 `/tmp/ppgate` 建**临时门禁根**（不属于交付物），复制本目录四个原型文件 + `spec.md` 后执行：

```bash
node scripts/check-ui-prototype.mjs --root /tmp/ppgate --pkg FEAT-001
```

实测输出（退出码 `0`）：

```text
UI 原型门禁：FEAT-001
  ✓ ① UI 规格 — 14 条 UI-NN
  ✓ ② HTML 入口 — index.html 存在且含 doctype
  ✓ ② 视口 — 含 viewport meta
  ✓ ③ data-ui 覆盖 — 14 个 data-ui 覆盖全部 UI-NN
  ✓ ④ 交接表 — 14 条 UI-NN 均有交接
  ✓ ④ 交接表结构 — 含 UI-NN / 选择器表头
  ✓ ⑤ 外部资源 — 未发现外部网络引用
  ✓ ⑤ 本地链接 — href/src 本地目标均存在
  ✓ 状态切换 — HTML 含 data-state 标记
  ✓ 测试钩子 — HTML 含 data-testid

结果：10 ✓ / 0 ⚠ / 0 ❌
```

临时门禁根不写进仓库；本目录不产生 PNG / PSD。

### 未覆盖

- Safari / Firefox；真机触屏；屏幕阅读器真实播报；DSH 宿主内的真实侧栏宽度与主题注入。
- 生产数据接线（`qCount` 来源、多包选择、`ai-hosted` 样式）见 `spec.md` §10–§11。
