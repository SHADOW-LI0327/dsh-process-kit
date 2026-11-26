# 协作 Hub（通过 MCP，不在插件内）

`dsh-process-kit` **不自带 Hub HTTP 客户端**。Hub 是独立项目，通过 MCP 接入 DSH；插件只负责流程与 Gate，不复制 Hub 的接口。

## 1. 在 DSH 里接入 Hub MCP

推荐用 Hub 的 Streamable HTTP 端点：

```yaml
- id: mcp-collab
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: collab
    transport: streamable-http
    url: http://<server>:8787/mcp
    headers:
      Authorization: 'Bearer ${credential:COLLAB_TOKEN}'
    toolCallTimeoutMs: 60000
```

也可以继续用 stdio：

```yaml
- id: mcp-collab
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: collab
    transport: stdio
    command: node
    args: ['/path/to/dsh-collab-hub/mcp/server.mjs']
    env:
      COLLAB_HUB_URL: http://<server>:8787
      COLLAB_TOKEN: '${credential:COLLAB_TOKEN}'
```

工具名形如：

```text
mcp__collab__collab_context
mcp__collab__collab_publish
mcp__collab__collab_status
mcp__collab__collab_question
mcp__collab__collab_answer
mcp__collab__collab_handoff
```

具体工具以 Hub 的 `/api` 目录或 MCP `tools/list` 为准；Hub 升级不需要改本插件。

## 2. Agent 的日常动作

| 时机 | Hub MCP 工具 |
|---|---|
| 开工 | `collab_context`（对方状态、未决问题、最新产物）；团队总览看 Hub Web |
| 更新状态 | `collab_status(state, focus, blocker)` |
| 发布设计 | `collab_publish(path, kind, summary)` |
| 有分歧 | `collab_question(text)` |
| 回答 | `collab_answer(question, text)` |
| 收工 / 换人 | `collab_handoff(note)` |

产物是只追加版本；不要覆盖对方的文件。Hub 的 Web 看板只读，写操作都走 MCP / CLI。

## 3. Gate 前置依赖

需求核对件仍可声明：

```yaml
dependsOn: shop/FEAT-002@contract, shop/FEAT-003@done
```

- `process_status` / `gate_summary` 只读本地文件，显示这份清单，不联网；
- Gate 前，主控用 Hub MCP 的 `collab_context` 逐个读取前置 feature；
- `READY` / `BLOCKED` / `UNKNOWN` 只是证据，**不自动放行**；UNKNOWN 不得说成 ready；
- 最终仍由人签。

## 4. 归档 / 删除

- Hub 支持项目 / feature 的 **归档 / 恢复**（`collab project archive` / MCP `collab_project_archive`）；
- 没有硬删除；归档后 feature 只读，数据保留；
- 归档操作在 Hub CLI / MCP 完成，不在本插件里。

## 5. 相关项目

- Hub 服务：[dsh-collab-hub](https://github.com/SHADOW-LI0327/dsh-collab-hub)
- API 目录：`GET /api`；OpenAPI：`GET /api/openapi.json`；MCP：`POST /mcp`
- 本插件只维护 `process_*` 工具和 `dependsOn` 元数据，不维护 Hub 接口副本。
