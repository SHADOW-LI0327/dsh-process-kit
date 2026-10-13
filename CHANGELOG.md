# Changelog

本插件自身的变更日志。按 GitHub 风格简要记录功能与行为变更，只记变更本身、不记开发过程。

## 0.3.0

### Changed

- `ui-designer` 技能固定工具优先级：PhotoCraft CLI > Adobe Photoshop > 其它；Photoshop 出图时几何要自己导，证据必须标注「手工导出、未经重导验证」。
- UI 几何门禁：产物里 0 个文字层（文字被栅格化）时，重叠 / 过挤 / 对比度三项改判 ⚠ 并说明原因，不再打 ✓。
- `scaffold/PROJECT.md` §3 示例行：journal 的通配补上 `.meta.json` 旁挂文件，避免框架自己生成的 audit 文件被落点门禁判越界。

## 0.2.0

### Added

- 第 8 个角色 **`ui-designer`**：把《设计与说明》里触及 UI 的条目翻译成可验收的 UI 规格（组件判定 + 交互状态矩阵 + 文案定稿），随 Gate1 送审、不新增停点；由人在 Gate0 用核对件 `uiDesign` 显式决定是否派单。
- 新门禁 **`check-ui-geometry`**：溯源 / 溢出 / 重叠 / 过挤 / 居中 / 边距 / 网格 / 对比度 / `--verify` 深验证 / 项目令牌一致性。几何 `bounds` 只能由适配器导出，居中与内容带等意图写在 `intent.json`；支持一包多屏。
- **UI 通用默认层** `scaffold/ui/tokens.md` 与 `scaffold/ui/recipe.md`（桌面 + 移动端骨架与配方）；`PROJECT.md` §4 可登记项目令牌，**项目优先、不得与默认层混用**。
- 交付物形态：原型图（位图）+ 分层源 + UI 规格，不走 HTML 原型；视觉数值必须给字面值。
- `process_status` 增加 `🎨UI 设计` 标记、`uiDesign` / `artifacts.uiSpec` 返回与 UI 一致性警告。
- 新模板 `scaffold/prd/_UI_SPEC_TEMPLATE.md`（含技术与手段、原型图与视觉数值两节）。

### Fixed

- 门禁溯源从「声明」变成「验证」：新增机器可验的 `artifact` 字段与 `--verify` 重导逐元素比对。
- 新增 ⑧ 对比度门禁（WCAG，从产物合成像素采样）；「文字完全不可见」不再静默跳过。
- 新增 ⑩ 项目令牌一致性；修 α 叠加白名单未生成、修从子目录运行静默降级。
- 修 ⑧ 逐像素复核未生效、`--from-photocraft` 静默丢作者意图、`PROJECT.md` §4 的 UI 配置键被静默忽略。
- 修落点门禁：中文命名的产物被误判越界、`ui/tokens.md` 与 `ui/recipe.md` 未登记在属主表。
- 门禁输出不再被超长命令行刷屏；补三处健壮性上限（`process_init` 的 `scriptsDir`、⑧ 逐像素点数、⑩ 令牌源规模）。

## 0.1.0 — 首个通用版

### Added

- 四个工具：`process_status`、`gate_summary`、`process_journal`、`process_init`。
- 7 个角色技能打包进插件（bundled 档注册，项目 `.dsh/skills/**` 可覆盖，默认在所有工作区广播）。
- 流程骨架 `scaffold/`（总纲、调度手册、`PROJECT.md` 槽位与模板）与 `AGENTS.md` 项目级常驻指针。
- 零依赖门禁脚本 `scripts/*.mjs`，以及右下角的流程看板。
- 三条安装通道：npm 包名 / `github:` / 本地绝对路径；补 `peerDependencies` 兼容门禁与 `files` 白名单。

### Fixed

- 模板示例值被当成真配置（§3 示例行、登记区示例、§4 取值列），会让未配置的项目得到假绿；改为占位行 / 占位符，示例移入不参与解析的代码块。
- 新增 `scripts/project-config.mjs` 统一解析口径：含 `<`/`>` 的值一律视为未配置，围栏代码块不参与解析。
- 修 `dsh.client.inject` 漏声明 layout（页面部分注册进 `shell.overlay`）。
