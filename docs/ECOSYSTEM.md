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
| 客户端 `exports["./client"]` + `dsh.client.platform`、`dsh.client.inject` | `references/ui-plugin.md:3`；`dsh-client-modules/lib/index.js:170,719` | — **不适用**：页面部分已移除，本插件是纯服务端 bundle |
| 展示元数据：`locale/en.json` 的 `meta.title/description`、顶层 `icon` | `references/host-plugin.md:29-45`；`dsh-app-boot/lib/index.js` `readPluginMeta` | ⏸ 延期 |
| 不 import Harness 客户端包（如 `dsh-client-ui-primitives`） | `SKILL.md:21` | ✅ 无客户端代码 |
| 不替换 app root、不向 `document.body` 追加第二个应用 | `references/ui-plugin.md:13` | ✅ 无客户端代码 |

## 3. 已完成（可标准安装）

- [x] **三条 spec 全部可用**：npm 包名 / `github:SHADOW-LI0327/dsh-process-kit` / 本地绝对路径
- [x] `peerDependencies: { "@deepseek-ai/dsh": ">=0.1.7-rc.2 <0.3.0" }`——让 DSH 兼容门禁能拦住不兼容宿主
- [x] 去掉 `private`，补 `publishConfig.access`，具备 `npm publish` 条件
- [x] `files` 白名单（`npm pack` 此前会把 `test/**` 打进包里）
- [x] `repository` / `homepage` / `bugs` / `keywords` / `engines` / `author`
- [x] 移除页面部分（0.4.0 起）：不再有 `exports["./client"]`、`dsh.client` 与 `GET /process-kit` 路由
- [x] CI（`npm test` × node 22.19 / 24 + `npm pack` 内容核对）

## 4. 延期项（社区规范，非官方要求）

| 项 | 要求 | 出处 | 为什么延期 |
|---|---|---|---|
| `locale/en.json` + `locale/zh.json` | `meta.title` / `meta.description` | 官方功能（`readPluginMeta`），但属可选展示 | 不做只是插件管理器卡片显示原始包名与默认图，不影响功能 |
| `icon.svg` | 顶层 `icon`，SVG/PNG/JPEG/WebP ≤256 KiB，须在包目录内 | 同上 | 同上；需要先有一个图标资产 |
| `engines.node` | — | 社区 guide §8 | **已做**（`^22.19.0 \|\| >=24.0.0`） |
| `packageManager` | 钉 `pnpm@11.7.0` | 社区 guide §8 | 本仓库零依赖、无 lockfile，钉版本只增加 corepack 摩擦 |
| 五语 README | `README-zh/es/pt/hi.md` | 社区 guide §8 | 作者个人规范，非社区共识；维持中英一份足够 |
| `dsh.catalog` | 目录分类元数据 | `dsh-plugin-shop` schema | **已做**（2026-10-15 改判）：schema 从公开索引观察到（`catalog.category` / `catalog.summary.<lang>` / `catalog.capabilities`），shop 会为已收录包**派生**（本包 `metadata: "derived"`）—— 但派生结果把我们的**中文** description 塞进了 `summary.en` 槽、`capabilities` 为空。现已在 `package.json` 显式声明，见 §7 |
| ~~GitHub topic `dsh-plugin`~~ | 仓库设置项 | `dsh-plugin.org` / shop 发现机制 | **已移出延期项** ⇒ 它是零成本待办，见 §7 |
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
3. 需要被 `dsh-plugin-shop` 之类的目录按分类索引（→ schema 已核实、`dsh.catalog` 已声明，见 §7）。

在那之前，判断这个插件有没有价值的**唯一**依据是：有没有人真的在自己的仓库里落地 `docs/process/**` 这套约定。

---

## 7. 上架清单（零成本曝光 · 需人操作）

**本节全部是「点一下 / 提一个 Issue」量级，不含代码改动。** 写在这里是因为它们需要**仓库所有者身份**（GitHub 设置或第三方 Issue），AI 侧无法代办（本机无 `gh`、无 token；即便有也不该替人改公开仓库设置）。

**先确认前提（已具备）**：`package.json` 的 `keywords` 含 `dsh-plugin` 与 `deepseek-harness` —— `dsh-plugin-shop` 靠这两个词**自动收录，无需申请**（§1）。所以下面第 1 项之外都只是「加分项」，不做也不影响被收录。

| # | 动作 | 具体怎么做 | 影响 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | **打 GitHub topic** | 仓库页 → 右上 About 齿轮 → Topics 填 `dsh-plugin`（可再加 `deepseek-harness`、`cordis`）→ 保存 | `dsh-plugin.org` 与 shop 的发现机制都读它；这是**唯一**必须手动做的一步 | ✅ **已完成**（2026-10-14 实测 `GET /repos/SHADOW-LI0327/dsh-process-kit` 返回 `topics: ["deepseek-harness","dsh","dsh-plugin"]`） |
| 2 | 提交 `dsh-plugin.org` | 按该站 Issue 模板提一条（仓库地址 + 一句话说明） | 多一个目录曝光面；该站自报插件总数自相矛盾（§1），背书价值有限 | ⏳ 待人 |
| 3 | `dsh.catalog` | **改判为要做**（2026-10-15）：派生结果把中文 description 填进 `summary.en`、`capabilities` 为空；索引 14843 个插件里只有 **16** 个填了 `zh` 摘要，而 `dsh-plugin.org` 的「Workflow & Automation」分类池只有 **394** 个（全站 13954）—— 值得显式声明 | 无 | ✅ **已声明**（2026-10-15） |
| 4 | `locale/en.json` + `icon.svg` | 见 §4 | 只影响插件管理器卡片观感 | ⏸ 延期（§6 条件 1） |

> **第 1 项为什么单独强调**：它是「加入生态」的**全部实际含义**（§1 的结论 —— 公开仓库 + 一个 topic）。其余都是展示层打磨。

**清单完成的标准**：仓库页 Topics 里出现 `dsh-plugin`，且 `dsh-plugin-shop` 能搜到本包。**两项均已达成**（2026-10-14）：topics 见上表；shop 索引 `count 14843` 中已有本包条目 `dsh-process-kit`（`catalog.category: "workflow"`，`source: "npm"`）。剩下的第 2、4 项是可选曝光面，不做也不影响被收录。
