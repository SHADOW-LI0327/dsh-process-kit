# 设计与维护

给要改这个插件的人。使用者只需要看 [README](../README.md) 和 [CONFIGURATION](./CONFIGURATION.md)。

## 代码组成

插件由两个独立的部分组成，内部叫「服务端部分」和「页面部分」：

```
dsh-process-kit/
├── lib/index.js          服务端部分：4 个工具 + 角色技能注册 + 看板数据路由 + 常驻提醒
├── lib/client.js         页面部分：右下角「流程看板」浮层（只读）
├── skills/               7 个通用角色技能（打包，rank 600）
├── scaffold/             流程骨架：装到目标仓库 docs/process/**
├── scripts/              门禁与流程脚本（零依赖 .mjs）
└── test/                 冒烟测试（node test/*.test.mjs）
```

两部分的更新方式不同：

- 改 **页面部分**（`lib/client.js`）：刷新浏览器即可。
- 改 **服务端部分**（`lib/index.js`）：必须重启 `dsh web`。Node 的 ESM 模块缓存不会重新加载已导入的模块。

## 设计红线

- 目标仓库的 `docs/process/**` 文件是**唯一真源**，插件不另存状态；
- 插件只做「读 + 渲染 + 安全追加 journal + 只增不改地初始化」，**不代写流程产物**；
- 不 import 任何 `@deepseek-ai/*` 运行时包，不引入插件 `Config`（profile 支持 `link:` 安装，被链接包自身的依赖不会被安装）。

## 三处必须同步

改动时如果只改一处，流程会自相矛盾：

1. **状态机**：`lib/index.js` 的 `nextAction` 是通用版 `scaffold/orchestrator.md` 里状态→动作表的代码形态，改一处必须改另一处。
2. **journal 语义**：`lib/index.js` 的 `journalAppend` 与 `scripts/journal-append.mjs` 必须保持锁、指纹、备份、自校验语义一致。
3. **角色与总纲**：`skills/**` 里引用的章节号必须真实存在于 `scaffold/README.md`。

## 页面部分的注意事项

- 客户端工厂的 id 必须等于包名（`dsh-process-kit`），React 从浏览器的模块表里拿，不需要额外安装。
- 注册 slot 用 `ctx.slots.inject(...)` + `ctx.slots.register(...)`；本插件只注册 `shell.overlay` 一个 slot。
- `package.json` 的 `dsh.client.inject` 必须列出**提供所注册 slot 的包**。本插件用 `shell.overlay`，该 slot 由 `@deepseek-ai/dsh-client-ui-layout` 提供——官方四个同样注册进 `shell.overlay` 的包（chat / schedule / settings-account / shortcuts）都声明了这一项。漏掉它，客户端加载器就拿不到模块到达顺序约束。
- 不要替换 app root，也不要向 `document.body` 追加第二个应用。
- 页面里的文字应当走客户端 locale 服务（当前只有中文硬编码，属于已知的简化）。

## 技能广播机制

7 个角色技能由插件在 **rank 600**（DSH 定义的 bundled 档）注册，**默认在所有工作区广播**——「装上就有角色」是核心承诺，不依赖目标仓库是否已初始化流程。项目自己的 `.dsh/skills/**`（rank 100/200）永远覆盖同名插件技能。`PROCESS_KIT_SKILLS=off` 可关闭广播。

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

四项冒烟测试：`host.test.mjs`（工具与状态机）、`client.test.mjs`（看板渲染）、`skill-registry.test.mjs`（挂进真实 `@deepseek-ai/dsh-skill` 注册表）、`scripts.test.mjs`（门禁脚本回归）。

`skill-registry.test.mjs` 在本机找不到 DSH 安装时会**跳过并退出 0**——这是故意的，没有 DSH 的机器也要能跑通。
