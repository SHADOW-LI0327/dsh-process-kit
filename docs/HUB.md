# 协作 Hub（可选）

多个成员各自在本地跑 DSH 时，`docs/process/**` 只在各自仓库里；A 的设计、B 的当前状态，对方的 Agent 看不到。Hub 是补这一层的：

- **仓库里**：`docs/process` / journal / Gate 仍是本仓库的真源；
- **Hub 里**：跨仓库的 feature 上下文——成员状态、设计产物索引、未决问题、变更流；
- **Agent**：通过 `hub_*` 工具读写 Hub；服务器不跑 Agent、不碰代码。

## 1. 服务器启动 Hub

```bash
cd dsh-collab-hub
node bin/collab.mjs hub --host 0.0.0.0 --port 8787 --data ./data
```

打开 `http://<server>:8787` 可以看板注册、建项目、上传设计、回答问题。

## 2. 每个成员注册

```bash
node bin/collab.mjs register --name A --role frontend --hub http://<server>:8787
```

token 存在 `~/.dsh/collab.json`（0600）；`dsh-process-kit` 也读这个文件。没有 token 时 `hub_*` 工具会返回提示，不会静默失败。

## 3. 建项目 / feature

```bash
node bin/collab.mjs project create shop --name "电商平台" --repos web,api
node bin/collab.mjs feature create shop FEAT-001 --title "退款流程" --brief "全额/部分退款"
```

- **项目**：产品级容器，可以包含前端 / 后端多个 repo；
- **feature**：双方共享的工作单元，`FEAT-001` 是两边对齐的句柄。

## 4. 仓库绑定一次

在 DSH 里：

```text
hub_link(project="shop", feature="FEAT-001")
```

会写 `docs/process/.hub.json`：

```json
{ "projectId": "shop", "featureId": "FEAT-001" }
```

这个文件**不含 token**，可以提交；每个仓库只绑一次。之后 `hub_*` 工具默认使用它，不必每次传 feature。

## 5. Agent 的日常动作

| 时机 | 工具 |
|---|---|
| 开工 | `hub_context`（看对方状态、未决问题、最新产物）；团队总览用 `hub_board`；不确定连接时先 `hub_health` |
| 更新状态 | `hub_status(state, focus, blocker)` |
| 发布设计 | `hub_publish(path, kind, summary)`，摘要必填 |
| 有分歧 | `hub_question(text)`，不要自己猜 |
| 回答 | `hub_answer(question, text)` |
| 收工 / 换人 | `hub_handoff(note)` |
| 中途看变化 | `hub_context(since=cursor)` |

产物是**只追加版本**：不要覆盖对方的文件，发新版本并说明变化。Agent 默认只读摘要；需要细节再打开原文件。

## 6. 失败与边界

- Hub 没启动 / token 无效：`hub_*` 报错并提示检查 `~/.dsh/collab.json`；`process_status` 等原有工具不受影响。
- 没有配置 Hub：本插件行为与之前完全一致；不会联网，也不会因为 Hub 不可用阻塞流程。
- Hub 只做上下文，不替代 Gate 人签；`via: human` 仍然只在 `docs/process` 的 journal 里。
- HTML 产物以 sandbox 方式打开；不要把带密钥的页面传到 Hub。
- 内网 HTTP 没有 TLS；跨网段/公网请加反向代理和 TLS，并限制上传大小。

## 7. 相关工具

- Hub 服务：`dsh-collab-hub`（本仓库外独立项目）；
- MCP：`collab-mcp`（给 Claude / Codex / 其他 MCP 客户端）；
- DSH：本插件的 `hub_*` 工具（0.12.0 起）。

完整 API / 数据模型见 Hub 项目 README。
