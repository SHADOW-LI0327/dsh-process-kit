# 设计与维护

给要改这个插件的人。使用者只需要看 [README](../README.md) 和 [CONFIGURATION](./CONFIGURATION.md)。

## 代码组成

纯服务端插件（**没有页面部分**，不注册任何客户端 slot）：

```
dsh-process-kit/
├── lib/index.js          4 个工具 + 角色技能注册 + 常驻提醒
├── skills/               9 个通用角色技能（打包，rank 600）
├── scaffold/             流程骨架：装到目标仓库 docs/process/**
├── scripts/              门禁与流程脚本（零依赖 .mjs）
└── test/                 冒烟测试（node test/*.test.mjs）
```

改 `lib/index.js` 后必须重启 `dsh web`：Node 的 ESM 模块缓存不会重新加载已导入的模块。

## 设计红线

- 目标仓库的 `docs/process/**` 文件是**唯一真源**，插件不另存状态；
- 插件只做「读 + 渲染 + 安全追加 journal + 只增不改地初始化」，**不代写流程产物**；
- 不 import 任何 `@deepseek-ai/*` 运行时包，不引入插件 `Config`（profile 支持 `link:` 安装，被链接包自身的依赖不会被安装）；
- **角色边界不做代码强制**。9 个角色是提示词层面的 persona，**交付质量由 Gate 的人裁承担**，角色分工承担的是**效率**（各写各的、不互相返工）。不要为了「更硬」去加宿主中间件、权限矩阵或改 preset —— 理由见下节。

## 为什么角色边界不做代码强制

生态里已有插件用宿主中间件 / 权限矩阵强制角色写权（`dsh-crew` 的 `pm-write-guard`、`dsh-swarm` 的 `permissions.ts`、`dsh-expert-team` 的 `tools/post-execute` 拦截）。我们是**刻意不做**，三条理由：

1. **角色没有运行时身份**。角色是 rank 600 广播的**技能**，宿主不知道「这个 subagent 是 dev-agent」。要强制就得先有身份传递 —— 要么改 agent preset（`dsh-crew` 就必须切 Crew preset 才能用），要么改派单方式走插件工具。两者都会毁掉「装上就有角色、任意工作区可用、与仓库是否初始化无关」这条核心承诺（与下面「按目录门禁」是同一类错误）。
2. **仲裁者在人**。dev 动了测试，正确处置是让人在 Gate2 **知道并裁定**，不是让宿主拒绝这次写入。实时拦截会把「可裁定」变成「死锁」—— hotfix 确实要动测试、spike 确实要 PM 写代码，而 Gate 摘要的 ❓ 栏本来就是承载这类裁定的。
3. **正面战场打不赢**。比实时强制，对手有中间件、权限矩阵和 preset 机制，我们没有也不该有。我们的位置在「阶段推进权由人签 + 状态入仓 + 防篡改 journal」。

**如果要补，补的是「事后判定」而不是「实时拦截」**：把机械可判的越界（如 dev 环节的 diff 触及测试文件）交给已有门禁脚本 `scripts/process/check-rules.mjs` 在 Gate 时判、`exit 1` 并把该条塞进 Gate 摘要 ❓ 栏；**默认 fail-open**，未初始化 `docs/process`、快速路径、未配 §3 一律跳过；越界允许「人 approve 留痕」而不是禁止。**已实施（0.5.0）**：`check-rules.mjs` 判据 ⑫（含子条 ⑫a）就按这条路做 —— 判据级 fail-open、越界可经 journal 的 `approve` 留痕放行、脚本级前置条件仍如实退出 1。**判定边界硬性限定在 `docs/process/` 之外**：流程目录整棵树豁免，否则「主控每次 Gate 后改状态位」会把 ⑫ 变成恒红项（总纲 §5 第 4 条禁止恒红）。

## 为什么借鉴调研放在 Gate0 前、且 pm / architect 并行

用户说不清目的时，直接起草核对件等于把「没说出来的需求」留给后面返工。借鉴调研的作用**不是替人拍板**，而是把「同类产品怎么做、技术上要付什么代价、许可证能不能碰」变成 **Gate0 上的候选 `Q`**，让人的裁定更便宜。

**按需触发，不是所有 full 包都跑**：表达已可断言、单点改动、人明确不用，就直接起草核对件；只有拿不准时才做。把调研做成「full 必跑」会拖慢清楚的小需求，也会把人的注意力耗在没有新信息的报告上。

- **pm 做广度、architect 做深度**：pm 读 README / docs / issue，还原用户目标与竞品缺口；architect 读架构 / schema / 依赖 / 许可证，核事实、标代价。**PM 不读源码，源码核实归 architect**——这条挡住「README 说有、代码里没有」。
- **并行减少锚定，但必须汇合**：两边独立扫描（互不读对方文件），完成后 architect 逐条标注 pm 的 `C-NN`，pm 反推约束型需求。**没有汇合 = 调研未完成**；否则只是两份半成品报告，把合并成本转给人。
- **候选不是裁定**：`C-NN` / `K-NN` 只有被主控折成核对件的 `Q` / `N` 才生效，**不得直接进 AC**。外部内容是不可信数据；不抄代码、不引依赖、记录许可证；fast 路径不做。

## 四处必须同步

改动时如果只改一处，流程会自相矛盾：

1. **状态机**：`lib/index.js` 的 `nextAction` 是通用版 `scaffold/orchestrator.md` 里状态→动作表的代码形态，改一处必须改另一处。
2. **journal 语义**：`lib/index.js` 的 `journalAppend` / `journalChain` / `journalIntegrity` 与 `scripts/journal-append.mjs` 必须保持锁、指纹、备份、自校验语义一致；**链式指纹的式子必须逐字相同**（`chain_n = hash16(chain_{n-1} + line_n)`，`chain_0 = ""`）。两边算法一旦分叉，读取侧会把正常 journal 判成「篡改」，或反过来把篡改判成正常。`test/host.test.mjs` 里有一条「测试侧链式算法应与 lib 一致」的断言专门守这条。另加一份**故意独立**的实现：`docs/ACCEPTANCE.md` 里给「不装插件的人」复算用的那段核验脚本 —— 核验者不该被迫信任被核验方的代码，代价就是**它是同一个式子的第三份拷贝**，改公式时必须一并改（漏改的后果很刺眼：正常 journal 被判「篡改嫌疑」）。
3. **角色与总纲**：`skills/**` 里引用的章节号必须真实存在于 `scaffold/README.md`。
4. **journal 字段语义**：`lib/index.js` 的 `process_journal` 参数、总纲 §7 的字段清单、以及 `gate_summary` / `process_status` 的取值口径是**同一套契约**（`action:"run"` 必带 `command` + `exitCode`；`action:"approve"` 带 `gate` + `via`）。加字段或改语义时三处一起改，否则会出现「记了但没人读」或「读了但没人记」——后者更危险：摘要显示「未记录」，而人以为早就跑过。

## 技能广播机制

9 个角色技能由插件在 **rank 600**（DSH 定义的 bundled 档）注册，**默认在所有工作区广播**——「装上就有角色」是核心承诺，不依赖目标仓库是否已初始化流程。项目自己的 `.dsh/skills/**`（rank 100/200）永远覆盖同名插件技能。`PROCESS_KIT_SKILLS=off` 可关闭广播。

### 已踩过的陷阱：不要改回「按目录存在与否门禁」

曾经有一版按「工作区里有没有 `docs/process` 目录」来决定要不要暴露角色技能。它是错的，原因值得记住：

**技能目录是按 cwd 缓存的。** 门禁会让「刚清空、或尚未初始化 `docs/process`」的工作区**看不到角色**；更糟的是，即使随后用 `process_init` 把目录建回来，缓存也不会失效，角色**不会回来**——使用者只能靠再重启一次自救。

所以现在不做目录门禁，改用环境变量这把显式的开关。

## 为什么声明 peerDependencies 是安全的

插件声明了 `peerDependencies: { "@deepseek-ai/dsh": ">=0.1.7-rc.2 <0.3.0" }`，但**宿主运行时不会被装进用户的 profile**。原因是 DSH 的 profile 目录里自带 `pnpm-workspace.yaml`：

```yaml
nodeLinker: hoisted
autoInstallPeers: false
```

`autoInstallPeers: false` 让 pnpm 只把这条声明当作版本校验依据，不去真装它——所以既拿到了 DSH 的兼容门禁，又不会拖进整个 dsh 运行时（280+ 个 `@deepseek-ai/*` 包，含 node-pty / koffi 等需要原生构建的依赖）。

### 复现安装行为时，必须带上这份 pnpm 配置

在裸目录（比如 `/tmp`）里直接 `pnpm add github:...` 会得到**完全错误的结论**：默认 `autoInstallPeers` 为 true，pnpm 会去装整个 dsh 运行时，最后因为原生构建脚本未批准而以非零码退出——看起来像「这个插件装不上」，实际只是测试装置没有复刻真实环境。

忠实复刻的最小装置：

```bash
mkdir /tmp/repro && cd /tmp/repro
printf 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n' > pnpm-workspace.yaml
printf '{"name":"dsh-profile-web","private":true}\n' > package.json
pnpm add github:SHADOW-LI0327/dsh-process-kit
# 期望：Packages: +1（不是 +500）；会出现一条 peer 未满足的 WARN，那是正确行为
```

## 测试

```bash
npm test
```

三项冒烟测试：`host.test.mjs`（工具与状态机）、`skill-registry.test.mjs`（挂进真实 `@deepseek-ai/dsh-skill` 注册表）、`scripts.test.mjs`（门禁脚本回归）。

`skill-registry.test.mjs` 在本机找不到 DSH 安装时会**跳过并退出 0**——这是故意的，没有 DSH 的机器也要能跑通。
