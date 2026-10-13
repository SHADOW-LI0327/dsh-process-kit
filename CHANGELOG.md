# CHANGELOG

## 0.3.0

- **`ui-designer` 技能固定工具优先级**：PhotoCraft CLI > Adobe Photoshop > 其它；Photoshop 出图时几何要自己导，**证据必须标注「手工导出、未经重导验证」**。
- **UI 几何门禁判不了就说判不了**：产物里 0 个文字层（文字被栅格化）时，③ 重叠 / ④ 过挤 / ⑧ 对比度不再打印「✓」，一律 ⚠ 并点名原因。
- **`scaffold/PROJECT.md` §3 示例行**：`journal.jsonl` 的通配补上 `.meta.json` 旁挂文件，避免框架自己生成的 audit 文件被落点门禁判越界。

## 0.2.0

**新增**

- 第 8 个角色 **`ui-designer`（UI 设计）**：把《设计与说明》里触及 UI 的条目翻译成可验收的 UI 规格 —— 组件判定（`reuse` / `change` / `new`）+ 交互状态矩阵 + 用户可见文案定稿。位置在 pm 之后、test 之前，**随 Gate1 一并送审，不新增停点、不新增状态位**；由人在 Gate0 用核对件 `uiDesign: required / not-needed` 显式决定是否派单，纯后端包流程不变。只翻译不发明、禁改实现源码、不出验收结论。
- 新模板 `scaffold/prd/_UI_SPEC_TEMPLATE.md`（含 §8.0 技术与手段、§八 原型图与视觉数值）。
- **新门禁 `scripts/check-ui-geometry.mjs`**：判「界面摆得对不对」里客观可判的那部分 —— 溯源 / 溢出 / 文字重叠 / 过挤 / 居中 / 边距对称 / 网格 / 对比度 / 深验证 / 令牌一致性。两条防自述口径：几何 `bounds` 只能由适配器导出（`source` + 真实存在的 `artifact`），居中与内容带等意图写在 `intent.json`，测量结果与作者意图不得互相冒充。适配器 `--from-photocraft` 可直接从 `.psd` 图层包围盒导出；阈值与原型目录登记在 `PROJECT.md` §4。
- **UI 通用默认层**：`scaffold/ui/tokens.md`（间距 / 字号 / 中文 tracking / 语义色 / 圆角 / 控件高，含移动端 390×844 基准与栏内基线）+ `scaffold/ui/recipe.md`（桌面与移动端骨架、复杂度配方）。**项目令牌优先**：`PROJECT.md` §4 配了「UI 项目令牌」就必须先照抄、不得发明，**禁止与默认层混用**，冲突以项目为准并停下上报。
- **交付物形态落定**：原型图（位图）+ 分层源 + UI 规格，**不走 HTML 原型**；视觉数值（颜色 / 间距 / 字号字距 / 圆角）必须给字面值。
- **技术与手段必须声明，角色整体可不用**：出图工具与版本 / 出图命令 / 输出规格含 ppi / 几何导出 / 分层源 / 令牌来源。三条不使用路径 —— 只出规格不出图（数值表仍必填）、出图不用几何门禁（须显式声明，门禁不判红只提示）、整个 UI 设计不做。**框架不绑定任何具体工具**，工具选型不是流程判据。
- `process_status` 新增 `🎨UI 设计` 标记、`uiDesign` 与 `artifacts.uiSpec` 返回，以及两类一致性警告（`flow=fast` 与 `uiDesign=required` 冲突；`uiDesign=required` 但 Gate1 已过却缺 UI 规格）。
- 门禁支持**一包多屏**：`geometry.json` 与 `geometry.<屏幕名>.json` 可并存逐屏判定，作者意图优先取同名 `intent.<屏幕名>.json`。

**修复**

- **门禁溯源从「声明」变成「验证」**：`source` 只是自述字符串、不构成证据；新增机器可验的 `artifact`（文件不存在 ⇒ ❌，未标 ⇒ ⚠）与 `--verify`（重跑适配器、逐元素比对 `bounds`）。
- 新增 **⑧ 对比度门禁**（WCAG，从产物合成像素采样，阈值可配）；文字「完全不可见」（前景色 == 背景色）不再静默跳过，逐像素复核后判 ❌。
- 新增 **⑩ 项目令牌一致性**：画面主色必须全部能由令牌色板推导（允许色板内两色按任意 α 叠加）；未配令牌只 ⚠ 不判红。
- 修复 `⑩` 的 α 叠加白名单实际未生成（传 Map 迭代器被提前耗尽）——曾导致淡色底一律被误判为表外色。
- 修复 `⑩` 从子目录运行时静默降级（相对 `artifact` 未 `resolve` 到仓库根）。
- 修复 `⑧` 的逐像素复核从未生效（变量名不匹配抛错被空 `catch` 吞掉，会把细笔画层判成「完全不可见」）。
- 修复 `--from-photocraft` 静默丢弃作者意图（`intent.json` 未加载，⑤ 居中 / ⑥ 边距整条空转）；现支持显式 `--intent <路径>` 或按 `--emit` 路径推导。
- 修复 `PROJECT.md` §4 的 UI 配置键被静默忽略（`readSection` 参数写反 ⇒ 一律回落默认值，只有改成非默认值才暴露）。
- 修复落点门禁两处：中文命名的产物一律被误判越界（git 对非 ASCII 路径的八进制转义，改用 `-z`）；`ui/tokens.md` 与 `ui/recipe.md` 未被 §3 属主表授权（每个新项目初始化即 2 个文件越界）。
- 门禁输出不再被超长命令行刷屏（错误信息截断到 160 字符）。
- 三处健壮性上限：`process_init` 的 `scriptsDir` 不得越出工作区；`⑧` 逐像素复核每层 40000 点上限；`⑩` 令牌源单文件 4MB / 色值 200 / 展开 150 万条上限，超限明说跳过。
- 恢复被误删的 `scaffold/README.md`，清掉 `test/README.md` 残留副本。

**测试**

- 新增 `test/scripts.test.mjs` 与假适配器 `test/fixtures/fake-photocraft.mjs`（让依赖真实像素采样的 ⑧ / ⑩ 在没装 PhotoCraft 的环境里也能常规回归）。

**配套同步**

- 状态机两处：`lib/index.js` 的 `nextAction` 与 `scaffold/orchestrator.md` §2 状态→动作表。
- 角色矩阵新增一行，关键边界由两组扩为三组（新增「ui-designer 定状态 vs uat 判体验」）；Gate1 审件包与摘要补原型图与几何门禁结论。
- 接力闭环：`test-agent` / `dev-agent` 读源清单补入 UI 规格；`uat-agent` 刻意不补（它是唯一全禁角色）。
- 角色计数 7 → 8：`README.md` · `docs/DESIGN.md` · `AGENTS.template.md` · `lib/index.js` · `package.json` · `scaffold/PROJECT.md` · `test/host.test.mjs` · `test/skill-registry.test.mjs`。

## v0.1.0 — 首个通用版

从一套实战跑通的「单人开发 + LLM 角色协作」流程中抽出，做成可安装、可上传 git 的通用框架。

**新增**

- 四个工具：`process_status`（状态机快照 + 下一步动作）、`gate_summary`（两段式 Gate 摘要骨架）、`process_journal`（锁 + 指纹校验 + 原子替换的 journal 追加）、`process_init`（骨架与脚本初始化，只增不改）。
- 7 个通用角色技能打包进插件（`product-manager` / `test-agent` / `dev-agent` / `uat-agent` / `code-review-agent` / `security-review-agent` / `logic-review-agent`），以 rank 600（bundled 档）注册；项目 `.dsh/skills/**` 覆盖同名技能。**默认在所有工作区广播**，`PROCESS_KIT_SKILLS=off` 可静默。
- 流程骨架 `scaffold/`：总纲、调度手册、项目适配槽位 `PROJECT.md`（§1–§7）、核对件 / PRD / 设计与说明模板、过程载体登记区说明。
- `AGENTS.md` 项目级常驻指针：缺失时按 `AGENTS.template.md` 建一份（已存在则绝不改写，只打印待并入段落），`agents: false` 可跳过。
- 零依赖门禁脚本 `scripts/*.mjs`：`journal-append`、`check-artifact-paths`、`check-rules`、`sync-prd-version`、`check-uat-readiness`（只用 `node:` 内置模块）。
- 页面部分看板：右下角浮层，展示每包 status / Gate 四灯 / 下一步动作 / open bugs / 状态位不一致警告。
- 测试：`test/host.test.mjs`（工具与状态机）、`test/client.test.mjs`（看板渲染）、`test/skill-registry.test.mjs`（挂进真实注册表验证候选/定义/优先级）。

**分发**

- 三条标准安装 spec 全部可用：npm 包名、`github:SHADOW-LI0327/dsh-process-kit`、本地绝对路径。
- 新增 `peerDependencies: { "@deepseek-ai/dsh": ">=0.1.7-rc.2 <0.3.0" }`：装不上时明确拒绝，而不是装上一个静默失效的插件。
- 修 `dsh.client.inject`：由空数组改为 `["@deepseek-ai/dsh-client-ui-layout"]`（页面部分注册进 `shell.overlay`，该 slot 由 layout 提供）。
- 补 `files` 白名单（此前 `npm pack` 会把 `test/**` 打进包里）与 `repository` / `homepage` / `bugs` / `keywords` / `engines` / `publishConfig`。
- 文档去黑话（「Host 半 / 浏览器半」→「服务端部分 / 页面部分」）；README 拆为使用者视角，实现细节与踩坑记录移入 `docs/DESIGN.md`，配置契约移入 `docs/CONFIGURATION.md`，维护备忘与发布步骤并入 `CONTRIBUTING.md`，交叉链接一律用绝对 URL。

**修复**

- **模板示例值被当成真配置**（三处，会让未配置的项目得到假绿）：`scaffold/PROJECT.md` §3 的 6 行示例 ⇒ 表内只留一行占位行，完整示例移入不参与解析的代码块；`scaffold/tools/README.md` 登记区里「示例格式，勿照抄」那行被当成已登记即放行 ⇒ 改为代码块内的占位形式；§4 表「示例取值」列被解析器读取、示例值覆盖了文档承诺的默认值 ⇒ 取值列改为占位符、示例值搬进「说明」列。
- 新增 `scripts/project-config.mjs`：四脚本共用的解析件，统一两条硬口径 —— 含 `<`/`>` 的值一律视为未配置、围栏代码块内部不参与解析；`check-artifact-paths` 在 §3 解析不到有效条目时 `exit 1` 并提示「未填」，同时报告「已忽略 N 条占位符条目」。
- 文档补「变量路径别写 `<...>`，用 `*` 通配或走登记区」。
- 新增 `test/scripts.test.mjs`：原样模板必须 `exit 1`、登记区示例不生效、§4/§5 逐 key 回落默认、填好后照常放行、代码块内示例不被解析。

**设计红线**

- 目标仓库的 `docs/process/**` 文件是唯一真源，插件不另存状态。
- 插件只做「读 + 渲染 + 安全追加 journal + 只增不改地初始化」，不代写流程产物。
- 不依赖任何 `@deepseek-ai/*` 运行时包；不引入插件 `Config`（便于 `link:` 安装）。

**兼容与迁移**

- 取代早期的原型流程包（两者注册同名工具，不可同时启用）。
- 快速路径：核对件 `flow: fast` + `gate0: approved` ⇒ 跳过 pm / Gate1 / Gate2，直派 dev + 存量回归；状态快照会显式给出该动作，若同时存在 PRD 则报一致性警告。
