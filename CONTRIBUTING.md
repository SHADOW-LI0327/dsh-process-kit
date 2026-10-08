# 贡献指南

## 环境

- Node.js `^22.19.0 || >=24.0.0`
- 零运行时依赖，**不需要** `npm install`，也没有构建步骤

## 改之前先读

设计红线、**三处必须同步**（状态机 / journal 语义 / 角色与总纲）、页面部分注意事项，都在
[`docs/DESIGN.md`](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/DESIGN.md)。改了状态机语义却漏改对应文档，流程会自相矛盾。

## 跑测试

```bash
npm test
```

四项冒烟测试：`test/host.test.mjs`（工具与状态机）、`test/client.test.mjs`（看板渲染）、`test/skill-registry.test.mjs`（挂进真实 `@deepseek-ai/dsh-skill` 注册表）、`test/scripts.test.mjs`（门禁脚本回归）。

`skill-registry.test.mjs` 在本机找不到 DSH 安装时会**跳过并退出 0**，这是故意的——没有 DSH 的机器也要能跑通。

改动 `lib/index.js`（服务端部分）后需要重启 `dsh web` 才能在真实会话里看到效果；改动 `lib/client.js`（页面部分）刷新页面即可。

## 提交

- 提交信息用 `<type>: <summary>`，`type` 取 `feat` / `fix` / `docs` / `test` / `chore`。
- 一次提交只做一件事；改状态机或 journal 语义时，在提交信息里点明「三处同步」改了哪几处。
- 有行为变更就往 `CHANGELOG.md` 追加（只追加，不改写已发布条目）。

## 装到本地 DSH 里验证

```bash
# 用 plugin_manager 工具安装（推荐）：
#   action: install_bundle
#   target: /绝对路径/dsh-process-kit
```

不要手工改 profile 的 `package.json` 或跑 pnpm——`install_bundle` 会做这些，并且会正确记录 bundle 选择。

## 发布（维护者）

```bash
# 1. 推 GitHub
git push origin main

# 2. 发 npm（首次需先 npm login）
npm publish
```

发版前检查：

```bash
npm test                      # 四项冒烟测试
npm pack --dry-run            # 确认 files 白名单内容正确（不应含 test/ 与 .github/）
```

CI 会在每次 push / PR 上跑同样的两项检查（`.github/workflows/ci.yml`：`npm test` × node 22.19 / 24，外加 `npm pack` 内容核对）。
