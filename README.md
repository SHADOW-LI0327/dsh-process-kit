# dsh-process-kit

[![CI](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-process-kit)](https://www.npmjs.com/package/dsh-process-kit)
[![license](https://img.shields.io/npm/l/dsh-process-kit)](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)

用 DSH 写代码的时候，进度往往只活在对话里。会话一断、上下文一压缩，Agent 就不知道昨天做到哪、下一步该干什么。

这个插件把流程挪到仓库里的文件上：进度写在 `docs/process/**` 的 frontmatter 里，每轮唤醒先读一遍，就知道接着干什么。它还负责分角色——写实现的不能写测试，写测试的不能验收——并且只在几个关键节点停下来找人确认。

## 它解决什么

**进度只在对话里。**
每轮唤醒先调 `process_status`。它扫一遍 `docs/process/**`，把每个需求包走到哪一步、Gate 签没签、有没有没关的 bug、下一步该派谁，一次告诉你。

**自己写、自己测、自己验。**
7 个角色各有硬边界和一份专属技能。写实现的不能写测试，写测试的不能验收。

**每一步都要人盯着。**
只在 Gate0/1/2/4 停下来。停下来的时候给你一份两段式摘要（✅ 完成了什么 / ❓ 还需要你定什么），其余步骤不打扰你。

## 安装

用 DSH 自己的 `plugin_manager`，或者等价的 `dsh plugin --profile <名> add <spec>`。三种 spec 选一个：

| 方式 | target 填什么 |
|---|---|
| npm | `dsh-process-kit` |
| GitHub | `github:SHADOW-LI0327/dsh-process-kit` |
| 本地 clone | 绝对路径，比如 `/Users/<you>/dsh-plugins/dsh-process-kit` |

```bash
# 后两种需要先有本地目录
git clone https://github.com/SHADOW-LI0327/dsh-process-kit ~/dsh-plugins/dsh-process-kit
```

插件不 import 任何 `@deepseek-ai/*` 包，也没有构建步骤。

装完立刻可用，不用重启。但如果你改了 `lib/index.js`（跑在 dsh 进程里的那部分），必须重启 `dsh web`——Node 不会重新加载已经 import 过的模块。改 `lib/client.js`（网页里那部分）刷新页面就够了。

### 对 dsh 版本的要求

`package.json` 里声明了 `peerDependencies: {"@deepseek-ai/dsh": ">=0.1.7-rc.2 <0.3.0"}`。dsh 版本不在这个区间里，安装会被拒绝并回滚，而不是装上一个不报错但也不工作的插件。

dsh 升到 0.3 之后，这个区间要跟着放宽。

> 如果你以前装过别的流程包（比如早期的原型包），它可能注册了同名的 `process_status` / `gate_summary` / `process_journal`。这种情况下新包激活会报 `tool "process_status" is already registered`，而且整行都不激活。先把旧包 `remove_bundle`，再把新包 `set_bundle enabled=false` 再 `true` 触发重新激活。

## 用起来是什么样

```text
1. 装好插件，重启一次 dsh web。
2. 在目标仓库里让 Agent 调 process_init，它会把 docs/process/** 和 scripts/process/*.mjs 铺好。
3. 填 docs/process/PROJECT.md（端与目录、命令、产物属主表，见下面「配置」）。
4. 在 package.json 里加上流程要用的 npm scripts，process_init 的回报里给了例子。
5. 之后每轮唤醒先跑 process_status，照它给的「下一步动作」办事。
```

`process_init` 会铺这些东西：

- `docs/process/` —— `README.md`（流程总纲）、`orchestrator.md`（调度手册）、`PROJECT.md`（你要填的那份）、PRD 与核对件模板、`tools/README.md`
- `scripts/process/` —— `journal-append.mjs`、`check-artifact-paths.mjs`、`check-rules.mjs`、`sync-prd-version.mjs`
- `AGENTS.md` —— 只在仓库里没有的时候才建。已经有了就一个字节都不动，只把该并入的段落打印出来让你自己合。不想要就传 `agents: false`。

它只创建、不覆盖。

## 附带的四个工具

| 工具 | 干什么 |
|---|---|
| `process_status` | 扫 `docs/process`，给出每个包的状态、Gate 四灯、journal 尾部、没关的 bug，以及下一步该干什么 |
| `gate_summary` | 生成某个包的 Gate 两段式摘要骨架。✅ 和 ❓ 留给你填，依据自动带上 |
| `process_journal` | 往 journal 追加一条。带锁、指纹校验、原子替换，时间取机器时间 |
| `process_init` | 把流程骨架和脚本铺到当前仓库，只创建不覆盖 |

## 附带的 7 个角色

`product-manager`、`test-agent`、`dev-agent`、`uat-agent`、`code-review-agent`、`security-review-agent`、`logic-review-agent`

装完就能用，不用配置。它们在所有工作区都可用，跟仓库有没有初始化过流程无关。你自己仓库里 `.dsh/skills/**` 的同名技能会覆盖它们。不想让它们出现就设 `PROCESS_KIT_SKILLS=off`。

网页右下角会有一个「流程看板」，跟着当前工作区显示流程状态。

## 配置

要改的只有一个文件：`docs/process/PROJECT.md`。流程文档本身不写死任何项目的路径和命令，全部引用这个文件。所以升级插件不会覆盖你填的东西，换个项目也只要重填这一份。

七个小节：§1 端与目录、§2 命令槽、§3 产物属主表、§4 项目配置、§5 UAT 前置自检、§6 环境与凭据、§7 通知（可选）。

没填就是没配。模板里所有 `<...>` 都会被脚本当成占位符忽略，不会变成真配置。细节在 [docs/CONFIGURATION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONFIGURATION.md)。

## 其他文档

| 文档 | 内容 |
|---|---|
| [docs/CONFIGURATION.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONFIGURATION.md) | PROJECT.md 七个小节、占位符规则、门禁脚本 |
| [docs/DESIGN.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/DESIGN.md) | 改这个插件要知道的事：三处必须同步、已经踩过的坑 |
| [docs/ECOSYSTEM.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/ECOSYSTEM.md) | DSH 插件生态的准入门槛与现状 |
| [CONTRIBUTING.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/CONTRIBUTING.md) | 环境、测试、提交和发布 |

## License

MIT
