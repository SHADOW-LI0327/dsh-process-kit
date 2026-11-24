# Collaboration Hub (optional)

When every member runs DSH locally, `docs/process/**` only exists in each repository; A's design and B's current state are invisible to the other side's agent. The Hub adds exactly that layer:

- **Repository**: `docs/process`, journal and Gates remain that repository's truth.
- **Hub**: cross-repository feature context — member status, design artifact index, open questions, change feed.
- **Agent**: reads and writes the Hub through `hub_*` tools; the server runs no agent and never touches code.

## 1. Start the Hub on the server

```bash
cd dsh-collab-hub
node bin/collab.mjs hub --host 0.0.0.0 --port 8787 --data ./data
```

Open `http://<server>:8787` to register, create projects, upload designs and answer questions.

## 2. Register each member

```bash
node bin/collab.mjs register --name A --role frontend --hub http://<server>:8787
```

The token is stored in `~/.dsh/collab.json` (0600); `dsh-process-kit` reads the same file. Without a token the `hub_*` tools fail with a clear message.

## 3. Create a project and a feature

```bash
node bin/collab.mjs project create shop --name "Shop" --repos web,api
node bin/collab.mjs feature create shop FEAT-001 --title "Refund" --brief "full/partial refund"
```

- **Project**: product-level container; it may include frontend and backend repositories.
- **Feature**: the shared unit of work; `FEAT-001` is the handle both sides use.

## 4. Bind the repository once

In DSH:

```text
hub_link(project="shop", feature="FEAT-001")
```

This writes `docs/process/.hub.json`:

```json
{ "projectId": "shop", "featureId": "FEAT-001" }
```

The file contains **no token** and can be committed. Bind once per repository; `hub_*` tools then default to it.

## 5. What the agent does

| Moment | Tool |
|---|---|
| Start | `hub_context` (other side's status, open questions, latest artifacts); `hub_board` for the team view; `hub_health` if unsure the Hub is up |
| Progress | `hub_status(state, focus, blocker)` |
| Publish | `hub_publish(path, kind, summary)` — summary required |
| Disagreement | `hub_question(text)` — do not guess |
| Answer | `hub_answer(question, text)` |
| Stop / handoff | `hub_handoff(note)` |
| Check changes | `hub_context(since=cursor)` |

Artifacts are **append-only versions**: never overwrite the other side's file; publish a new version and explain the change. Agents read summaries by default and open the original only when needed.

## 6. Failure and boundaries

- Hub down / token invalid: `hub_*` fails with a message pointing at `~/.dsh/collab.json`; `process_status` and the rest of the process are unaffected.
- No Hub config: the plugin behaves exactly as before; no network calls, no blocking.
- The Hub is a context layer, not a Gate signer; `via: human` still lives only in `docs/process` journal.
- HTML artifacts open in a sandbox; do not upload pages containing secrets.
- Intranet HTTP has no TLS; add a reverse proxy with TLS before crossing networks, and limit upload size.

## 7. Related pieces

- Hub service: `dsh-collab-hub` (a separate project);
- MCP: `collab-mcp` for Claude / Codex / other MCP clients;
- DSH: this plugin's `hub_*` tools (0.12.0+).

See the Hub project README for the full API and data model.
