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

四项冒烟测试：`test/host.test.mjs`（工具与状态机）、`test/skill-registry.test.mjs`（挂进真实 `@deepseek-ai/dsh-skill` 注册表）、`test/scripts.test.mjs`（门禁脚本回归）、`test/i18n.test.mjs`（双语一致性：两套骨架文件清单、零残留、配置键对照表、英文仓库里门禁能跑）。

`skill-registry.test.mjs` 在本机找不到 DSH 安装时会**跳过并退出 0**，这是故意的——没有 DSH 的机器也要能跑通。

改动 `lib/index.js` 后需要重启 `dsh web` 才能在真实会话里看到效果：Node 的 ESM 模块缓存不会重新加载已导入的模块。

## 双语文档纪律

本插件是**同一套流程、两种语言**（见 [`docs/I18N.md`](docs/I18N.md)）：

- 改 `scaffold/**` 必须同轮改 `scaffold/en/**`（文件与标题层级一一对应）；
- 改 `README.md` / `docs/*.md` 必须同轮改同名的 `.en.md`（`README.en.md`、`docs/CONFIGURATION.en.md` 等）；
- 改 `skills/<role>/SKILL.md` 必须同轮改 `skills/<role>/SKILL.en.md`（`name` 保持一致）；
- 改 `scripts/*.mjs` 的文案要写成 `msg(zh, en)` 成对字面量；**新增解析锚点必须同时给「机器标记 + 中文别名 + 英文别名」**，只加一种语言不算完成；
- 改 `PROJECT.md` 的配置键要同步 `scripts/project-config.mjs` 的 `CONFIG_KEYS` 与 `docs/I18N.md` 的对照表。

`npm test` 里 `test/i18n.test.mjs` 会把这些钉住：文件清单不一致、英文侧残留中文、键表三方不一致都直接红。

## 提交

- 提交信息用 `<type>: <summary>`，`type` 取 `feat` / `fix` / `docs` / `test` / `chore`。
- 一次提交只做一件事；改状态机或 journal 语义时，在提交信息里点明「三处同步」改了哪几处。
- `CHANGELOG.md` 是本插件自身的日志：按 GitHub 风格（`Added` / `Changed` / `Fixed` / `Removed`）**简要记录功能与行为变更**。只记变更本身 —— 发现过程、反向实验、实测数值这类开发过程写在提交信息里，不进 CHANGELOG。

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
