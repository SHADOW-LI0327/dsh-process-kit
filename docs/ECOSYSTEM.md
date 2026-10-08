# 生态准入状态

这份文档记录 dsh-process-kit 相对 DSH 插件社区规范的**差距与证据**，供将来决定是否投入。

结论：**只做「让人装得上」，不做「上架打磨」**。下面的延期项不是遗漏，是刻意不做——触发条件见文末。

---

## 1. 生态现状：全部是第三方的

DSH 官方**没有**插件市场或插件目录。在官方安装包（`@deepseek-ai/dsh`）里检索 `marketplace` / `catalog` / `dsh-plugin.org` 均无结果。

| 名称 | 作者 | 性质 | 准入方式 |
|---|---|---|---|
| [dsh-plugin.org](https://dsh-plugin.org) | `dshplugin`（个人） | 插件市场网站 | 公开仓库 + GitHub topic `dsh-plugin` + 官网 Issue 模板 |
| `dsh-plugin-shop` | `LivXue` | 自动发现型目录 | npm `keywords` 含 `dsh-plugin`/`deepseek-harness`，或 GitHub 同名 topic——**自动收录，无需申请** |
| `dsh-plugin-guide` | `PerryLink` | 文档 + CLI 检查器 | 无门槛（工具，不是市场） |

因此「加入生态」的实际含义是：**公开仓库 + 一个 keyword/topic**，成本接近零，但也不构成质量背书（`dsh-plugin.org` 自报的插件总数在不同页面互相矛盾）。

## 2. 官方硬约束（本仓库已满足）

官方规范在 DSH 自带技能里：`@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/`（`references/host-plugin.md`、`references/ui-plugin.md`、`templates/decoration/`）。

| 约束 | 出处 | 状态 |
|---|---|---|
| bundle 声明 `dsh.bundle.patch`，patch 形如 `- insert: [{ id, name }]` | `references/host-plugin.md:7-27` | ✅ |
| Host-only bundle 无需依赖 / 安装脚本 / 构建工具 | `references/host-plugin.md:7` | ✅ 零依赖、无构建 |
| `index.js` 导出 `apply(ctx, config)`（+ 可选 `inject` / `Config`），不得混用导出形态 | `references/host-plugin.md:49-52` | ✅ |
| 资源注册走 `ctx.effect` / `ctx.on` 并返回清理 | `references/host-plugin.md:54` | ✅ |
| 客户端 `exports["./client"]` + `dsh.client.platform` | `references/ui-plugin.md:3`；`dsh-client-modules/lib/index.js:170,719` | ✅ |
| `dsh.client.inject` 要为「提供所注册 slot 的包」 | `templates/decoration/package.json`；官方 chat/schedule/settings-account/shortcuts 四包一致 | ✅ 2026-10 修复（原为空数组） |
| 展示元数据：`locale/en.json` 的 `meta.title/description`、顶层 `icon` | `references/host-plugin.md:29-45`；`dsh-app-boot/lib/index.js` `readPluginMeta` | ⏸ 延期 |
| 不 import Harness 客户端包（如 `dsh-client-ui-primitives`） | `SKILL.md:21` | ✅ 未 import |
| 不替换 app root、不向 `document.body` 追加第二个应用 | `references/ui-plugin.md:13` | ✅ 仅注册 `shell.overlay` 一个 slot |

## 3. 已完成（可标准安装）

- [x] **三条 spec 全部可用**：npm 包名 / `github:SHADOW-LI0327/dsh-process-kit` / 本地绝对路径
- [x] `peerDependencies: { "@deepseek-ai/dsh": ">=0.1.7-rc.2 <0.3.0" }`——让 DSH 兼容门禁能拦住不兼容宿主
- [x] 去掉 `private`，补 `publishConfig.access`，具备 `npm publish` 条件
- [x] `files` 白名单（`npm pack` 此前会把 `test/**` 打进包里）
- [x] `repository` / `homepage` / `bugs` / `keywords` / `engines` / `author`
- [x] 修 `dsh.client.inject`
- [x] CI（`npm test` × node 22.19 / 24 + `npm pack` 内容核对）

## 4. 延期项（社区规范，非官方要求）

| 项 | 要求 | 出处 | 为什么延期 |
|---|---|---|---|
| `locale/en.json` + `locale/zh.json` | `meta.title` / `meta.description` | 官方功能（`readPluginMeta`），但属可选展示 | 不做只是插件管理器卡片显示原始包名与默认图，不影响功能 |
| `icon.svg` | 顶层 `icon`，SVG/PNG/JPEG/WebP ≤256 KiB，须在包目录内 | 同上 | 同上；需要先有一个图标资产 |
| `engines.node` | — | 社区 guide §8 | **已做**（`^22.19.0 \|\| >=24.0.0`） |
| `packageManager` | 钉 `pnpm@11.7.0` | 社区 guide §8 | 本仓库零依赖、无 lockfile，钉版本只增加 corepack 摩擦 |
| 五语 README | `README-zh/es/pt/hi.md` | 社区 guide §8 | 作者个人规范，非社区共识；维持中英一份足够 |
| `dsh.catalog` | 目录分类元数据 | `dsh-plugin-shop` schema | 只有 shop 用；不含时回落到 npm `description` |
| GitHub topic `dsh-plugin` | 仓库设置项 | `dsh-plugin.org` / shop 发现机制 | 建仓库后在 Settings 里点一下即可，无需改代码 |
| Issue / PR 模板、`SECURITY.md` | — | 通用开源惯例 | 当前无外部贡献者前不必备 |

## 5. 社区检查器现状

用 `dsh-plugin-guide` 的 `dsh-plugin-dev check` 可离线自查（该包是第三方，非官方）：

```bash
npm pack dsh-plugin-guide && tar -xzf dsh-plugin-guide-*.tgz
node package/dist/dsh-plugin-dev.js check --cwd .
```

修复前：`FAILED (6 passed, 1 failed, 4 warned, 5 skipped)`（唯一 error 是缺 `engines.node`）。

修复后：`OK (8 passed, 0 failed, 3 warned, 5 skipped)`。剩余 3 条 warning 即上表延期项（`packageManager`、`display-meta`、`readme-five-langs`），已刻意不处理。

## 6. 什么时候值得做延期项

满足任一条件再投入：

1. 插件管理器里显示的原始包名造成过真实困惑（→ 做 `locale` + `icon`，约半小时）；
2. 出现外部使用者并主动提问（→ 补 CONTRIBUTING 之外的贡献流程）；
3. 需要被 `dsh-plugin-shop` 之类的目录按分类索引（→ 评估 `dsh.catalog`）。

在那之前，判断这个插件有没有价值的**唯一**依据是：有没有人真的在自己的仓库里落地 `docs/process/**` 这套约定。
