# dsh-process-kit

[![CI](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-process-kit)](https://www.npmjs.com/package/dsh-process-kit)
[![license](https://img.shields.io/npm/l/dsh-process-kit)](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)

通过工程化提升产出质量的多角色+多Agent并行开发插件

## 简介

为 [DSH](https://github.com/deepseek-ai/deepseek-harness) 增加一套文件驱动的工程化开发流程。需求包的状态、门禁签署、流程与 bug 记录都写在目标仓库的 `docs/process/**` 里；插件只做读取、渲染、安全追加和脚手架落地，不另外保存状态。

同时内置 8 个角色 subagent，彼此有硬边界：写实现的不写测试，写测试的不做验收。

## 和同类插件的差别

生态里已有 20 多个近亲（4674 条精选清单里逐个粗筛过），最容易混淆的是这三类：

| 你见过的做法 | 它的判据 | 我们的做法 |
| --- | --- | --- |
| 规格驱动（spec-kit / OpenSpec / BMAD …） | 靠 LLM 自查「规格写完了没」，或明写**不做硬门禁** | 状态机 + **人签 Gate**：阶段推进权在**人手**上，且**从需求到交付的纠偏不可跳过**（实现过程本身不需要人参与） |
| 角色编排（dsh-crew / dsh-swarm / dsh-expert-team …） | 用**代码强制**角色写权（权限矩阵 / 宿主中间件 / preset） | 角色是**提示词层面**的分工（管效率），**交付质量由 Gate 的人裁承担** —— 刻意不做实时拦截，理由见 [DESIGN](./docs/DESIGN.md) |
| 自动质量门（review-gate / lunheng …） | 机器 verdict 直接放行或阻断 | 机器只判**客观可判**的那半（几何 / 台账 / 落点 / 证据完整性），主观的**留给人裁**；机器侧证据进 `📎` 供抽查 |

三条不可替代的东西：**状态入仓**（`docs/process/**` 是唯一真源，[CI 不装插件也能消费](./docs/CONTRACT.md)）、**防篡改 journal**（链式指纹，读取侧重算并如实报红）、**两段式 Gate 摘要**（✅ 完成了什么 / ❓ 还需要裁定什么）。


## 特性

- **文件状态机**：进度存在 `docs/process/**` 的 frontmatter 中。每轮唤醒调用 `process_status` 即可恢复上下文，不依赖聊天记录。
- **Gate 门禁**：只在 Gate0/1/2/4 (需求核对，设计，开发，验收环节) 停下进行确认，每次输出两段式摘要（✅ 已完成 / ❓ 待裁定）。
- **角色分离**：角色技能随插件注册，项目内 `.dsh/skills/**` 的同名技能可覆盖。
- **零依赖**：不导入插件外库，无构建步骤。
- **只增不改**：`process_init` 默认只创建、不覆盖；已有仓库用 `process_init(upgrade: true)` 升级 —— 框架自有文件覆盖前先备份，`PROJECT.md` 与令牌类项目可定制文件永不覆盖、只报告差异。

## 安装

| 方式 | target | 说明 |
| --- | --- | --- |
| npm（推荐） | `dsh-process-kit` | 从官方 npm 仓库安装，升级只需改版本号（**本版本 `0.5.0`**） |
| GitHub | `github:SHADOW-LI0327/dsh-process-kit` | 免 npm；锁版本用 `#<tag>` 或 `#<commit>` |
| 本地目录 | 绝对路径，如 `/Users/<you>/dsh-plugins/dsh-process-kit` | 需要改插件源码时用，先 clone 到本地 |

安装后建议重启客户端，一般情况下无需重启

> **装不到最新版？先看这条：不是安装故障。** pnpm（11/12）默认带 24 小时供应链保护 —— `minimumReleaseAge = 1440` 分钟：**发布不满 24 小时的版本，不会被 `^范围` / `latest` 解析选中**，于是刚发的新版看起来「装不上」，实际装到的是上一个版本。三种解法：
>
> - **等**：满 24 小时后自然解析到新版；
> - **钉版本**（立即生效，显式钉版本按设计绕开该策略）：装 `dsh-process-kit@0.4.0` 这样的确切版本；
> - **加排除**：在 `pnpm-workspace.yaml` 里补
>   ```yaml
>   minimumReleaseAgeExclude:
>     - dsh-process-kit@0.4.0
>   ```
>   不建议直接写 `minimumReleaseAge: 0` —— 那等于把这道保护整体关掉。

## 快速开始

```text
1. 安装插件（安装即生效，无需重启）。
2. 告诉ai想做什么，比如想做一个网站，做一个app等等
3. ai自动初始化当前环境(插件需要的记录) `process_init`
4. 开始按照流程进行开发工作
5. 第一个包建议走快速路径试水：需求核对件写 `flow: fast`，人签 Gate0 后直接派 dev + 存量回归；确认这套流程在你的项目里顺手，再上全流程
```

`process_init` 生成的内容：

- `docs/process/` — `README.md`（流程总纲）、`orchestrator.md`（调度手册）、`PROJECT.md`（项目适配）、PRD 与核对件模板、`tools/README.md`
- `scripts/process/` — `journal-append.mjs`、`check-artifact-paths.mjs`、`check-rules.mjs`、`check-ui-geometry.mjs`、`sync-prd-version.mjs`
- `AGENTS.md` — 仅在不存在时创建；已存在则不改写，只输出待合并段落。传 `agents: false` 可跳过。

### 实例项目（独立仓库）

[dsh-process-kit-example](https://github.com/SHADOW-LI0327/dsh-process-kit-example) —— 在一个**全新空仓库**里，从一句「做一个电商 app」跑到交付的端到端实例：交付成果、流程产物与 journal 证据都留在那个仓库里，不在本仓库内。

跑法与核验收的检查单见 [docs/ACCEPTANCE.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/ACCEPTANCE.md)（含可直接照抄的开跑步骤，以及一段**不装插件**就能复算 journal 链式指纹的核验脚本）。

> 仓库已建，内容由首次端到端验收跑产出。

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

## 工具

| 工具 | 说明 |
| --- | --- |
| `process_status` | 扫描 `docs/process`，返回每个包的状态、Gate 四灯、journal 尾部、未关闭的 bug 与下一步动作 |
| `gate_summary` | 生成指定包的 Gate 两段式摘要骨架，依据自动填充，✅ / ❓ 留空待填 |
| `process_journal` | 安全追加 journal：锁 + 指纹校验 + 原子替换，时间取机器时间 |
| `process_init` | 将流程骨架与脚本初始化到当前仓库：默认只创建不覆盖；`upgrade: true` 升级已有仓库（框架自有文件覆盖前备份，项目文件永不覆盖） |

## 角色

角色由插件自带技能提供，安装即注册，无需配置。技能在所有工作区可用，与仓库是否已初始化流程无关；项目内 `.dsh/skills/**` 的同名技能优先级更高。设置环境变量 `PROCESS_KIT_SKILLS=off` 可关闭。

### 角色清单（8 个）

`0.1.0` 起可用 7 个，`0.2.0` 补上 `ui-designer`，`0.3.0` 给 `ui-designer` 固定工具优先级（PhotoCraft CLI > Adobe Photoshop > 其它）并把几何门禁的空转判据补硬；`0.4.0` 移除流程看板（改为纯服务端 bundle）、流程骨架按「单 session 单包」精简并把 Gate 送审件换成实物、给 `process_init` 加上 `upgrade` 升级路径；`0.5.0` 给三个评审角色写明触发条件（技能描述随之更新）、修正快速路径与 Gate0 的口径矛盾、补上 [docs/ADOPTION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/ADOPTION.md)（角色仍是这 8 个）：

| 角色 | 职责 | 自 |
| --- | --- | --- |
| `product-manager` | PRD、接口契约、《设计与说明》；UAT 后做验收完备性审核 | `0.1.0` |
| `test-agent` | 按 PRD 出验收测试（红），并独立复跑 verify（裁判运动员分离） | `0.1.0` |
| `dev-agent` | 按 PRD + 契约把测试实现到绿，只改源码、禁改测试 | `0.1.0` |
| `uat-agent` | 真机黑盒验收：只判「用起来对不对得上预期」 | `0.1.0` |
| `code-review-agent` | 源码 diff 的正确性 / 回归 / 边界 / 可维护性评审 | `0.1.0` |
| `security-review-agent` | 源码 diff 的鉴权 / 越权 / 注入 / 密钥 / 敏感数据评审 | `0.1.0` |
| `logic-review-agent` | 规则表与源码的对抗式逻辑评审：规则→分支映射、未覆盖分支、具体反例 | `0.1.0` |
| `ui-designer` | 把《设计与说明》里触及 UI 的条目翻译成**可验收的 UI 规格**（组件判定 `reuse`/`change`/`new` + 交互状态矩阵 + 用户可见文案定稿），并产出**原型位图**与几何。是否派单由人在 Gate0 用需求核对件的 `uiDesign: required / not-needed` 显式决定，纯后端包流程不变；产物随 Gate1 一并送审，不新增停点 | `0.2.0` |

**`ui-designer` 的边界**（四条，都是实测出来的）：

- **只翻译不发明**。上游没写的一律不拍板，产出「未定口径」清单交人裁。实测给一个只有原始需求、没有 PRD 的包，它交回 8 条未定口径、并明确说明"没加某状态是为了避免发明"。
- **项目令牌优先**。`PROJECT.md` §4 配了「UI 项目令牌」就**必须照抄**项目自己的设计规范，不得自创配色/字号/间距，也不得混用通用默认。门禁 **⑩** 会抽出色板来验。
- **审美留给 Gate**。门禁只判**客观可判**的那部分（几何 + 渲染对比度 + 令牌一致性），好不好看一律交人。
- **工具优先级固定：PhotoCraft CLI > Adobe Photoshop > 其它**。首选 PhotoCraft 是因为「出图」与「导几何」同源于一份 `.psd`，命令可复现、`--verify` 走得通；**Photoshop 是真人设计师的交付路径**（原生 `.psd` 分层源直接可用），几何那一环自己接 —— 读不动时手工导出的证据**必须标注「未经重导验证」**，不许冒充门禁验证过。工具仍不绑定，三条不使用路径照旧合法。

### 三个评审角色什么时候会跑到

8 个角色**不是平权的**，分两档：

| 档 | 角色 | 什么时候被派 |
| --- | --- | --- |
| **单包流程**（每个包都走） | `product-manager` · `ui-designer`（`uiDesign: required` 时）· `test-agent` · `dev-agent` · `uat-agent` | 包从 Gate0 走到 Gate4 的过程中按状态机派 |
| **发布回归**（默认不在单包出现） | `code-review-agent` · `security-review-agent` · `logic-review-agent` | **只在「发布前整体回归」被派**，而该环节由人显式发起 |

也就是说：**没发起过发布回归，就等于这三个角色一次都没跑过。** 实测四个自用仓库的 **3 份**可读 journal（另有 1 份只剩 `.bak`，见 [ADOPTION](./docs/ADOPTION.md) §6）+ 实例端到端那一次的 **2 份**，全文扫描：这三个角色**零命中、零份报告** —— 不是它们没用，是**触发权在人手上**，而发布回归一直没被发起过。

两个例外会让它们提前上场：① 人在任一 Gate 上点名；② 包触及 RBAC / 金额·分摊 / schema / 新增对外接口，主控会在 Gate 摘要里给出「是否提前跑评审」这一条。

`process_status` 在仓库里有包 `done` 时会**如实报** `docs/process/reports/release/**` 有没有报告 —— **没有就是没跑**，不得当已覆盖。

## 配置

需要配置的只有 `docs/process/PROJECT.md`。流程文档不硬编码任何具体项目的路径与命令，全部引用该文件，因此插件升级不会覆盖已填写的内容，切换项目也只需重填此文件。

七个小节：§1 端与目录、§2 命令槽、§3 产物属主表、§4 项目配置、§5 UAT 前置自检、§6 环境与凭据、§7 通知（已废弃，编号占位）。

**最小可用只填三节**：§1 + §2（至少「快速验证」与「journal 追加」两行）+ §3。§4 每个键都有默认值、可先用着；§5 / §6 等到要跑 UAT 再填；§7 整节写「不适用」。**§3 是硬门槛**：不填会让落点门禁直接 `exit 1`（刻意不静默放行），不属于"以后再配也行"的那类可选项。

模板中所有 `<...>` 均为占位符，会被脚本忽略，不会成为有效配置。详见 [docs/CONFIGURATION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONFIGURATION.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/CONFIGURATION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONFIGURATION.md) | PROJECT.md 七个小节、占位符规则、门禁脚本 |
| [docs/CONTRACT.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONTRACT.md) | 机器可消费契约：frontmatter / journal / 链式指纹算法 / 退出码，**CI 不装插件即可消费** |
| [docs/DESIGN.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/DESIGN.md) | 设计红线、四处必须同步的改动、已知陷阱 |
| [docs/ECOSYSTEM.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/ECOSYSTEM.md) | DSH 插件生态的准入门槛、上架清单与现状 |
| [docs/ADOPTION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/ADOPTION.md) | 落地实测：四个自用仓库走到哪一步、一个包的全流程时间线与 Gate 间隔耗时、真实返工、AI 托管对照（17.9h vs 2.01h）、装置缺陷与四个可数指标 |
| [docs/ACCEPTANCE.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/ACCEPTANCE.md) | 插件验收：在全新项目里跑通一个电商 app 的端到端场景、AI 托管 Gate、可机器核验的检查单 |
| [CONTRIBUTING.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/CONTRIBUTING.md) | 开发环境、测试、提交与发布 |

## 开发

零运行时依赖，无需安装依赖或构建：

```bash
npm test
```

三项冒烟测试：`test/host.test.mjs`、`test/skill-registry.test.mjs`、`test/scripts.test.mjs`。

## License

[MIT](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)
