# Collaboration Hub (via MCP, outside the plugin)

`dsh-process-kit` does **not** ship a Hub HTTP client. The Hub is a separate project and is connected through MCP; this plugin only owns the process and its Gates.

## 1. Connect the Hub MCP server in DSH

The recommended transport is the Hub's Streamable HTTP endpoint:

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

The stdio server is still available:

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

Tools appear as:

```text
mcp__collab__collab_context
mcp__collab__collab_publish
mcp__collab__collab_status
mcp__collab__collab_question
mcp__collab__collab_answer
mcp__collab__collab_handoff
```

The Hub's `/api` catalog or MCP `tools/list` is the source of truth; a Hub upgrade does not require a plugin change.

## 2. What the agent does

| Moment | Hub MCP tool |
|---|---|
| Start | `collab_context` (other side's status, open questions, latest artifacts); team overview in the Hub Web |
| Progress | `collab_status(state, focus, blocker)` |
| Publish | `collab_publish(path, kind, summary)` |
| Disagreement | `collab_question(text)` |
| Answer | `collab_answer(question, text)` |
| Stop / handoff | `collab_handoff(note)` |

Artifacts are append-only versions; never overwrite the other side's file. The Hub web board is read-only; writes go through MCP / CLI.

## 3. Gate dependencies

A requirement check may still declare:

```yaml
dependsOn: shop/FEAT-002@contract, shop/FEAT-003@done
```

- `process_status` / `gate_summary` show this local list without network access;
- before a Gate, the orchestrator reads each prerequisite feature with the Hub MCP `collab_context`;
- `READY` / `BLOCKED` / `UNKNOWN` is evidence only; it never auto-passes the Gate, and UNKNOWN is not ready;
- the human still signs.

## 4. Archive / delete

- The Hub supports project / feature **archive / restore** (`collab project archive` / MCP `collab_project_archive`);
- there is no hard delete; archived features are read-only and keep their data;
- archive operations live in the Hub CLI / MCP, not in this plugin.

## 5. Related projects

- Hub service: [dsh-collab-hub](https://github.com/SHADOW-LI0327/dsh-collab-hub)
- API catalog: `GET /api`; OpenAPI: `GET /api/openapi.json`; MCP: `POST /mcp`
- This plugin owns only `process_*` tools and `dependsOn` metadata; it does not keep a copy of the Hub API.
