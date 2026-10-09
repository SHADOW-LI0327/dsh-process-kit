# AGENTS.md

本文件为 AI Agent 在此仓库中工作时的指导说明。

> **维护原则**：本文件持续参与每次对话上下文，只保留必须时刻遵守的**规范**与高频入口；操作手册、设计文档、部署/测试指南一律放 `docs/`，此处只留链接。

## 开发流程（docs/process，强制）

**功能开发必须走 [`docs/process`](docs/process/README.md) 流程，禁止绕过流程直接改源码。**

- **唯一真源**：[`docs/process/README.md`](docs/process/README.md)（总纲 + 续跑锚点）。**流程分级 · 状态续跑 · Gate 必停与摘要格式 · 产物属主 · subagent 复用 · journal · git 纪律 · 命令集一律以该文件为准。**
- **项目适配**：[`docs/process/PROJECT.md`](docs/process/PROJECT.md)（端与目录 / 命令槽 / 产物属主表 / 脚本配置 / 凭据 / 通知）。**一切项目专属信息只从那里读。**
- **调度手册**：[`docs/process/orchestrator.md`](docs/process/orchestrator.md)（与总纲冲突时以总纲为准）。
- **本文件不复述流程细则**——复述只会产生过期副本。

**常驻动作**：每轮唤醒先调 `process_status` 取状态机快照与下一步动作（不靠聊天历史）；对人的输出用两段式（✅ 完成了什么 / ❓ 还需要裁定什么）；journal 只追加不覆写（用 `process_journal`）。

**角色**：由 `dsh-process-kit` 插件自带同名技能提供——`product-manager` · `ui-designer` · `test-agent` · `dev-agent` · `uat-agent` · `code-review-agent` · `security-review-agent` · `logic-review-agent`。派单时让 subagent 读对应技能，不要在本文件里复述角色职责。

---

## 项目概览

<一句话说明这个项目是什么、由哪几个模块/端组成。>

## 快速命令

```bash
<安装依赖>
<启动 / 构建>
<快速验证>        # 与 PROJECT.md §2 命令槽保持一致
```

## 目录结构

```
<顶层目录一览，每个目录一句话>
```

---

<!-- 以下按需保留：技术栈规范、API 规范、数据库规范、前端规范、测试方式、部署与发布等。
     原则同上：只留「必须时刻遵守」的规范与高频入口，细则放 docs/ 并在此留链接。 -->
