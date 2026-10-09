# dsh-process-kit

[![CI](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-process-kit)](https://www.npmjs.com/package/dsh-process-kit)
[![license](https://img.shields.io/npm/l/dsh-process-kit)](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)

通过工程化提升产出质量的多角色+多Agent并行开发插件

## 简介

为 [DSH](https://github.com/deepseek-ai/deepseek-harness) 增加一套文件驱动的工程化开发流程。通过对包的状态、门禁签署、流程与 bug 记录都写在目标仓库的 `docs/process/**` 里；插件只做读取、渲染、安全追加和脚手架落地，不另外保存状态。

同时内置角色 subagent，彼此有硬边界：写实现的不写测试，写测试的不做验收。角色阵容按路线图推进

## 特性

- **文件状态机**：进度存在 `docs/process/**` 的 frontmatter 中。每轮唤醒调用 `process_status` 即可恢复上下文，不依赖聊天记录。
- **Gate 门禁**：只在 Gate0/1/2/4 (需求核对，设计，开发，验收环节) 停下进行确认，每次输出两段式摘要（✅ 已完成 / ❓ 待裁定）。
- **角色分离**：角色技能随插件注册，项目内 `.dsh/skills/**` 的同名技能可覆盖。
- **零依赖**：不导入插件外库，无构建步骤。
- **只增不改**：`process_init` 落到目标仓库的文件只创建，不覆盖。

## 安装

| 方式 | target | 说明 |
| --- | --- | --- |
| npm（推荐） | `dsh-process-kit` | 从官方 npm 仓库安装，已发布 `0.2.0`，升级只需改版本号 |
| GitHub | `github:SHADOW-LI0327/dsh-process-kit` | 免 npm；锁版本用 `#<tag>` 或 `#<commit>` |
| 本地目录 | 绝对路径，如 `/Users/<you>/dsh-plugins/dsh-process-kit` | 需要改插件源码时用，先 clone 到本地 |

安装后建议重启客户端，一般情况下无需重启

## 快速开始

```text
1. 安装插件（安装即生效，无需重启）。
2. 告诉ai想做什么，比如想做一个网站，做一个app等等
3. ai自动初始化当前环境(插件需要的记录) `process_init`
4. 开始按照流程进行开发工作
```

`process_init` 生成的内容：

- `docs/process/` — `README.md`（流程总纲）、`orchestrator.md`（调度手册）、`PROJECT.md`（项目适配）、PRD 与核对件模板、`tools/README.md`
- `scripts/process/` — `journal-append.mjs`、`check-artifact-paths.mjs`、`check-rules.mjs`、`check-ui-geometry.mjs`、`sync-prd-version.mjs`
- `AGENTS.md` — 仅在不存在时创建；已存在则不改写，只输出待合并段落。传 `agents: false` 可跳过。

## 工具

| 工具 | 说明 |
| --- | --- |
| `process_status` | 扫描 `docs/process`，返回每个包的状态、Gate 四灯、journal 尾部、未关闭的 bug 与下一步动作 |
| `gate_summary` | 生成指定包的 Gate 两段式摘要骨架，依据自动填充，✅ / ❓ 留空待填 |
| `process_journal` | 安全追加 journal：锁 + 指纹校验 + 原子替换，时间取机器时间 |
| `process_init` | 将流程骨架与脚本初始化到当前仓库，只创建不覆盖 |

## 角色与路线图

角色由插件自带技能提供，安装即注册，无需配置。技能在所有工作区可用，与仓库是否已初始化流程无关；项目内 `.dsh/skills/**` 的同名技能优先级更高。设置环境变量 `PROCESS_KIT_SKILLS=off` 可关闭。

工作区右下角提供只读的「流程看板」，展示当前工作区的流程状态。

### 已发布（8 个）

`0.1.0` 起可用 7 个，`0.2.0` 补上 `ui-designer`：

| 角色 | 职责 | 自 |
| --- | --- | --- |
| `product-manager` | PRD、接口契约、《设计与说明》；UAT 后做验收完备性审核，维护功能清单与回归基线 | `0.1.0` |
| `test-agent` | 按 PRD 出验收测试（红），并独立复跑 verify（裁判运动员分离） | `0.1.0` |
| `dev-agent` | 按 PRD + 契约把测试实现到绿，只改源码、禁改测试 | `0.1.0` |
| `uat-agent` | 真机黑盒验收：只判「用起来对不对得上预期」 | `0.1.0` |
| `code-review-agent` | 源码 diff 的正确性 / 回归 / 边界 / 可维护性评审 | `0.1.0` |
| `security-review-agent` | 源码 diff 的鉴权 / 越权 / 注入 / 密钥 / 敏感数据评审 | `0.1.0` |
| `logic-review-agent` | 规则表与源码的对抗式逻辑评审：规则→分支映射、未覆盖分支、具体反例 | `0.1.0` |
| `ui-designer` | 把《设计与说明》里触及 UI 的条目翻译成**可验收的 UI 规格**（组件判定 `reuse`/`change`/`new` + 交互状态矩阵 + 用户可见文案定稿），并产出**原型位图**与几何。是否派单由人在 Gate0 用需求核对件的 `uiDesign: required / not-needed` 显式决定，纯后端包流程不变；产物随 Gate1 一并送审，不新增停点 | `0.2.0` |

**`ui-designer` 的边界**（三条，都是实测出来的）：

- **只翻译不发明**。上游没写的一律不拍板，产出「未定口径」清单交人裁。实测给一个只有原始需求、没有 PRD 的包，它交回 8 条未定口径、并明确说明"没加某状态是为了避免发明"。
- **项目令牌优先**。`PROJECT.md` §4 配了「UI 项目令牌」就**必须照抄**项目自己的设计规范，不得自创配色/字号/间距，也不得混用通用默认。门禁 **⑩** 会抽出色板来验。
- **审美留给 Gate**。门禁只判**客观可判**的那部分（几何 + 渲染对比度 + 令牌一致性），好不好看一律交人。

## 配置

需要配置的只有 `docs/process/PROJECT.md`。流程文档不硬编码任何具体项目的路径与命令，全部引用该文件，因此插件升级不会覆盖已填写的内容，切换项目也只需重填此文件。

七个小节：§1 端与目录、§2 命令槽、§3 产物属主表、§4 项目配置、§5 UAT 前置自检、§6 环境与凭据、§7 通知（可选）。

模板中所有 `<...>` 均为占位符，会被脚本忽略，不会成为有效配置。详见 [docs/CONFIGURATION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONFIGURATION.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/CONFIGURATION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONFIGURATION.md) | PROJECT.md 七个小节、占位符规则、门禁脚本 |
| [docs/DESIGN.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/DESIGN.md) | 设计约束、三处必须同步的改动、已知陷阱 |
| [docs/ECOSYSTEM.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/ECOSYSTEM.md) | DSH 插件生态的准入门槛与现状 |
| [CONTRIBUTING.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/CONTRIBUTING.md) | 开发环境、测试、提交与发布 |

## 开发

零运行时依赖，无需安装依赖或构建：

```bash
npm test
```

四项冒烟测试：`test/host.test.mjs`、`test/client.test.mjs`、`test/skill-registry.test.mjs`、`test/scripts.test.mjs`。

## License

[MIT](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)
