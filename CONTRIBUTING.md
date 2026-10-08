# 贡献指南

## 环境

- Node.js `^22.19.0 || >=24.0.0`
- 零运行时依赖，**不需要** `npm install`，也没有构建步骤

## 改之前

本插件有**三处必须同步**的地方，改一处不改另一处会让流程自相矛盾：

1. **状态机**：`lib/index.js` 的 `nextAction` 是通用版 `docs/process/orchestrator.md` 里状态→动作表的代码形态。
2. **journal 语义**：`lib/index.js` 的 `journalAppend` 与 `scripts/journal-append.mjs` 必须保持锁、指纹、备份、自校验语义一致。
3. **角色与总纲**：`skills/**` 里引用的章节号必须真实存在于 `scaffold/README.md`。

红线（见 README「维护备忘」）：

- 目标仓库的 `docs/process/**` 是**唯一真源**，插件不另存状态；
- 插件只做「读 + 渲染 + 安全追加 journal + 只增不改地初始化」，**不代写流程产物**；
- 不 import 任何 `@deepseek-ai/*` 运行时包。

## 跑测试

```bash
npm test
```

四项冒烟测试：`test/host.test.mjs`（工具与状态机）、`test/client.test.mjs`（看板渲染）、`test/skill-registry.test.mjs`（挂进真实 `@deepseek-ai/dsh-skill` 注册表）、`test/scripts.test.mjs`（门禁脚本回归）。

`skill-registry.test.mjs` 在本机找不到 DSH 安装时会**跳过并退出 0**，这是故意的——没有 DSH 的机器也要能跑通。

改动 `lib/index.js`（服务端部分）后，需要重装/重启 `dsh web` 才能在真实会话里看到效果；改动 `lib/client.js`（页面部分）刷新页面即可。

## 提交

- 提交信息用 `<type>: <summary>`，`type` 取 `feat` / `fix` / `docs` / `test` / `chore`。
- 一次提交只做一件事；改协议或状态机语义时，在提交信息里点明「三处同步」改了哪几处。
- 有行为变更就往 `CHANGELOG.md` 追加（只追加，不改写已发布条目）。

## 装到本地 DSH 里验证

```bash
# 用 plugin_manager 工具安装（推荐）：
#   action: install_bundle
#   target: /绝对路径/dsh-process-kit
```

不要手工改 profile 的 `package.json` 或跑 pnpm——`install_bundle` 会做这些，并且会正确记录 bundle 选择。
