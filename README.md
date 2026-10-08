# dsh-process-kit

[![CI](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-process-kit)](https://www.npmjs.com/package/dsh-process-kit)
[![license](https://img.shields.io/npm/l/dsh-process-kit)](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)

把「单人开发 + LLM 角色协作」流程做成一个可安装的 [DSH](https://github.com/deepseek-ai/deepseek-harness) 插件。

装上它，任何仓库都能立刻拥有：**一套文件状态机驱动的开发流程 + 7 个角色 subagent + 门禁脚本 + 界面状态看板**。流程状态写在你的仓库里（`docs/process/**` 的 frontmatter 是唯一真源），插件只做确定性的读、渲染、安全追加与脚手架落地。

## 它解决什么

单人开发用 LLM 时，最容易崩的三件事：

| 问题 | 本框架的答案 |
|---|---|
| 上下文一断，进度全丢 | **文件状态机**：状态写在 `docs/process/**` 的 frontmatter 里，唤醒先调 `process_status`，不靠聊天历史 |
| 自己写、自己测、自己验，等于没验 | **裁判/运动员分离**：7 个角色各有硬边界与专属技能，写实现的不能写测试，写测试的不能验收 |
| 每步都要人盯，人力被榨干 | **Gate 压缩人力**：Gate0/1/2/4 才停，每个停点给人一份两段式摘要（✅ 完成了什么 / ❓ 还需要裁定什么），其余全自动 |

## 安装

插件不 import 任何 `@deepseek-ai/*` 运行时包，**无需构建**，clone 下来即可用。安装统一走 DSH 自己的 `plugin_manager`（或等价的 `dsh plugin --profile <名> add <spec>`），三种 spec 任选：

| 方式 | spec | 说明 |
|---|---|---|
| npm（推荐） | `dsh-process-kit` | 升级即改版本号 |
| GitHub | `github:SHADOW-LI0327/dsh-process-kit` | 免 npm，拉默认分支；锁版本用 `#<tag>` 或 `#<commit>` |
| 本地 clone | 绝对路径，如 `/Users/<you>/dsh-plugins/dsh-process-kit` | 需要改插件源码时用 |

```bash
# 方式二 / 三需要先有本地目录
git clone https://github.com/SHADOW-LI0327/dsh-process-kit ~/dsh-plugins/dsh-process-kit

# 然后在 DSH 里用 plugin_manager：
#   action: install_bundle
#   target: dsh-process-kit                      （npm）
#   target: github:SHADOW-LI0327/dsh-process-kit （git）
#   target: /Users/<you>/dsh-plugins/dsh-process-kit （绝对路径）
```

> **首次安装即时生效**（工具、技能、看板路由立刻可用），不需要重启。
> **改已加载插件的服务端代码**（`lib/index.js`）才需要重启 `dsh web`——Node 的 ESM 模块缓存不会重新加载已导入的模块；**页面部分**（`lib/client.js`）改完刷新页面即可。

### 宿主版本要求

`peerDependencies` 声明 `@deepseek-ai/dsh: ">=0.1.7-rc.2 <0.3.0"`。DSH 会用宿主的实际版本比对这个区间，不匹配就**拒绝安装并回滚**，而不是装上一个静默失效的插件。dsh 升到 0.3.x 之后需要同步放宽这个区间。

> **升级/替换时注意工具重名**：如果之前装过别的流程包（例如早期的原型包）并注册了同名工具（`process_status` / `gate_summary` / `process_journal`），新包激活会报 `tool "process_status" is already registered` 并且**整行不激活**。处置：先 `remove_bundle`（或 `set_bundle enabled=false`）旧包，再把新包 `set_bundle enabled=false → true` 触发重新激活。

## 使用

```text
1. 装好插件、重启一次 dsh web。
2. 在目标仓库里让 Agent 调用 process_init  → 落地 docs/process/** 与 scripts/process/*.mjs。
3. 编辑 docs/process/PROJECT.md            → 填端与目录、命令槽、产物属主表（唯一接口）。
4. 在 package.json 里加 npm scripts（示例见 process_init 的回报）。
5. 之后每轮唤醒 Agent 先跑 process_status，按它给的「下一步动作」办事。
```

`process_init` 的产出：

- `docs/process/`：`README.md`（总纲，唯一真源）、`orchestrator.md`（调度手册）、`PROJECT.md`（项目适配槽位）、`input/prd` 模板、`tools/README.md`
- `scripts/process/`：`journal-append.mjs`、`check-artifact-paths.mjs`、`check-rules.mjs`、`sync-prd-version.mjs`
- `AGENTS.md`：**只在缺失时**按模板建一份项目级常驻指针（已存在则绝不改写，只把该并入的段落打印出来待人工合并）。用 `agents: false` 可跳过。

## 能力

### 四个工具

| 工具 | 作用 |
|---|---|
| `process_status` | 扫 `docs/process` 的 frontmatter，出状态机快照：每包 status / Gate 四灯 / journal 尾部 / open bugs / 状态位不一致警告 / **下一步动作** |
| `gate_summary` | 生成某包的 Gate 两段式摘要骨架（✅ / ❓ 留占位，📎 依据自动填） |
| `process_journal` | 安全追加 journal（锁 + 指纹校验 + 原子替换 + 自校验，机器时间） |
| `process_init` | 把骨架与脚本初始化到当前仓库，**只创建、不覆盖** |

### 7 个角色（安装即得，无需配置）

`product-manager`、`test-agent`、`dev-agent`、`uat-agent`、`code-review-agent`、`security-review-agent`、`logic-review-agent`

技能随插件注册，**默认在所有工作区可用**——不依赖目标仓库是否已初始化流程。项目自己的 `.dsh/skills/**` 永远覆盖同名插件技能（「插件给基线，项目可覆盖」）。想安静下来就设 `PROCESS_KIT_SKILLS=off`。

右下角的「流程看板」会跟着当前工作区显示流程状态。

## 配置你的仓库

流程里所有会随项目变化的东西，都集中在一个文件：**`docs/process/PROJECT.md`**。通用文档（总纲、调度手册、角色技能）只引用它，不硬编码任何具体项目的路径与命令。所以升级插件不会覆盖你填的内容，换项目也只需重填这一份。

七个小节：§1 端与目录、§2 命令槽、§3 产物属主表、§4 项目配置、§5 UAT 前置自检、§6 环境与凭据、§7 通知（可选）。**未填 = 未配置**，模板里的 `<...>` 占位符会被脚本忽略而不是当成真配置。

细节见 **[docs/CONFIGURATION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONFIGURATION.md)**。

## 进一步阅读

| 文档 | 给谁看 |
|---|---|
| [docs/CONFIGURATION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONFIGURATION.md) | 要在自己仓库里配置流程的人：PROJECT.md 七个小节、占位符纪律、门禁脚本 |
| [docs/DESIGN.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/DESIGN.md) | 要改这个插件的人：设计红线、状态机与 journal 的三处同步、页面部分的注意事项 |
| [docs/ECOSYSTEM.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/ECOSYSTEM.md) | 维护者：DSH 插件生态的准入门槛、差距与证据 |
| [CONTRIBUTING.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/CONTRIBUTING.md) | 贡献者：环境、测试、提交规范、发布步骤 |

## License

MIT
