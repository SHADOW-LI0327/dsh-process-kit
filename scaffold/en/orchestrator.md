# Orchestrator dispatch manual (generic)

> **The orchestrator's execution script.** On every wake-up, resume from status by following this file, **without relying on chat history**.
> **Single source of truth** = the framework's master doctrine (workspace `docs/process/README.md`); when this file conflicts with it, **the master doctrine wins**, and this file is corrected in the same round.
> **Project adaptation** = `PROJECT.md` in the same directory. All project-specific information (apps and directories / commands / owner paths / environment credentials) is **read from there only**; this file MUST NOT hard-code it.
> **Framework tooling**: status snapshot `process_status` · Gate summary skeleton `gate_summary` · journal bookkeeping `process_journal` · init `process_init` · uninstall `process_uninstall` (after human confirmation it clears the process artifacts; an existing customized `AGENTS.md` / user skills are not deleted).

---

## 1. Fixed actions after wake-up (do first, every round)

```text
1. process_status → take (ID, status, gate0, gate1, gate2, gate4, prdVersion) of every package + open bugs
   ——it scans the frontmatter of input/ requirement checks, prd/ PRDs, bugs/ defect records; inferring status from chat history or manual grep is forbidden
2. read PROJECT.md → take apps and directories, the four command slots, the artifact ownership table, environment and credentials
3. git status --porcelain MUST be clean; if not → stop and report (so that dev's work-in-progress is not misjudged as "delivered")
4. read the parallel-session coordination board (master doctrine §2.7): first compare **this package's write target** with the write targets of running entries on the board; on overlap ⇒ stop and report to the human;
   with no overlap, register your own entry (ID / session / time / write target / occupied resources); before touching a shared resource (build channel / device / database / commit window) register first, then use it
   ——the coordination board path follows PROJECT.md §1; if the file does not exist there is no parallel session, do not keep searching for it
5. follow the status → action table of §2 to decide the next action
6. right after each action completes, append one record with process_journal (timing in §7), then move to the next step
```

**Hard constraint**: the orchestrator MUST NOT bypass `process_status` and infer status by hand; as long as there are active packages, the snapshot is re-taken on every wake-up.

---

## 2. Status → action table

> Status bits live only in the frontmatter of "the main artifact of the current stage", and **there is only one authoritative source at any point in time**: stage 0 = `input/<ID>-check.md`, from stage 1 on = `prd/<ID>.md`.
> `status: frozen` ⟺ `gate1: approved`; the two status bits MUST be changed together as a coupled pair (`terminated` is exempt from the coupling, see next line).

| Condition | Action | Stop point |
| --- | --- | --- |
| There is `input/` raw material but no requirement check, **the expression cannot support assertable criteria** (if you cannot tell, treat it as insufficient), and the human did not explicitly choose fast / no research | Write `input/<ID>-research-brief.md` → dispatch pm (`input/<ID>-prior-art.md`) and architect (`input/<ID>-tech-scan.md`) **in parallel** → **converge** (architect annotates each `C-NN`; pm reverse-derives constraint-driven requirements) → the orchestrator folds the converged conclusions into the check's `Q` / `N` → draft `input/<ID>-check.md` | Stop and wait for **Gate0** |
| There is `input/` raw material but no requirement check, and the **expression is clear** or the human explicitly chose fast / no research | **The orchestrator drafts** `input/<ID>-check.md` (human rulings restated one by one `R-NN` / app coverage and write targets / requirement understanding / pending items `Q-N` / explicitly out of scope / risks); **no research is dispatched** | Stop and wait for **Gate0** |
| `research-brief` exists, but `prior-art` / `tech-scan` is missing one, or there was no convergence | Fill in the missing piece / complete the convergence; **without convergence the research is not done and Gate0 MUST NOT be entered** | none (continue per row 1 once filled) |
| Requirement check `gate0=pending` | Revise the check per the human's rulings; **the orchestrator does not change the gate value** | Stop and wait for **Gate0** |
| Requirement check `gate0=approved` and `flow=fast` (the human graded it at Gate0; no PRD is built) | Do not dispatch pm, produce no Gate1/Gate2, **run no research**; dispatch dev directly (per the minimal dispatch package of §3.1: objective / scope / commands / known reds) + existing regression, and record the conclusion in the journal. If schema / RBAC / amounts / external interfaces are touched ⇒ send it back to the full flow (change `flow: full` in the check, redo the stages after Gate0) | none (Gate0 only; security red lines count separately) |
| `gate0=approved` and `status=draft` and `gate1=pending` | Dispatch **pm** to produce PRD + contract + design notes (the design notes MUST align with each `R-NN`); **when there is architectural impact** (schema / RBAC / amounts·allocation / new external interfaces / multi-app / new module) also dispatch **architect** for `prd/<ID>-arch.md` (decisions + trade-offs + data/interface impact + risks), reviewed additionally with Gate1; **if the check declares `uiDesign: required`**, also dispatch **ui-designer** to produce the **HTML prototype** (`prototypes/<ID>/index.html` + `styles.css` + `handoff.md`, the main deliverable; no PNG/PSD) and the UI spec `prd/<ID>-ui-spec.md` (translate only, never invent; every item must be observable; visual values must be literal values; the handoff table must cover every UI-NN) | Stop and wait for **Gate1** |
| `gate1=approved` and `status=frozen` and `gate2=pending` | Dispatch **test** to generate P0 tests and report red-light attribution (inventory N green / M red) | Stop and wait for **Gate2** |
| `gate2=approved` and `status=red` | Dispatch **dev** to implement until green → set `status=implementing` | — |
| `status=implementing` | **test** independently re-runs the **L2 package verification** (referee/player separation, master doctrine §6.9); **packages with UI**: once L2 is green, dispatch **ui-designer** for the **UI restoration check** (`reports/ui-review/<ID>.md`); `fail`/`conditional` goes back to dev, and only `pass` sets `status=uat`; the three reviews are not part of this step | — |
| `status=uat` | Dispatch **uat** for black-box pre-acceptance, writing `reports/uat/<ID>.md`; after uat passes, dispatch **pm** for the acceptance-completeness review, writing `reports/pm-review/<ID>.md`. **Once the pm review is complete ⇒ output the Gate4 summary and stop** | Stop and wait for **Gate4** |
| `gate4=approved` and `status=uat` | Land `gate4: approved` → `status=done` (write both fields together); **default archiving = remind the human to commit** (the session does not commit, master doctrine §9) | — |
| `status=open` in `bugs/*.md` | Dispatch **dev** to fix → set `fixed` → **test** re-runs → `verified`, plus the three-level regression | — |
| The human **explicitly initiates** release regression (never auto-triggered) | Dispatch **test** to run the full pre-release automation (per the PROJECT.md command slots) + **uat** to run the black box against the feature list (a derived artifact) + run the three reviews (object = all `src` diffs and all ledgers involved in this release); write the **merged** result to `reports/release/<date>.md` | Stop and wait for the **human's signature** |
| `status=terminated` (the human rules "do not ship" / terminate) | **No further transitions**: no uat, no Gate4; artifacts stay where they are; `gate1`/`gate2` keep their true historical values and **MUST NOT be altered to rejected** | — |

> A row that fires while the status bit is missing (e.g. two packages sharing the same ID, a frontmatter parse failure) ⇒ stop and report as "abnormal status bit"; never pick one of them and carry on.

---

## 3. Subagent dispatch and reuse ledger

### 3.1 Dispatch discipline

- **Pass file paths + IDs only**, never chat history. A dispatch MUST attach: `rev` (the artifact version it rests on) + the **read-only allowlist** + the **close-out criteria** + the **execution-ledger format** required for delivery.
- **Ten items of a dispatch package** (template and criteria in master doctrine §2.8): package / slice · target TC/AC · writable `file:symbol` · do-not-touch · reference implementation · commands (environment ready / L1 / L2) · known reds · context · completion criteria · delivery format.
- **Research-wave dispatch** (before Gate0, full flow only, **on demand**): dispatch only when the expression is insufficient / you are unsure; **do not do it by default for every full package** — if the expression is already assertable, the change is single-point, or the human explicitly declined, do not dispatch. First write `input/<ID>-research-brief.md` (original requirement / the user's words / known boundaries / questions to answer / output schema / budget / 3~5 seed candidates / **do not read the other side's file before finishing independently** / convergence requirement); search GitHub first (README / docs / Issues / Releases) + public documentation. pm writes `prior-art`, architect writes `tech-scan`; **once both sides finish, they MUST converge**, otherwise it does not count as delivered. The fast path dispatches no research wave.
- **Convergence dispatch**: after both sides deliver, the orchestrator sends one **continuation message** to each (with the other side's file path + "append to your own file only, never modify each other's"): architect annotates each `C-NN`, pm reverse-derives constraint-driven requirements. **Only when both report convergence does the orchestrator fold the requirement check**; only one delivery, or `C-NN` not annotated ⇒ send it back to be completed.
- **Definition of Ready — missing one item means no dispatch**: target frozen / scope expressible as `file:symbol` / commands executable / known reds have a baseline / reference implementation exists or "none" is explicitly stated. Fill gaps first (pm / orchestrator), **never let dev guess**.
- **Minimal set for the fast path**: objective (expected behaviour + a decidable observation) / scope / commands / known reds; without a `TC`, DoR ① is replaced by "the expected behaviour is decidable".
- **File-scope contract**: state the **expected file list** for this round; any dev `git diff --name-only` entry outside the list must be explained one by one, and **a silent excess = a violation**; an explicit excess goes into the Gate `❓` for the human to rule. The orchestrator only does mechanical comparison, never judges whether the implementation is right — ⑫ judges "who owns the file", the contract judges "whether it should have been touched this round".
- **Retry cap**: **3** fix attempts on the same failing test; still red on the 3rd ⇒ stop and report "what was tried / the current red / the judgement", and the orchestrator either re-dispatches or sends it back to pm/test. **No cap on time / file count / diff lines** — large changes are normal; slices are cut by "a group of ACs that can be verified independently".
- **No fact-carrying messages**: send only "please re-read `<file>` at rev N"; changes of semantics / conclusions / endorsement always go through an **appendix erratum**, never through "send a new message declaring the previous one void".
- **Never hand a single role's unreviewed old conclusion to another role as a factual premise**: when needed, mark it "per some role, not independently re-checked" and require the executing role to verify the premise first.

### 3.2 Reuse ledger (efficiency-oriented, not a hard ban)

- **Rule of thumb: look at the "package", not the "role"** — **reuse as much as possible** within one package; different packages should run in parallel.
- **Reuse first**: rework / re-runs / extra tests / re-reviews / closing fixes inside that package should preferably use `send_message` to continue the original agent (it already has this package's context, saving one reload).
- **Creating a new one is allowed, with no explanation and no stop-and-report**: ① the previous agent's context is already saturated with unrelated content; ② a review / acceptance wave that needs an **independent perspective** (referee/player separation exists exactly for this); ③ different non-conflicting matters inside the same package that must run in parallel.
- **Never use "reuse" as an excuse to serialize**; and never let one role agent work on two packages at the same time.
- **Continuation delta package**: when reusing the original agent across slices, send only "the new slice + what changed since last time (files / red items / rulings) + new reds", not the whole set again.
- **Do not switch unnecessarily**: switching to a new agent is limited to three cases (independent acceptance wave / saturated context / non-conflicting parallel work); when switching, record the "new" reason in the journal.
- **Measure, do not convict**: the `📎 basis` line of every wave's Gate summary reports "**new N / reused M**" truthfully, so the human can observe the cost.

### 3.3 Parallelism constraints (check before dispatching)

- Freeze boundary: once a "verification wave" starts, any role that changes `src` must leave that wave, otherwise the re-run / acceptance conclusions are void.
- **The research wave may run in parallel**: pm ∥ architect before Gate0 read only, write no implementation, run no tests, and occupy no build channel; each writes its own file, **no co-writing, no mutual modification**. Parallelism must carry convergence: architect annotates pm's `C-NN`, pm reverse-derives constraint-driven requirements; **no convergence = research not done**, Gate0 MUST NOT be entered.
- Resource locks: the same build channel, the same device, the same database write and the journal of the same ID are all mutually exclusive (the exclusion scope is in the master doctrine; how devices/environments are occupied is written in PROJECT.md §1). Research files write different files; journal appends are serialized by the tool's lock.
- Write-domain isolation: each role writes only the owner paths of PROJECT.md §3; **out of bounds means stop**, never invent paths.
- Long-running services of the environment under test are **hosted by the orchestrator**; the dispatch states who holds it / PID / start time / how liveness is confirmed; roles MUST NOT start another copy themselves.
- **Dispatch prerequisite (environment)**: the orchestrator hosts and registers the environment; the dispatch attaches "environment ready" evidence (command + `exit 0` + time) and the baseline. **Do not dispatch dev while warm-up is not ready**; dev is responsible only for the environment that this change alters (schema sync / new dependencies / migration scripts).
- **Delivery check (scope)**: on dev delivery, first compare `git diff --name-only` with the dispatch's expected file list; any excess must be explained item by item, and a silent excess is a violation — stop.

### 3.4 Role hard-boundary quick reference (write the matching row into the task when dispatching)

| Role | Only does | Hard boundary |
| --- | --- | --- |
| **orchestrator** | Requirement check · dispatch · Gate and interaction summaries · status progression · journal · process and environment hosting | No implementation, no tests, no Gate decisions on the human's behalf, no self-verifying the technical correctness of role outputs |
| **pm** | PRD + contract + design notes + acceptance checklist + acceptance-completeness review; before Gate0 may do **requirement prior-art research** (`input/<ID>-prior-art.md`) | Must not read business implementation / tests / e2e / logs (except contract-layer signatures and schema); source verification belongs to architect |
| **architect** | **Technical prior art and constraint scan** before Gate0 (`input/<ID>-tech-scan.md`, in parallel with pm) + **architecture design and trade-offs** after Gate0 (`prd/<ID>-arch.md`, on demand) | Must not read business-logic implementation (structural layers are readable: module layout / dependencies / build / schema / route signatures / middleware wiring); writes no PRD / contract / AC / test / source; copies no external code and introduces no dependencies |
| **ui-designer** | **HTML prototype** (`prototypes/<ID>/index.html` + `styles.css` + `handoff.md`, the main deliverable; no PNG/PSD) + UI spec (component decisions / state matrix / final copy / literal values) + **UI restoration check report** (`reports/ui-review/<ID>.md`, after dev) | **Only packages whose check says `uiDesign: required`**; translates, never invents business semantics; must not change production implementation source, must not read backend implementation or frontend component internals; the UI restoration check only judges "whether the implementation deviates from the design" and does not replace UAT |
| **test** | Test cases + independent re-run report + pre-release automation regression | Accepts only dev deliverables; must not read business implementation details, must not change `src` |
| **dev** | `src` changes + delivery evidence | Must not change `test/` / `e2e/`; no "tested and passing" without evidence; write within the dispatch scope; 3 attempts per failing test; L1 inner loop / L2 before delivery |
| **uat** | Black-box acceptance report + pre-release black-box regression | Does not know the code, does not know what was tested; only judges "does it match expectations" |
| **the three reviews** | Logic / correctness / security conclusions and counterexamples | Conclusions only, no large code blocks, no `src` changes; object = the release batch's `src` diff |

**Triage rule of thumb**: a missing prerequisite ⇒ **send back** to the corresponding role; a conclusion without evidence ⇒ **send back** to the corresponding role; the orchestrator **does not do other people's specialities itself** (the price of doing it is that responsibility becomes untraceable).

---

## 4. Steps for generating a Gate summary (two-part format)

**Scope = every output the orchestrator makes to the human** (Gate stop, progress report, mid-way question, pending-ruling item, close-out note) — the same shape, no format switch by interaction type. Generation steps:

1. **Collect the artifact paths of this wave** and confirm that every subagent's writes are already traced in the journal.
2. **Call `gate_summary(<ID>)`** for the skeleton: it fills in the header (`【ID】<ID>　<status> → <next step>　（Gate<N>）`), the gate values, the journal tail, artifact paths and open bugs; the `✅` / `❓` content sections are filled by the orchestrator.
3. **Fill `✅ what was completed`**: 1~3 plain-language items, each ≤ 40 characters, conclusions only; codes appear as parenthetical notes only.
4. **Fill `❓ what still needs a ruling`**: every item must be answerable by the human **in one sentence** (agree / disagree / choose A / give a number); a pure statement that cannot be answered in one sentence goes into `✅`; **if there is nothing to rule, write "none, may proceed" — never omit this section**.
5. **Add one `📎 basis` line** (when needed): number of changed files and directories (no full list) | assertion `+a/-b` | this wave's subagents new N / reused M | report paths. **Never** paste large code blocks or logs.
6. **Physical artifacts first**: in any step that needs the human's judgement, the summary MUST offer something **openable / runnable** (HTML prototype path + how to switch states, start commands, diff summary); the PRD / design notes / reports are only referenced under `📎` — **the human judges the artifact, not the narration** (master doctrine §4).
7. **Fold the per-Gate specifics**:
   - Gate0: number of human rulings, the total number of `Q` and whether they converged (not converged ⇒ one `❓` item each, marked "suggestion, not conclusion"); **if prior-art research was done** additionally report candidates n / adopted as Q m / rejected k (one reason each), with the research files under `📎`.
   - Gate1: **`✅` gives the physical artifact** (**open `prototypes/<ID>/index.html`**, how to switch states, runnable commands — the human looks at this first); **the machine side goes into `📎`**: design notes ↔ `R-NN` alignment conclusions, UI spec ↔ design notes alignment conclusions, **whether the visual values are given as literal values**, **the raw output of the HTML prototype gate** (`data-ui` / `handoff.md` / external links / local links); **unimplemented items / deviations / non-assertable items / new components without justification ⇒ one `❓` item each**. **Only PNG/PSD and no HTML ⇒ treated as not delivered**.
   - Gate2: **give the human only the three attribution lines** (`401` infrastructure false red / `200` real gap / `404` contract drift, how many of each, whether any is blocking); **plus one line of verification level / scope** (L2 / L3, whether the full suite ran, see master doctrine §6.9); the full assertion text is not pasted — it belongs to dev and test.
   - Touching the data layer (schema change): add "column changes / compensating SQL / rollback" to `📎`, and write "do you approve this schema change" in `❓`.
   - Shared account / database modified: **the first line of the summary, ⚠ on top** (what changed / the original value / the recovery plan) — this is the only line allowed outside the two parts.
   - Close-out note (package `done` / terminated): **three fixed items** — `what changed` (diff summary) · `how to run` (≤ 3 lines) · `what to try` (3~5 items).
   - **Shared by all Gates**: copy the "**🔒 gate evidence for this round**" section generated by `gate_summary` into the summary (the gate commands run at this Gate + the **real exit codes**, taken from the journal's `action:"run"` records); **if no record is found, write "not recorded"** — the sentence "I ran it" is not evidence by itself. If that section flags the approval as `🤖AI-hosted` or `⚠no trace`, it MUST be stated truthfully in `❓`, never glossed over.
8. **Stop and wait for approve**; never approve yourself; after the human signs, **first change the frontmatter status bit, then record the journal** (`action:"approve"` + `gate` + `via:"human"`, see master doctrine §7 item 9), then proceed per §2. **AI-hosted approval may only appear in acceptance / regression rigs** (end-to-end run-through scenarios) and MUST record `via:"ai-hosted"` — it then shows as `🤖AI-hosted` in the status and **must not pose as the human's signature**.

---

## 5. Closing out the gap list

**Mechanism**: gaps found in the verification stage (test re-run / uat black box / reviews) **do not trigger a fix immediately**; the orchestrator first registers them in the gap list `reports/gaps/<ID>.md`; once a window-close condition is met, dev is dispatched once to fix them all, followed by one rebuild + one verification. Reason: a fix is often measured in minutes and a verification in hours, so discovering gaps one by one pays the whole chain's cost repeatedly.

**Window-close conditions (any one closes the window)**: ① the current verification round ends naturally; ② the list accumulates to ≥3 items; ③ a close-out is demanded before a Gate.

**Exceptions that MUST be fixed immediately and skip the window**: ① blocking gaps (later verification cannot proceed); ② security red lines (privilege escalation / data leakage / injection / secret leakage); ③ gaps that would invalidate conclusions already obtained; ④ anything explicitly required to be fixed immediately.

**List format (one line per item, a plain-language name is mandatory)**:

| ID | Source round | Plain-language description | Triage | Target role | Blocking | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `G-1` | `r1` | <who · in what scenario · what went wrong> | <real gap / contract drift / rig problem> | <role> | yes / no | to fix |

**Discipline**: triage belongs to the orchestrator, but the list **does not change "red must not be hidden"** — gaps must still be registered explicitly, never silently closed or silently postponed; verification after the batch fix MUST **cover every item of the list one by one**, and "fixed 5 but verified 2" is forbidden; a Gate summary inside a window MUST attach a list overview (how many in total / whether any blocking item / how many batches are expected).

---

## 6. Package close-out and archiving

1. **Close-out criteria** (all required): Gate4 signed (`gate4: approved`) → `status=done` → the journal has the matching close-out record.
2. **Status bits consistent with artifacts**: the status and change records of PRD / design notes / contract (plus arch when `prd/<ID>-arch.md` exists) are in sync; for `terminated` packages keep the historical values per the master doctrine and add a "termination conclusion and reasons it must not be redone" section.
3. **Remind the human to commit; never auto-commit**: the commit scope is **per package**; when several packages are in flight in the workspace, verify each file's identity one by one, leave files that do not belong to this package in the workspace, and list them explicitly as "intentionally excluded" in the report. After a package is `done`, remind the human to commit (the message carries the ID).
4. **Archiving**: **default archiving = the human's commit** (once committed it can be traced back); only when the workspace is to be emptied entirely and nothing has been committed yet, pack the requirement-specific and process artifacts into an archive bundle (`tar.gz` + `MANIFEST` + `sha256`) under `reports/_archives/**`.
5. **Clean-up**: at the end of a batch, clean per the master doctrine's "keep / do not keep" table, **keeping only the process skeleton** (master doctrine, this manual, `PROJECT.md`, the four templates; plus the archive area when an archive bundle exists).
6. **Traceability**: conclusions go into a retained document or the commit message; process artifacts are discarded — "it is written in the report" never substitutes for landing a rule.

---

## 7. journal bookkeeping timing

**Append immediately after every subagent artifact write** (use `process_journal`, which handles lock + fingerprint check + atomic replace; **manual read-modify-write of the journal is forbidden**). **A missing journal entry counts as not delivered.**

**Mandatory timings**: ① after each Gate's artifacts land; ② after every dispatch (including `rev` and the read-only allowlist); ③ after every dev delivery (save the `git diff` as `reports/dev-patches/<ID>-<n>.patch` and register it); ④ the **command and result** of every re-run / verification; ⑤ every ruling (including the human's conclusion and the basis document); ⑥ package close-out.

**Fields**: `id` (package ID) / `at` (**machine time**; model-narrated time is forbidden) / `step` (pm/architect/test/dev/uat/review/archives…) / `actor` (locatable to a concrete role) / `action` (write/run/approve…) / `phase` (stage, used to recompute stage duration and rework count) / `note` (a one-line fact; `action:"run"` MUST state the level and scope L1/L2/L3; research convergence says "pm+architect research convergence complete") / `files` (files involved).

**Discipline**: append-only, one line per append, every line carries its own `actor`; concurrency only allows appends, never read-modify-write; the orchestrator records only four kinds (rulings / dispatches / close-outs / research convergence), everything else is registered by each role alongside its own writes.

---

## 8. Hard rules (violation = stop and report)

1. Discovering that **dev changed `test/` or `e2e/`** → stop immediately.
2. Discovering that **a test artifact's import falls outside the allowlist** → stop immediately.
3. **Pause before every Gate**; never approve yourself; before the human signs, no artifact of the next stage may be produced.
4. **No auto-commit**; everything stays uncommitted until acceptance passes — commit only after the human has reviewed and acceptance has passed.
5. **A missing journal entry = not delivered**; every artifact that lands MUST append a record alongside.
6. **subagents may not use any git command that changes the workspace** (stash / checkout / restore / reset / clean / commit); read-only is all that is allowed (status / diff / log); stop on discovery.
7. **The orchestrator does not write subagent artifacts on their behalf** (implementation / test cases belong to the dedicated roles). The orchestrator only does: dispatch / re-check / restore broken changes / run blocked commands on someone's behalf; a proxy run MUST be marked "run by the orchestrator" and its result is an appendix only.
8. **The orchestrator MUST NOT self-verify the technical correctness of role outputs**: when a conclusion is doubted, make the verification a task for the corresponding role in the process, and the orchestrator only registers "to be verified" and puts it in the dispatch queue.
9. **Project-specific information is read from `PROJECT.md` only**; if execution reveals a real need to write outside the ownership table ⇒ stop and report, never invent a path.
10. **If this package's write target overlaps a running entry on the coordination board** ⇒ stop immediately and report to the human; never force the work and never rewrite someone else's entry (master doctrine §2.7).
11. **Committing belongs to the human**: the session only reads git (`status` / `diff` / `log`); **`commit` / `add -A` / `push` are forbidden**; the only exception is explicit authorization by the human in the same round.
12. **The same failing test still red after 3 attempts** ⇒ stop and report; no endless retries and no "fixing it green" by loosening the criteria.
13. **A dev diff that silently exceeds the dispatch's file scope** ⇒ stop and report; an explicit excess goes into the Gate `❓` for the human to rule.
14. **Environment warm-up not ready / known reds without a baseline** ⇒ do not dispatch dev; **passing L2 off as L3** ⇒ stop and report.
15. **The fast path dispatches no research wave**; if the expression is vague, suggest `full`, and never use fast to bypass "candidate → ruling".
16. **A research wave without convergence = research not done** ⇒ Gate0 MUST NOT be entered; missing one of the two research files, or `C-NN` not annotated one by one ⇒ not a delivery.
17. **Prior-art research MUST NOT fabricate citations / copy code / introduce dependencies**; candidates MUST NOT enter an AC directly — the orchestrator must fold them into the check's `Q` / `N`.
