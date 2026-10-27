# dsh-process-kit

[![CI](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-process-kit)](https://www.npmjs.com/package/dsh-process-kit)
[![license](https://img.shields.io/npm/l/dsh-process-kit)](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)

通过工程化提升产出质量的多角色+多Agent并行开发插件

> **English**: see [README.en.md](./README.en.md). 本插件支持**中文 / 英文**两种流程语言（`process_init({ lang })`），见下节「双语支持」。

## 简介

为 [DSH](https://github.com/deepseek-ai/deepseek-harness) 增加一套文件驱动的工程化开发流程。需求包的状态、门禁签署、流程与 bug 记录都写在目标仓库的 `docs/process/**` 里；插件只做读取、渲染、安全追加和脚手架落地，不另外保存状态。

同时内置 9 个角色 subagent，彼此有硬边界：写实现的不写测试，写测试的不做验收；产品与架构的借鉴调研在 Gate0 前**按需**并行，候选只进核对件、不直接进 AC。

## 特性

- **文件状态机**：进度存在 `docs/process/**` 的 frontmatter 中。每轮唤醒调用 `process_status` 即可恢复上下文，不依赖聊天记录。
- **Gate 门禁**：只在 Gate0/1/2/4 (需求核对，设计，开发，验收环节) 停下进行确认，每次输出两段式摘要（✅ 已完成 / ❓ 待裁定）。
- **防篡改 journal**：链式指纹（任意一行被改 / 删行 / 换行都能发现），读取侧重算并如实报红；状态位与批准来源都可事后核验。
- **角色分离**：角色技能随插件注册，项目内 `.dsh/skills/**` 的同名技能可覆盖。
- **需求借鉴调研（按需）**：用户说不清目的时，Gate0 前并行派 `product-manager` + `architect` 查 GitHub / 公开文档，把隐性需求 / 技术约束变成核对件的候选 `Q`；**并行必须汇合**，候选不直接进 AC，fast 路径不做，**不默认对所有 full 包做**。
- **零依赖**：不导入插件外库，无构建步骤。
- **只增不改**：`process_init` 默认只创建、不覆盖；已有仓库用 `process_init(upgrade: true)` 升级 —— 框架自有文件覆盖前先备份，`PROJECT.md` 与令牌类项目可定制文件永不覆盖、只报告差异。

## 双语支持（中文 / English）

同一套流程、两种语言。语言只影响**文字**，不影响**落点与判据**：

- **选语言**：`process_init({ lang: "en" })` 落英文骨架、`zh` 落中文；`auto`（默认）依次看 `.process-kit.json` 的 `lang` → 仓库 `AGENTS.md` / `README.md` 的语言 → 回退 `zh`。环境变量 `PROCESS_KIT_LANG=zh|en` 可一次性覆盖。**换语言** = `process_init({ upgrade: true, lang: "en" })`（框架自有文件按新语言覆盖并先备份，`PROJECT.md` / 令牌类文件不覆盖、只报告差异）。
- **门禁与工具跟着仓库走**：门禁脚本的运行期消息、`process_status` / `gate_summary` 的报告、9 个角色技能正文都按仓库语言输出/取用（英文仓库拿英文，中文仓库行为不变）。
- **机器认标记，人读文字**：模板在关键小节上方放 HTML 注释标记（`<!-- process:owner-table -->` / `<!-- process:registry -->`），门禁优先按标记定位，缺失才回退中英标题别名；§4 / §5 的配置键**中英都认**（如 `台账目录` / `Rules dir`）；核对件中英两种文件名都认，权威判据是 frontmatter `kind: requirement-check`。
- **完整契约**：[docs/I18N.md](./docs/I18N.md)（解析优先级、标记清单、26 个配置键对照表、维护纪律）；`test/i18n.test.mjs` 会核对两套骨架一致、零残留，并在英文仓库里跑到绿。

## 安装

| 方式 | target | 说明 |
| --- | --- | --- |
| npm（推荐） | `dsh-process-kit` | 从 npm 安装，升级只需改版本号（具体版本以 registry 为准） |
| GitHub | `github:SHADOW-LI0327/dsh-process-kit` | 免 npm；锁版本用 `#<tag>` 或 `#<commit>` |
| 本地目录 | 绝对路径，如 `/Users/<you>/dsh-plugins/dsh-process-kit` | 需要改插件源码时用，先 clone 到本地 |

安装即生效；若界面没刷新，再重启客户端

> **装不到最新版？不是安装故障。** pnpm 默认带 24 小时供应链保护（`minimumReleaseAge = 1440`）：发布不满 24 小时的版本不会被 `^范围` / `latest` 选中。**等 24 小时**，或**钉确切版本**（`dsh-process-kit@0.9.0`，显式钉版本按设计绕开该策略）；不建议把 `minimumReleaseAge` 置 0（等于关掉这道保护）。

## 快速开始

```text
1. 安装插件（安装即生效，一般无需重启）
2. 直接说想做什么（"做个网站"/"做个 app"）
3. AI 调 `process_init` 初始化当前仓库的流程
4. 按流程推进；第一个包建议走快速路径试水：核对件写 `flow: fast`，人签 Gate0 后直派 dev + 存量回归
```

`process_init` 生成：`docs/process/`（总纲、调度手册、`PROJECT.md`、模板）、`docs/process/.process-kit.json`（卸载清单：创建过什么 + 哈希，供精确清理）、`scripts/process/`（门禁与 journal 脚本）、`AGENTS.md`（仅在缺失时创建，绝不改写；`agents: false` 可跳过）。

### 实例项目（独立仓库）

[dsh-process-kit-example](https://github.com/SHADOW-LI0327/dsh-process-kit-example) —— 全新空仓库里从「做一个电商 app」跑到交付的端到端实例（成果、流程产物与 journal 证据都在那个仓库里）。开跑步骤与核验检查单见 [docs/ACCEPTANCE.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/ACCEPTANCE.md)（含一段**不装插件**就能复算 journal 链式指纹的脚本）。

### 升级已有仓库

```js
process_init({ upgrade: true, dryRun: true })   // 先看会动哪些文件
process_init({ upgrade: true })                 // 再落地
```

| 文件 | 升级行为 |
| --- | --- |
| 框架自有：`README.md`（总纲）、`orchestrator.md`、四份模板、`tools/README.md`、`scripts/process/*.mjs` | 内容有变才覆盖，旧版备份为 `<文件>.bak-<时间戳>` |
| 项目可定制：`PROJECT.md`、`ui/tokens.md`、`ui/recipe.md` | **永不覆盖**，只列入「需人工比对」并给出包内模板路径 |
| 数据：`input/**`、`prd/<ID>*`、`bugs/**`、`reports/**` 等 | 从不触碰 |

`PROJECT.md` 的 `processVersion` 落后时，报告会提示对照包内模板手工合并。

### 卸载（不想继续用）

流程内容全部落在仓库里，不是插件私有状态，所以**可以完整清走**；但删除不可逆，默认只预览：

```js
process_uninstall({ dryRun: true })                  // 默认就是 dry-run，先看会删什么
process_uninstall({ confirm: true, dryRun: false })  // 人明确确认后才真正删除
```

| 处理 | 内容 |
| --- | --- |
| **确认后删除** | `docs/process/**`（全部过程件）与 `scripts/process/**`（或 init 时自定义的 `scriptsDir`），卸载清单随目录一起删 |
| **仅删 init 创建且未改过的** | `AGENTS.md`、`.dsh/skills/<角色>/SKILL.md`（按清单哈希判断；与模板逐字一致也算；改过的默认保留，`force: true` 才删） |
| **永不删除** | 含自定义内容的 `AGENTS.md` / 同名技能、产品源码与测试、git 历史、`package.json`（只报告仍指向已删脚本的命令） |

- 默认**先备份**到系统临时目录，备份失败就不删；删除是**工作区改动**，不会改写 git 历史，确认后自己提交。
- **先卸流程、再卸插件**：`process_uninstall` 由插件提供，插件先卸掉就没人替你清仓库了。
- 旧安装没有卸载清单时走保守清理（目录照删；`AGENTS.md` / 技能副本只删与模板逐字一致的），报告会点名保留项。老仓库先跑一次 `process_init({ upgrade: true })` 同步脚本。

## 工具

| 工具 | 说明 |
| --- | --- |
| `process_status` | 扫描 `docs/process`，返回每个包的状态、Gate 四灯、journal 尾部、未关闭的 bug 与下一步动作 |
| `gate_summary` | 生成指定包的 Gate 两段式摘要骨架，依据自动填充，✅ / ❓ 留空待填 |
| `process_journal` | 安全追加 journal：锁 + 指纹校验 + 原子替换，时间取机器时间 |
| `process_init` | 将流程骨架与脚本初始化到当前仓库：默认只创建不覆盖；`upgrade: true` 升级已有仓库（框架自有文件覆盖前备份，项目文件永不覆盖）；同时写 `docs/process/.process-kit.json` 卸载清单 |
| `process_uninstall` | 确认后清理插件落进仓库的流程内容：默认 dry-run，`confirm: true` + `dryRun: false` 才删；默认备份；只删 init 创建且未改过（或与模板逐字一致）的 `AGENTS.md` / 技能副本，不删含自定义内容的用户文件、产品源码或 git 历史 |

## 角色

角色由插件自带技能提供，安装即注册，无需配置。技能在所有工作区可用，与仓库是否已初始化流程无关；项目内 `.dsh/skills/**` 的同名技能优先级更高。设置环境变量 `PROCESS_KIT_SKILLS=off` 可关闭。

### 角色清单（9 个）

| 角色 | 职责 | 自 |
| --- | --- | --- |
| `product-manager` | PRD、接口契约、《设计与说明》；UAT 后做验收完备性审核；Gate0 前可做需求借鉴调研（`input/<ID>-prior-art.md`） | `0.1.0` |
| `architect` | Gate0 前与 pm 并行做**技术借鉴与约束扫描**（`input/<ID>-tech-scan.md`，只出约束 / 代价 / 许可证）；Gate0 后按需出**架构设计与取舍**（`prd/<ID>-arch.md`） | `0.6.0` |
| `test-agent` | 按 PRD 出验收测试（红），并独立复跑 verify（裁判运动员分离） | `0.1.0` |
| `dev-agent` | 按 PRD + 契约把测试实现到绿，只改源码、禁改测试 | `0.1.0` |
| `uat-agent` | 真机黑盒验收：只判「用起来对不对得上预期」 | `0.1.0` |
| `code-review-agent` | 源码 diff 的正确性 / 回归 / 边界 / 可维护性评审 | `0.1.0` |
| `security-review-agent` | 源码 diff 的鉴权 / 越权 / 注入 / 密钥 / 敏感数据评审 | `0.1.0` |
| `logic-review-agent` | 规则表与源码的对抗式逻辑评审：规则→分支映射、未覆盖分支、具体反例 | `0.1.0` |
| `ui-designer` | 把《设计与说明》里触及 UI 的条目翻译成**可验收的 UI 规格**（组件判定 / 状态矩阵 / 文案定稿 / 字面数值），产出**可打开的 HTML/CSS 原型 + `handoff.md` 交接表**；dev 实现后、UAT 前做 **UI 还原核对**。是否派单由人在 Gate0 用 `uiDesign: required / not-needed` 显式决定；**不产出 PNG/PSD** | `0.2.0` |

> 完整版本沿革见 [CHANGELOG](./CHANGELOG.md)；npm 上的具体版本以 registry 为准。

**`ui-designer` 的边界**：**只翻译不发明**（上游没写的进「未定口径」清单交人裁）；**项目令牌优先**（`PROJECT.md` §4 配了项目令牌就必须照抄，不得自创配色/字号/间距）；**HTML 是交付主件**（`index.html` + `styles.css` + `handoff.md`，不产出 PNG/PSD）；**UI 还原核对在 dev 后、UAT 前**（逐条 `UI-NN` 出 `reports/ui-review/<ID>.md`，`pass` 才进 UAT）；**审美留给 Gate**（`check-ui-prototype` 只判交接完整性）。

### 三个评审角色什么时候会跑到

9 个角色不是平权的：`product-manager` / `architect` / `ui-designer` / `test-agent` / `dev-agent` / `uat-agent` 在单包流程里按状态机派；`code-review-agent` / `security-review-agent` / `logic-review-agent` **只在「发布前整体回归」**被派，而该环节由人显式发起 —— **没发起过发布回归，就等于这三个角色一次都没跑过**（`process_status` 会如实报 `reports/release/**` 有没有报告，没有就是没跑）。

两个例外会让它们提前上场：① 人在任一 Gate 上点名；② 包触及 RBAC / 金额·分摊 / schema / 新增对外接口，主控会在 Gate 摘要里给出「是否提前跑评审」这一条。

## 配置

需要配置的只有 `docs/process/PROJECT.md`。流程文档不硬编码任何具体项目的路径与命令，全部引用该文件，因此插件升级不会覆盖已填写的内容，切换项目也只需重填此文件。

七个小节：§1 端与目录、§2 命令槽、§3 产物属主表、§4 项目配置、§5 UAT 前置自检、§6 环境与凭据、§7 通知（已废弃，编号占位）。

**最小可用只填三节**：§1 + §2（至少「快速验证」与「journal 追加」两行）+ §3。§4 每个键都有默认值、可先用着；§5 / §6 等到要跑 UAT 再填；§7 整节写「不适用」。**§3 是硬门槛**：不填会让落点门禁直接 `exit 1`（刻意不静默放行），不属于"以后再配也行"的那类可选项。

模板中所有 `<...>` 均为占位符，会被脚本忽略，不会成为有效配置。详见 [docs/CONFIGURATION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONFIGURATION.md)。

## 文档

英文版：**[README.en.md](./README.en.md)** · **[docs/CONFIGURATION.en.md](./docs/CONFIGURATION.en.md)** · **[docs/CONTRACT.en.md](./docs/CONTRACT.en.md)** · **[docs/DESIGN.en.md](./docs/DESIGN.en.md)** · **[docs/ACCEPTANCE.en.md](./docs/ACCEPTANCE.en.md)** · **[docs/ECOSYSTEM.en.md](./docs/ECOSYSTEM.en.md)**（`docs/I18N.md` 本身中英混排，无需另译）。

| 文档 | 内容 |
| --- | --- |
| [docs/I18N.md](./docs/I18N.md) | **双语契约**：语言解析优先级、机器标记、26 个配置键中英对照、维护纪律 |
| [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) · [EN](./docs/CONFIGURATION.en.md) | PROJECT.md 七个小节、语言设定、占位符规则、门禁脚本 |
| [docs/CONTRACT.md](./docs/CONTRACT.md) · [EN](./docs/CONTRACT.en.md) | 机器可消费契约：frontmatter / journal / 链式指纹算法 / 卸载清单 / 退出码，**CI 不装插件即可消费** |
| [docs/DESIGN.md](./docs/DESIGN.md) · [EN](./docs/DESIGN.en.md) | 设计红线、六处必须同步的改动、可卸载性、已知陷阱 |
| [docs/ECOSYSTEM.md](./docs/ECOSYSTEM.md) · [EN](./docs/ECOSYSTEM.en.md) | DSH 插件生态的准入门槛、上架清单与现状 |
| [docs/ACCEPTANCE.md](./docs/ACCEPTANCE.md) · [EN](./docs/ACCEPTANCE.en.md) | 插件验收：全新项目里跑通一个电商 app 的端到端场景、AI 托管 Gate、可机器核验的检查单 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 开发环境、测试、双语纪律、提交与发布 |

## 开发

零运行时依赖，无需安装依赖或构建：

```bash
npm test
```

四项冒烟测试：`test/host.test.mjs`、`test/skill-registry.test.mjs`、`test/scripts.test.mjs`、`test/i18n.test.mjs`。

## License

[MIT](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)
