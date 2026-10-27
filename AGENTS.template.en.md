# AGENTS.md

Guidance for AI agents working in this repository.

> **Maintenance rule**: this file is part of every conversation's context, so keep only the **rules that must always hold** plus the high-traffic entry points. Runbooks, design docs and deployment/test guides belong in `docs/` — link them here.

## Development process (docs/process, mandatory)

**Feature work MUST go through the [`docs/process`](docs/process/README.md) flow; never bypass it and edit source code directly.**

- **Single source of truth**: [`docs/process/README.md`](docs/process/README.md) (master document + resume anchor). **Process tiers · status resumption · mandatory Gates and summary format · artifact ownership · subagent reuse · journal · git discipline · command slots — that file wins on all of it.**
- **Project adaptation**: [`docs/process/PROJECT.md`](docs/process/PROJECT.md) (clients and directories / command slots / artifact ownership table / script config / credentials / parallel-session coordination board). **Every project-specific fact is read from there.**
- **Dispatch handbook**: [`docs/process/orchestrator.md`](docs/process/orchestrator.md) (the master document wins on conflict).
- **This file does not restate process details** — restating only creates stale copies.

**Standing actions**: on every wake-up call `process_status` for the state-machine snapshot and the next action (never rely on chat history); talk to the human in the two-part format (✅ what was done / ❓ what still needs a decision); the journal is append-only (use `process_journal`).

**Roles**: provided by the same-named skills bundled with the `dsh-process-kit` plugin — `product-manager` · `architect` · `ui-designer` · `test-agent` · `dev-agent` · `uat-agent` · `code-review-agent` · `security-review-agent` · `logic-review-agent`. When dispatching, have the subagent read the matching skill; do not restate role duties here.

**Want to stop using the process**: call `process_uninstall` after the human confirms (first `{ dryRun: true }` to preview, then `{ confirm: true, dryRun: false }`); it removes `docs/process` and `scripts/process` and leaves a customized `AGENTS.md`, user skills and product code alone. See "Uninstall" in the plugin README.

---

## Project overview

<One sentence: what this project is and which modules/clients it consists of.>

## Quick commands

```bash
<install dependencies>
<start / build>
<fast verification>   # keep in sync with the command slots in PROJECT.md §2
```

## Directory layout

```
<top-level directories, one line each>
```

---

<!-- Keep the sections you need below: stack conventions, API conventions, database conventions, frontend conventions, testing, deployment and release. Same principle: only rules that must always hold plus high-traffic entry points; details go in docs/ with a link here. -->
