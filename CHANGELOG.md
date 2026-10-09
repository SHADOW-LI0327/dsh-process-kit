# CHANGELOG

## 未发布

**新增**

- 第 8 个角色 **`ui-designer`（UI 设计）**：把《设计与说明》里**触及 UI 的条目**翻译成可验收的 **UI 规格** —— 组件判定（`reuse` / `change` / `new`，新增必附理由）+ 交互状态矩阵（默认 / 加载 / 空 / 错误 / 无权限 / 禁用）+ 用户可见文案定稿。
  - **位置 = pm 之后、test 之前**：test 要据此写 UI 断言，而**判据必须有人审过**，所以**随 Gate1 一并送审** —— 复用现有 Gate，**不新增停点、不新增状态位**。
  - **条件触发**：仅触及 UI（页面 / 组件 / 交互 / 用户可见文案）的包派单；**纯后端包流程完全不变**。
  - **边界**：只翻译不发明业务口径（需要新口径 ⇒ 回流 PRD 由人裁定）；**禁改任何实现源码**；禁读后端实现与前端组件内部实现；**不出验收结论**（那是 uat）。
- 新模板 `scaffold/prd/_UI_SPEC_TEMPLATE.md`。

**配套同步（按 DESIGN.md 的「三处必须同步」）**

- **状态机两处**：`lib/index.js` 的 `nextAction` 与 `scaffold/orchestrator.md` §2 状态→动作表同步扩展。
- **角色与总纲**：`scaffold/README.md` §2 角色矩阵新增一行；§2.1 由「两组关键边界」扩为**三组**（新增「ui-designer 定状态 vs uat 判体验」）；Gate1 审件包、§4.1 摘要专项、§4.2 强制附加项、§12 最短路径同步。
- **接力闭环**：`test-agent` 与 `dev-agent` 的读源清单补入 UI 规格 —— 否则新角色产出无人消费、等于悬空。**`uat-agent` 刻意不补**：它是唯一全禁角色、不直读本件，预期由 pm 汇总进 UAT 清单后交给它。
- 角色计数 7 → 8：`README.md` · `docs/DESIGN.md` · `AGENTS.template.md` · `lib/index.js` · `package.json` · `scaffold/PROJECT.md` · `test/host.test.mjs` · `test/skill-registry.test.mjs`。

## v0.1.0 — 首个通用版

从一套实战跑通的「单人开发 + LLM 角色协作」流程中抽出，做成可安装、可上传 git 的通用框架。

**新增**

- 四个工具：`process_status`（状态机快照 + 下一步动作）、`gate_summary`（两段式 Gate 摘要骨架）、`process_journal`（锁 + 指纹校验 + 原子替换的 journal 追加）、`process_init`（骨架与脚本初始化，只增不改）。
- 7 个通用角色技能打包进插件（`product-manager` / `test-agent` / `dev-agent` / `uat-agent` / `code-review-agent` / `security-review-agent` / `logic-review-agent`），以 rank 600（bundled 档）注册；项目 `.dsh/skills/**` 覆盖同名技能。**默认在所有工作区广播**（`PROCESS_KIT_SKILLS=off` 可静默）——早先「按工作区有无 `docs/process` 门禁」的版本会造成「角色消失且 `process_init` 也救不回」（技能目录按 cwd 缓存），已在净室实测中确认并移除。
- 流程骨架 `scaffold/`：总纲、调度手册、项目适配槽位 `PROJECT.md`（§1–§7）、核对件 / PRD / 设计与说明模板、过程载体登记区说明。
- `AGENTS.md` 项目级常驻指针：`process_init` 在缺失时按 `AGENTS.template.md` 建一份（已存在则**绝不改写**，只打印待并入的「开发流程」段落），`agents: false` 可跳过。补上「框架级 systemPrompt 段」之外的**项目级常驻层**——插件是跨仓库通用包，替不了「本项目流程真源在哪」这句话。
- 零依赖门禁脚本 `scripts/*.mjs`：`journal-append`、`check-artifact-paths`、`check-rules`、`sync-prd-version`、`check-uat-readiness`（均只用 `node:` 内置模块，可直接 `node` 跑）。
- 页面部分看板：右下角浮层，展示每包 status / Gate 四灯 / 下一步动作 / open bugs / 状态位不一致警告。
- 测试：`test/host.test.mjs`（工具与状态机）、`test/client.test.mjs`（看板渲染）、`test/skill-registry.test.mjs`（挂进真实 `@deepseek-ai/dsh-skill` 注册表验证候选/定义/优先级）。

**分发（首发前加固）**

- 三条标准安装 spec 全部可用：npm 包名、`github:SHADOW-LI0327/dsh-process-kit`、本地绝对路径。
- 新增 `peerDependencies: { "@deepseek-ai/dsh": ">=0.1.7-rc.2 <0.3.0" }`：让 DSH 的兼容门禁在装不上时**明确拒绝**，而不是装上一个静默失效的插件。
- 修 `dsh.client.inject`：由空数组改为 `["@deepseek-ai/dsh-client-ui-layout"]`——页面部分注册进 `shell.overlay`，而该 slot 由 layout 提供；官方四个同样注册进 `shell.overlay` 的包（chat / schedule / settings-account / shortcuts）都声明了这一项，此前只有本插件漏了，客户端加载器因此拿不到到达顺序约束。
- 补 `files` 白名单（此前 `npm pack` 会把 `test/**` 一起打进包里）、`repository` / `homepage` / `bugs` / `keywords` / `engines` / `publishConfig`。
- 文档去黑话：「Host 半 / 浏览器半」统一改为「服务端部分 / 页面部分」，并补术语说明与三条安装通道。
- README 拆分为使用者视角：把实现细节、踩坑记录、设计说明移到 `docs/DESIGN.md`，把 PROJECT.md 配置契约移到 `docs/CONFIGURATION.md`，维护备忘与发布步骤并入 `CONTRIBUTING.md`；README 只留「它解决什么 / 安装 / 使用 / 能力 / 配置入口 / 文档索引」。交叉文档链接一律用绝对 URL，保证在 npm 页面上也可点。

**修复**（在净室初始化实测中发现并复现）

- **模板示例值被当成真配置**（三处泄漏，会让未配置的项目得到假绿、并被静默改配置）：
  1. `scaffold/PROJECT.md` §3 的 6 行示例里 16 条路径不含占位符 ⇒ 被当成真放行规则，**从没配置过的项目也会报「✓ 无越界落点」**；§3 表内现只留一行占位行，完整示例移入不参与解析的代码块。
  2. `scaffold/tools/README.md` 登记区里写着「示例格式，勿照抄」的那行被当成**已登记即放行**；现改为代码块内的占位形式。
  3. §4 表列头原为「示例取值」，而解析器读的正是该列 ⇒ 示例值**覆盖文档承诺的默认值**（`import 白名单` 被换窄、`自动化类型` 丢掉 `jest`/`junit`/`uat`、`待裁定字样` 丢掉默认双分支正则、凭空多出 `junit 测试目录`）；现取值列改为占位符、示例值搬进「说明」列。
- 新增 `scripts/project-config.mjs`：四脚本共用的解析件，统一两条硬口径——**含 `<`/`>` 的值一律视为未配置**、**围栏代码块内部不参与解析**；`check-artifact-paths` 在 §3 解析不到有效条目时 `exit 1` 并明确提示「未填」，同时在正常输出里报告「已忽略 N 条占位符条目」。
- 文档补「变量路径别写 `<...>`，用 `*` 通配或走登记区」——否则 `scripts/<ID>-<用途>.ts` 这类合法意图会被当占位符丢掉。
- 新增 `test/scripts.test.mjs`（6 组回归）：原样模板必须 `exit 1`、登记区示例不生效、§4/§5 逐 key 回落默认（含「换回示例值 ⇒ 用例转红」的反向对照）、填好后照常放行、代码块内示例不被解析。

**设计红线**

- 目标仓库的 `docs/process/**` 文件是唯一真源，插件不另存状态。
- 插件只做「读 + 渲染 + 安全追加 journal + 只增不改地初始化」，不代写流程产物。
- 不依赖任何 `@deepseek-ai/*` 运行时包；不引入插件 `Config`（便于 `link:` 安装）。

**兼容与迁移**

- 取代早期的原型流程包（两者注册同名工具，不可同时启用）。
- 快速路径：核对件 `flow: fast` + `gate0: approved` ⇒ 跳过 pm / Gate1 / Gate2，直派 dev + 存量回归；状态快照会显式给出该动作，若同时存在 PRD 则报一致性警告。
