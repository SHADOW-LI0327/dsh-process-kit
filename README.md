# dsh-process-kit

[![CI](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-process-kit)](https://www.npmjs.com/package/dsh-process-kit)
[![license](https://img.shields.io/npm/l/dsh-process-kit)](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)

面向任意仓库的开发流程插件：文件状态机 + Gate 门禁 + 角色分离。

## 简介

为 [DSH](https://github.com/deepseek-ai/deepseek-harness) 增加一套文件驱动的开发流程。需求包的状态、Gate 签署、journal 与 bug 记录都写在目标仓库的 `docs/process/**` 里；插件只做读取、渲染、安全追加和脚手架落地，不另外保存状态。

同时内置 7 个角色 subagent，彼此有硬边界：写实现的不写测试，写测试的不做验收。

## 特性

- **文件状态机**：进度存在 `docs/process/**` 的 frontmatter 中。每轮唤醒调用 `process_status` 即可恢复上下文，不依赖聊天记录。
- **Gate 门禁**：只在 Gate0/1/2/4 停下等人确认，每次输出两段式摘要（✅ 已完成 / ❓ 待裁定）。
- **角色分离**：7 个角色技能随插件注册，项目内 `.dsh/skills/**` 的同名技能可覆盖。
- **零依赖**：不 import 任何 `@deepseek-ai/*` 包，无构建步骤。
- **只增不改**：`process_init` 落到目标仓库的文件只创建，不覆盖。

## 安装

通过 DSH 的 `plugin_manager` 安装，或使用等价的 `dsh plugin --profile <name> add <spec>`：

| 方式 | target |
| --- | --- |
| npm | `dsh-process-kit` |
| GitHub | `github:SHADOW-LI0327/dsh-process-kit` |
| 本地目录 | 绝对路径，如 `/Users/<you>/dsh-plugins/dsh-process-kit` |

本地目录方式需要先 clone：

```bash
git clone https://github.com/SHADOW-LI0327/dsh-process-kit ~/dsh-plugins/dsh-process-kit
```

安装后立即生效，无需重启。修改 `lib/index.js` 后需重启 `dsh web`（Node 不会重新加载已导入的模块）；修改 `lib/client.js` 后刷新页面即可。

**dsh 版本要求**：`peerDependencies` 声明 `@deepseek-ai/dsh: ">=0.1.7-rc.2 <0.3.0"`。版本不匹配时安装会被拒绝并回滚。dsh 升级到 0.3 后需同步放宽此区间。

> **工具重名**：若此前安装过注册了同名工具的流程包，新包激活会报 `tool "process_status" is already registered` 且整行不激活。需先 `remove_bundle` 旧包，再对新包执行 `set_bundle enabled=false` → `true`。

## 快速开始

```text
1. 安装插件并重启 dsh web。
2. 在目标仓库调用 process_init，生成 docs/process/** 与 scripts/process/*.mjs。
3. 填写 docs/process/PROJECT.md（端与目录、命令槽、产物属主表）。
4. 按 process_init 的回报，在 package.json 中添加流程所需的 npm scripts。
5. 之后每轮唤醒先调用 process_status，按返回的「下一步动作」执行。
```

`process_init` 生成的内容：

- `docs/process/` — `README.md`（流程总纲）、`orchestrator.md`（调度手册）、`PROJECT.md`（项目适配）、PRD 与核对件模板、`tools/README.md`
- `scripts/process/` — `journal-append.mjs`、`check-artifact-paths.mjs`、`check-rules.mjs`、`sync-prd-version.mjs`
- `AGENTS.md` — 仅在不存在时创建；已存在则不改写，只输出待合并段落。传 `agents: false` 可跳过。

## 工具

| 工具 | 说明 |
| --- | --- |
| `process_status` | 扫描 `docs/process`，返回每个包的状态、Gate 四灯、journal 尾部、未关闭的 bug 与下一步动作 |
| `gate_summary` | 生成指定包的 Gate 两段式摘要骨架，依据自动填充，✅ / ❓ 留空待填 |
| `process_journal` | 安全追加 journal：锁 + 指纹校验 + 原子替换，时间取机器时间 |
| `process_init` | 将流程骨架与脚本初始化到当前仓库，只创建不覆盖 |

## 角色

`product-manager`、`test-agent`、`dev-agent`、`uat-agent`、`code-review-agent`、`security-review-agent`、`logic-review-agent`

安装即注册，无需配置。技能在所有工作区可用，与仓库是否已初始化流程无关；项目内 `.dsh/skills/**` 的同名技能优先级更高。设置环境变量 `PROCESS_KIT_SKILLS=off` 可关闭。

工作区右下角提供只读的「流程看板」，展示当前工作区的流程状态。

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
