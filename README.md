# dsh-process-kit

[![CI](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-process-kit)](https://www.npmjs.com/package/dsh-process-kit)
[![license](https://img.shields.io/npm/l/dsh-process-kit)](./LICENSE)

把「单人开发 + LLM 角色协作」流程做成一个可安装的 [DSH](https://github.com/deepseek-ai/deepseek-harness) 插件。

装上它，任何仓库都能立刻拥有：**一套文件状态机驱动的开发流程 + 7 个角色 subagent + 门禁脚本 + 界面状态看板**。流程状态仍然写在你的仓库里（`docs/process/**` 的 frontmatter 是唯一真源），插件只负责确定性的读、渲染、安全追加与脚手架落地。

> **术语**：插件由两个部分组成，后面统一用这两个词，不再用「Host 半 / 浏览器半」。
>
> - **服务端部分**（`lib/index.js`）：在 dsh 进程里跑，负责四个工具、角色技能注册、看板数据路由。
> - **页面部分**（`lib/client.js`）：在网页里跑，负责右下角那个「流程看板」浮层。
>
> 两者独立更新：改页面部分刷新浏览器即可；改服务端部分要重启 `dsh web`（原因见「安装」一节）。

## 它解决什么

单人开发用 LLM 时，最容易崩的三件事：

| 问题 | 本框架的答案 |
|---|---|
| 上下文一断，进度全丢 | **文件状态机**：状态写在 `docs/process/**` 的 frontmatter 里，唤醒先调 `process_status`，不靠聊天历史 |
| 自己写、自己测、自己验，等于没验 | **裁判/运动员分离**：7 个角色各有硬边界与专属技能，写实现的不能写测试，写测试的不能验收 |
| 每步都要人盯，人力被榨干 | **Gate 压缩人力**：Gate0/1/2/4 才停，每个停点给人一份两段式摘要（✅ 完成了什么 / ❓ 还需要裁定什么），其余全自动 |

## 组成

```
dsh-process-kit/
├── lib/index.js          服务端部分：4 个工具 + 角色技能注册 + 看板数据路由 + 常驻提醒
├── lib/client.js         页面部分：右下角「流程看板」浮层（只读）
├── skills/               7 个通用角色技能（打包，rank 600）
├── scaffold/             流程骨架：装到目标仓库 docs/process/**
├── scripts/              门禁与流程脚本（零依赖 .mjs）
└── test/                 冒烟测试（node test/*.test.mjs）
```

### 工具

| 工具 | 作用 |
|---|---|
| `process_status` | 扫 `docs/process` 的 frontmatter，出状态机快照：每包 status / Gate 四灯 / journal 尾部 / open bugs / 状态位不一致警告 / **下一步动作** |
| `gate_summary` | 生成某包的 Gate 两段式摘要骨架（✅ / ❓ 留占位，📎 依据自动填） |
| `process_journal` | 安全追加 journal（锁 + 指纹校验 + 原子替换 + 自校验，机器时间） |
| `process_init` | 把骨架与脚本初始化到当前仓库，**只创建、不覆盖** |

### 7 个角色（安装即得，无需配置）

`product-manager`、`test-agent`、`dev-agent`、`uat-agent`、`code-review-agent`、`security-review-agent`、`logic-review-agent`

技能由插件在 rank 600（DSH 定义的 bundled 档）注册，**默认在所有工作区广播**——「装上就有角色」是它的核心承诺，不依赖目标仓库是否已初始化流程。**项目自己的 `.dsh/skills/**`（rank 100/200）永远覆盖同名插件技能**，即「插件给基线，项目可覆盖」。

> 需要安静（只在已初始化流程的仓库里出现）就设 `PROCESS_KIT_SKILLS=off`。
>
> ⚠ **不要**改回「按目录存在与否门禁」：技能目录是按 cwd 缓存的，门禁会让「清空/尚未初始化 `docs/process`」的工作区**看不到角色**，而且 `process_init` 建回目录也不会让它们回来（缓存不失效），使用者只能靠再重启一次自救——这是实测踩到的真陷阱。

## 安装

插件不 import 任何 `@deepseek-ai/*` 运行时包（只用一个 `peerDependencies` 声明宿主版本区间，见下），因此**无需构建**，clone 下来即可用。

安装统一走 DSH 自己的 `plugin_manager`（或等价的 `dsh plugin --profile <名> add <spec>`），三种 spec 任选：

| 方式 | spec | 说明 |
|---|---|---|
| npm（推荐） | `dsh-process-kit` | 需要已发到 npm；升级即改版本号 |
| GitHub | `github:SHADOW-LI0327/dsh-process-kit` | 免 npm，直接拉默认分支；锁版本用 `#<tag>` 或 `#<commit>` |
| 本地 clone | 绝对路径 `/Users/<you>/dsh-plugins/dsh-process-kit` | 改插件源码自用时用这个 |

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

`peerDependencies` 声明 `@deepseek-ai/dsh: ">=0.1.7-rc.2 <0.3.0"`。DSH 在安装前（npm spec）或安装后（git/tarball spec）会用宿主实际版本比对这个区间，不匹配就**拒绝安装并回滚**，而不是装上一个静默失效的插件。dsh 升到 0.3.x 之后需要同步放宽这个区间。

> 插件的四个工具用 `inject` 拿到 `tools` / `systemPrompt` / `webServer` / `connection` / `sessions` / `sessionQuery` 六个服务；这些服务在 0.2.x 上尚未变更，但**未逐一承诺稳定**，所以上限设在 `<0.3.0`。

**⚠ 升级/替换时注意工具重名**：如果之前装过别的流程包（例如早期的原型包）并注册了同名工具（`process_status` / `gate_summary` / `process_journal`），新包激活会报 `tool "process_status" is already registered` 并且**整行不激活**。处置：先 `remove_bundle`（或 `set_bundle enabled=false`）旧包，再把新包 `set_bundle enabled=false → true` 触发重新激活。

## 使用

```text
1. 装好插件、重启一次 dsh web（服务端部分生效）。
2. 在目标仓库里让 Agent 调用 process_init  → 落地 docs/process/** 与 scripts/process/*.mjs。
3. 编辑 docs/process/PROJECT.md            → 填端与目录、命令槽、产物属主表（唯一接口）。
4. 在 package.json 里加 npm scripts（示例见 process_init 的回报）。
5. 之后每轮唤醒 Agent 先跑 process_status，按它给的「下一步动作」办事。
```

`process_init` 的产出：

- `docs/process/`：`README.md`（总纲，唯一真源）、`orchestrator.md`（调度手册）、`PROJECT.md`（项目适配槽位）、`input/prd` 模板、`tools/README.md`
- `scripts/process/`：`journal-append.mjs`、`check-artifact-paths.mjs`、`check-rules.mjs`、`sync-prd-version.mjs`
- `AGENTS.md`：**只在缺失时**按模板建一份项目级常驻指针（已存在则绝不改写，只把该并入的段落打印出来待人工合并）。用 `agents: false` 可跳过。

### 上下文是怎么"常驻"进去的（三层）

AGENTS.md 那条老路（harness 读工作区指令文件）和插件不是替代关系，而是互补的三层：

| 层 | 载体 | 作用域 | 内容 |
| --- | --- | --- | --- |
| 框架级常驻 | 插件注册的 systemPrompt 段 | 该 profile 下**所有**工作区与 subagent | 6 行硬提醒：先调 `process_status`、Gate 必须人签、两段式、journal 纪律、角色由插件技能提供、真源指向 |
| 项目级常驻 | 仓库里的 `AGENTS.md` | 该仓库 | 指针：本项目流程真源在 `docs/process/README.md`、适配在 `PROJECT.md`；**不复述细则** |
| 按需注入 | 角色技能 / `docs/process/README.md` / `PROJECT.md` | 派单时或读到才进上下文 | 角色职责、状态机、Gate 格式、属主表 |

插件**替不了**第二层：插件是跨仓库的通用包，只有仓库自己才知道"本项目流程真源在哪"。所以 `process_init` 保证它存在。

GUI 右下角的「流程看板」会跟着工作区自动显示状态，每 6 秒刷新一次。

## 通用与专属的分界

**唯一接口是 `docs/process/PROJECT.md`**，七个小节分别是：§1 端与目录、§2 命令槽、§3 产物属主表、§4 项目配置、§5 UAT 前置自检、§6 环境与凭据、§7 通知（可选）。端与目录、命令、产物属主、脚本配置、凭据、通知都在那里填；通用文档（总纲/调度手册/角色技能）只引用它，不硬编码任何具体项目的路径与命令。

这意味着升级插件不会覆盖你填的 PROJECT.md，换项目也只需重填 PROJECT.md。

### 未填 = 未配置（PROJECT.md 的占位符纪律）

模板里所有 `<...>` 都是**会被脚本忽略**的占位符，这条是硬口径：

- **§3 可写路径**：含 `<` 或 `>` 的条目一票不放行。整列解析不到任何有效条目时，落点门禁**报错退出 1**（绝不静默放行——假绿比红更危险）。
- **§4 / §5 取值**：含 `<` 或 `>` 的取值视为未配置，**回落到「说明」列承诺的内置默认值**。所以模板的示例值永远不会覆盖默认配置。
- **``` 代码块内部不参与解析**：模板里的完整示例都放在代码块里，照着抄不会污染机器读取。
- **变量路径别写 `<...>`**：用 `*` 通配（`scripts/*-*.{ts,sql}`），或干脆不写进 §3、改在登记区**逐件登记**（更严格，推荐用于批次脚本）。

已初始化的项目里 `scripts/process/*.mjs` 是**项目自带副本**（不随插件升级自动更新）；插件修了门禁逻辑后，需要把 `scripts/process/*.mjs` 与 `docs/process/tools/README.md` 重新同步过去。

## 维护备忘

改动本插件时，三处**必须同步**，否则流程会自相矛盾：

1. **状态机**：`lib/index.js` 的 `nextAction` 是通用版 `docs/process/orchestrator.md` 状态→动作表的代码形态，改一处必须改另一处。
2. **journal 语义**：`lib/index.js` 的 `journalAppend` 与 `scripts/journal-append.mjs` 必须保持锁、指纹、备份、自校验语义一致。
3. **角色与总纲**：`skills/**` 里引用的章节号必须真实存在于 `scaffold/README.md`。

红线：

- 目标仓库的 `docs/process/**` 文件是**唯一真源**，插件不另存状态；
- 插件只做「读 + 渲染 + 安全追加 journal + 只增不改地初始化」，**不代写流程产物**；
- 不 import 任何 `@deepseek-ai/*` 运行时包（仅在 `peerDependencies` 里声明宿主版本区间供 DSH 兼容门禁比对），不引入插件 `Config`（profile 支持 `link:` 安装，被链接包自身依赖不会被安装）。

## 生态准入状态

社区那套插件清单（图标、多语言 README、`locale/*.json` 展示元数据等）**目前刻意不做**，只把差距与证据记录在 [`docs/ECOSYSTEM.md`](./docs/ECOSYSTEM.md)。已完成的「可标准安装」部分：npm / GitHub / 本地路径三条 spec、`peerDependencies` 兼容门禁、`files` 白名单、`keywords` 与 GitHub topic。

## 发布（维护者）

```bash
# 1. 发 GitHub
git remote add origin https://github.com/SHADOW-LI0327/dsh-process-kit.git
git push -u origin main

# 2. 发 npm（需先 npm login；首次发布用 --access public）
npm publish
```

发版前检查：

```bash
npm test                      # 四项冒烟测试
npm pack --dry-run            # 确认 files 白名单内容正确（不应含 test/ 与 .github/）
```

## License

MIT
