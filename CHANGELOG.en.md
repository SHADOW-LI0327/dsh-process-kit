# Changelog

This file answers two things: **what changed and what you will notice**. Each release starts with an overview, then lists the actual changes; internal implementation details stay out.

## 0.13.0

**Overview**: the Hub is now reached through MCP; the plugin no longer embeds a Hub HTTP client.

### Changed

- **Removed the embedded Hub client**: `lib/hub.mjs`, 13 `hub_*` tools, the `/process-kit/hub` board route and the Hub card are gone.
- **Hub via MCP**: after configuring the Hub MCP server in DSH (Streamable HTTP `POST /mcp` or stdio), agents use `mcp__collab__collab_*` for status, artifacts and questions; Hub upgrades no longer require a plugin change.
- **Gate dependencies remain**: `dependsOn` is still declared in the requirement check and surfaced by `process_status` / `gate_summary`; before a Gate the orchestrator uses the MCP `collab_context` to read prerequisite features. READY / BLOCKED / UNKNOWN is evidence only; the human still signs.

### Compatibility

- This is a breaking change from the published `0.12.0`: the `hub_*` tools no longer exist and are replaced by Hub MCP.
- The `process_*` tools, journal, Gates and the main board flow are unaffected.

## 0.12.0

**Overview**: adds Collaboration Hub support so multiple local agents share one feature's context.

### Added

- **Thirteen `hub_*` tools**: `hub_context` / `hub_board` / `hub_status` / `hub_publish` / `hub_question` / `hub_answer` / `hub_handoff` / `hub_link` / `hub_health` / `hub_project_create` / `hub_feature_create` / `hub_gate_check` / `hub_config`.
- **Repository binding**: `hub_link(project, feature)` writes `docs/process/.hub.json` (project/feature only, no token); `hub_feature_create` binds by default.
- **Hub card on the board**: the Dev-process board shows member status, open questions, latest artifacts and team features; an unreachable Hub is only a warning and never blocks the main flow.
- **Gate dependencies**: the requirement check may declare `dependsOn: shop/FEAT-002@contract` (comma-separated); `process_status` / `gate_summary` surface the list, and `hub_gate_check` reads the Hub before a Gate to report READY / BLOCKED / UNKNOWN. It is evidence only; the human still signs.
- **Member config**: reads `~/.dsh/collab.json` (hubUrl + token + name); `COLLAB_HUB_URL` / `COLLAB_TOKEN` also work.
- **Configurable Hub URL**: `hub_config(hubUrl="http://server:8787")` writes the local config; `hub_link(..., hubUrl=...)` commits the server URL in `docs/process/.hub.json` for the team. Priority: `COLLAB_HUB_URL` > `.hub.json` > `~/.dsh/collab.json`.
- **Working habit**: `hub_context` before starting, `hub_publish` + `hub_status` after a milestone, `hub_question` for disagreements, `hub_handoff` before stopping; call `hub_health` (non-blocking) when unsure whether the Hub is up; create a missing project/feature with `hub_project_create` + `hub_feature_create`.

### Compatibility

- Without Hub config, the existing `process_*` tools and board behave exactly as before and make no network calls.
- The Hub is only a cross-repository context layer; each repository's `docs/process` and journal remain the truth, and human Gate signatures still live in the journal.

## 0.11.0

**Overview**: adds "managed mode" and a dev-process board.

### Added

- **Simple work can enable managed mode**: after you confirm the goal at the first checkpoint (requirement), design and tests no longer stop for you; only acceptance stops once.
- **Complex work stays step-by-step**: requirement, design, tests and acceptance all stop — for larger or ambiguous changes.
- **See the process in the conversation**: a "Dev process" tab next to "Trajectory" shows the package's execution and artifacts.
- **Key documents open in place**: the requirement check, PRD, design, prototype and reports open as read-only text in the panel.
- **Managed is not ignored**: skipped steps are marked "authorized by you at requirement confirmation · not human-signed"; final acceptance still requires human confirmation.

### Compatibility

- Existing repositories and packages need no changes; the full flow and fast path still work.
- To enable managed mode, tell the orchestrator "enable managed mode".

## 0.10.1

**Overview**: before dispatching, ask whether one role is enough.

- The orchestrator asks three questions: can one role finish it? is a professional lens needed? is parallelism needed?
- If one role can finish it, do not split, parallelize or assemble roles just to look complete.
- Dispatch handbook only; the state machine is unchanged.

## 0.10.0

**Overview**: bring in the professional lens the requirement actually needs.

- A 10th role, "domain expert": lawyer, teacher, e-commerce operator, civil, electrical, data centre, HVAC, network, compute, DCIM, and more.
- 11 preset expert briefs, plus ad-hoc briefs; adjacent disciplines can merge into one review.
- Defaults to the owner / in-house perspective; vendor perspective only for external delivery.
- Advice only; no edits, no Gate decisions, no standing in for a licensed professional.

## 0.9.0

**Overview**: the same process runs in both Chinese and English repositories.

- English scaffold, English role skills and English documentation.
- `process_init` accepts `lang`; the language is recorded in the repository.
- Gate output, tool reports and role skills follow the repository language.
- Existing Chinese repositories need no changes.

## 0.8.0

**Overview**: UI design moved from "hand over an image" to "hand over an openable HTML prototype".

- UI deliverables are `index.html` + `styles.css` + `handoff.md`; PNG / PSD are no longer the main deliverable.
- After implementation and before acceptance, a UI restoration check compares the page with the prototype.
- New HTML prototype gate: a missing page, missing UI ids, external links or an incomplete handoff turn red.
- Mock data and demo scripts in the prototype must not be copied into production.

## 0.7.0

**Overview**: if you stop using it, the process can be removed cleanly.

- `process_uninstall`: preview first; delete only after confirmation.
- Backs up first; if the backup fails, nothing is deleted.
- Only deletes files created by init and never modified; your `AGENTS.md`, skills and product code stay.
- An uninstall manifest records what init actually created.

## 0.6.0

**Overview**: an architect joins; dispatching and verification get stricter.

- A 9th role, "architect": technical constraint scan before requirement confirmation, architecture design on demand.
- Product and architecture research can run in parallel; the two sides must converge, and candidates do not enter acceptance criteria directly.
- A dev dispatch needs the full start-up package; missing items mean no dispatch.
- Three verification levels: dev self-test, independent test re-run, full regression; reports must state the level.

## 0.5.0

**Overview**: you can check whether gates ran, who signed, and whether records were altered.

- Gate records must carry the command and the real exit code; "I ran it" is not evidence.
- Approvals must carry the gate and the signer; AI-hosted signatures are marked and cannot pose as human.
- Journal chain fingerprints detect edited middle lines, deletions and reordering.
- Gate summaries always include a "gate evidence for this round" section; no record means "not recorded".
- A machine-readable contract lets CI, scripts and other agents read process state without the plugin.
- An end-to-end acceptance scenario, honestly limited to "the rig runs", not "the Gates work".

## 0.4.0

**Overview**: the process was slimmed to "one person, one session, one package".

- The wave model became single-package serial plus cross-session parallel.
- Gates prefer physical artifacts: an openable page, a runnable command, a real diff.
- Pre-release regression is initiated by the human.
- Archiving is simply a human commit.
- The board was removed and the plugin became server-only; 0.11.0 brought the board back inside the conversation.

## 0.3.0

**Overview**: UI tool priority and geometry gate fixes.

- Clarified the priority order of UI design tools.
- When text is rasterised, the geometry gate warns instead of passing silently.
- Fixed journal side files being misjudged by the artifact write-target gate.

## 0.2.0

**Overview**: the UI designer role and the UI gate arrive.

- An 8th role, "UI designer": translates the design notes into an acceptable UI spec.
- New UI geometry gate: overflow, overlap, spacing, contrast and design-token consistency.
- A generic UI default layer (tokens + layout recipes), with project tokens taking priority.
- The deliverable form at the time was a bitmap prototype; 0.8.0 moved to HTML.

## 0.1.0 — first general release

**Overview**: packaged "solo development plus AI" as an installable process plugin.

- Four tools: read status, render a Gate summary, append to the journal safely, initialise the process.
- Seven role skills bundled with the plugin; a project can override them by name.
- A process scaffold: master doctrine, dispatch handbook, project configuration and templates.
- Zero-dependency gate scripts, plus a process board.
- Three install channels: npm, GitHub and a local path.
- Fixed sample values being treated as real configuration, which produced false green.
