# Plugin acceptance: an end-to-end scenario

> **中文**: see [ACCEPTANCE.md](./ACCEPTANCE.md).

The acceptance of this plugin has **only one scenario**, because it is the most intuitive and it squeezes hardest:

> **In a brand-new empty project, say "build an e-commerce app", let the process run all the way by itself, then look at the delivered result.**

No documents, no reports, no process narrative — **only what actually runs counts**. Every acceptance run **creates a new project** and never reuses an old repository.

## Why this scenario

| Reason | Explanation |
| --- | --- |
| **Most intuitive** | The deliverable = commands that run + an interface you can look at. Whether it is good is obvious at a glance, with no need to understand this plugin's design |
| **Broadest coverage** | One chain presses on all of this at once: the state machine / the four Gates / the 9 role boundaries / the gate scripts / artifact write targets / journal integrity / the Gate evidence section |
| **"A brand-new project" is a hard precondition** | It rules out the illusion of "this repository was configured long ago"; what it verifies is **a process that exists as soon as you install it**, not a result assembled from historical state |
| **AI-hosted Gates let it run unattended to the end** | In the acceptance harness an AI signs the Gates on the human's behalf (see below), so the whole chain can run through automatically, with nobody standing guard at each stop and wait |

## AI-hosted Gates (acceptance harness only)

The acceptance run **allows Gates to be AI-hosted**: the approval record in the journal is written as `via: "ai-hosted"`, and the status shows it explicitly as `gate2:approved🤖AI-hosted`.

This is deliberate, and it **MUST leave a trace**: in real development `via` may only be `human` (master doctrine §7 item 9), and **an AI signature MUST NOT impersonate a human signature**; otherwise `gate*: approved` is itself a lie, and this plugin's entire value rests on "this approved was given by a human".

## First confirm which version you installed (0.4.0 and 0.5.0 differ)

Three places on this page depend on capabilities of **0.5.0**. If you are running **0.4.0**, they will show up as **a capability that does not exist**, not as **a process failure** — do not misjudge them:

| Dependency | 0.5.0 | Actual behaviour under 0.4.0 |
| --- | --- | --- |
| `action:"run"` with a structured `command` + `exitCode` | Accepted; the Gate summary automatically lists "exit 0 ✓ / exit non-zero 🚨" | **Rejected by the schema**. The `process_journal` of 0.4.0 is `additionalProperties: false` and only accepts `id / actor / step / action / phase / note / files`; the command and the exit code can only go into the free text of `note`, so **the machine cannot verify them** |
| AI-hosted approval `via:"ai-hosted"` | Accepted; the status shows `gate2:approved🤖AI-hosted` | **Rejected as well**; the hosting fact can only go into `note`, and the 🤖AI-hosted marker never appears in the status |
| The standalone verifier recomputing the **chained** fingerprint | Reports `✓ hash chain consistent` | Reports `⚠ old-format meta (no chainHash): only the line count and the last line were verified` — the 0.4.0 meta only has a last-line fingerprint, with no chained fingerprint |

**On 0.4.0, record the journal like this** (otherwise it raises a validation error at the first Gate):

- Gate approval: `action:"approve"` + `note:"Gate1 approved (AI-hosted, not a human signature)"` — **do not pass `via`**
- Gate execution: `action:"run"` + `note:"npm test → exit 0"` — **do not pass `command` / `exitCode`**

Conversely: **in an example produced on 0.4.0, "what was run" is only a self-reported sentence, and the journal cannot be recomputed as a chain**. To get a verifiable evidence chain you have to run again on 0.5.0 (step 4 of this page already asks for at least two runs).

> **Also self-check that the versions match**: confirm **the scaffold and the harness are the same version** — `diff <plugin package>/scaffold/README.md docs/process/README.md`. In the instance acceptance these two differed by 120 lines ("parallel scheduling (wave model)" vs "dispatch discipline (single package, serial)"), so the process criteria contradicted each other. If they differ, first run `process_init({ upgrade: true, dryRun: true })` to see which files would change.

## Execution steps

```text
1. Create an empty repository (a new one every time, never reused)
2. process_init                     → lays down docs/process/**
3. Fill PROJECT.md §1 + §2 + §3 (minimal usable; an unfilled §3 makes the write-target gate exit 1)
4. One-sentence requirement: "build an e-commerce app"
5. intake → ("build an e-commerce app" is under-specified: the full track first runs pm ∥ architect prior-art research and converges; if the search tool is unavailable, honestly record "not searched" and MUST NOT fabricate) → requirement check → Gate0 (AI-hosted) → the whole flow (do not use the fast path)
6. pm produces the PRD + contract + design notes → Gate1
7. test goes red → dev goes green → Gate2
8. uat black-box acceptance → close out → status: done
9. The human looks at the deliverable: start the services per "how to run", try 3~5 items from "what to try"
```

At every step along the way the gate execution is recorded in the journal as `action:"run"` + `command` + `exitCode` — that way "what was run" in the acceptance report is **machine-verifiable**, not self-reported.

## Running it: do exactly this (copy-paste ready)

### 0. Create a repository (a new one every time, never reused)

You do not need to install the plugin — the plugin is installed at the harness level and is globally available once installed.

```bash
git clone https://github.com/SHADOW-LI0327/dsh-process-kit-example.git
cd dsh-process-kit-example
```

> An empty repository clones out as an empty directory; that is normal. **Make one initial commit right after `process_init` lands** — otherwise ⑫ has no baseline to compare against (see hard constraint ③ at the end).

### 1. Open a DSH session in this directory

**The session cwd MUST be exactly this new directory**: the plugin's tools resolve `docs/process/**` from "the calling session's cwd" (see the hard constraints at the end).

### 2. Say this verbatim (you may copy the whole paragraph)

> Take an e-commerce app through the process plugin from scratch to delivery: backend API + Web frontend, product list / product detail / shopping cart / checkout (fake payment) / order list.
> Run `process_init` first, then follow the process all the way to delivery, and **do not stop in the middle to ask me**.
> **Host the Gates with AI**: judge and approve every Gate yourself, and record `action:"approve"` + `gate:"gateN"` + `via:"ai-hosted"` in the journal; **do not write `human`** — that is not a human signature, and impersonation is not allowed.
> Record every gate execution in the journal as `action:"run"` + `command` + the **real `exitCode`**.
> When you are done, give me only two things: one delivery verdict, and one paragraph on "how to start it / what to try".

> **If it stops at some Gate waiting for your signature**: the "AI-hosted" sentence did not take effect, and that behaviour is **correct** (by default only a human can approve a Gate), not a bug — just add "continue, you host the Gates".

### 3. After delivery, check it like this: three things only, no documents, no reports

**① Did the gates actually run** (read the machine record, not what it says about itself)

```bash
grep -c '"action":"run"' docs/process/prd/*.journal.jsonl      # are there any gate execution records
grep -o '"exitCode":[0-9-]*' docs/process/prd/*.journal.jsonl | sort | uniq -c   # any non-zero ones
```

**② Was the record modified** (independent recomputation — **no plugin, no DSH**, only node's built-in modules)

Save the snippet below as `verify.mjs`, then run `node verify.mjs docs/process/prd/<ID>.journal.jsonl`:

```js
// Independently verify the journal's hash chain: chain_n = first 16 chars of sha256(chain_{n-1} + line_n), chain_0 = ""
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const j = process.argv[2];
const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const lines = readFileSync(j, "utf8").split("\n").filter((l) => l.trim() !== "");
let meta;
try { meta = JSON.parse(readFileSync(`${j}.meta.json`, "utf8")); }
catch { console.log("⚠ no / corrupt .meta.json: nothing to verify (this is not a green)"); process.exit(0); }
const bad = (m) => { console.log(`🚨 tamper suspected: ${m}`); process.exit(1); };
if (meta.lines !== lines.length) bad(`line count mismatch (meta ${meta.lines} / actually read ${lines.length})`);
if (typeof meta.lastHash === "string" && meta.lastHash !== h(lines.at(-1) ?? "")) bad("last line was rewritten");
if (typeof meta.chainHash !== "string") { console.log("⚠ old-format meta (no chainHash): only the line count and the last line were verified"); process.exit(0); }
let chain = ""; for (const l of lines) chain = h(chain + l);
if (chain !== meta.chainHash) bad("hash chain mismatch (a middle line rewritten / deleted / reordered)");
console.log(`✓ hash chain consistent (${lines.length} lines)`);
```

This command **has been verified by us in four situations**: normal ⇒ `✓ hash chain consistent` exit 0; last line rewritten ⇒ `🚨 tamper suspected: last line was rewritten`; middle line rewritten / line deleted ⇒ `🚨 tamper suspected: hash chain mismatch`; no meta ⇒ `⚠ no / corrupt .meta.json: nothing to verify` (**not a green**).

**③ The deliverable really runs**: start the services following its "how to start it", and walk through the checkout flow once.

### 4. Run at least two brand-new projects

A single successful run is often luck; only two successful runs count as a pass.

## Acceptance checklist (every item is machine-verifiable)

| # | Item | How to verify | Pass criterion |
| --- | --- | --- | --- |
| 1 | The process runs to the end by itself, with no human involved | **no** `via:"human"` record anywhere in the journal | every approval is `ai-hosted` |
| 2 | All four Gates pass | `gate0/1/2/4` in `process_status` | all four lights `approved` |
| 3 | **The delivered result really runs** | actually run the "how to run it" commands from the summary | it starts, and it responds to clicks |
| 4 | Journal integrity | the integrity line of `process_status` | `✓ journal integrity: hash chain consistent` |
| 5 | Gate evidence is complete | the "🔒 Gate evidence for this round" section of the Gate summary | no "not recorded", no unexplained non-zero exit code |
| 6 | Write-target and rules ledger gates | `check-artifact-paths.mjs` / `check-rules.mjs` | `exit 0` |
| 7 | The state can be consumed externally | run the CI snippet from [CONTRACT](./CONTRACT.en.md) in the delivery repository | `exit 0`, journal detected |
| 8 | Role coverage (on demand among the 9) | distinct `actor` values in the journal | at least 5 roles appear in a single-package flow; `architect` counts only when prior-art research was triggered (not triggered is not judged a failure) |
| 9 | Artifacts land where the ownership table allows | the delivery repository's file tree vs `PROJECT.md` §3 | no out-of-bounds files |

## Known deviations (MUST be stated honestly, MUST NOT be hidden)

- **AI-hosted Gates ⇒ no human was in the loop to correct course.** So this acceptance run **can only prove that "the harness can run unattended to the end", it cannot prove that "the Gates are effective"**. The effectiveness of a Gate can only be proven by human rulings during real development — using this acceptance run to claim "the process guarantees quality" is **overclaiming**.
- The scale of the e-commerce app is decided by the harness and is usually far smaller than a real project; what it verifies is therefore **end-to-end continuity of the process**, not **efficiency at scale**.
- One successful run does not mean stability: **run at least 2 brand-new projects**, and only two passes count as a pass (the first pass is often luck).
- The **subjective quality** of the deliverable (does it look good, does it feel smooth) is outside this scenario's criteria — that needs a human to look at it, which is exactly why the Gates exist.
- **Archiving does not delete the originals**: this scenario judges "the deliverable + the file tree", so `reports/_archives/` is produced as usual (manifest + checksums), but the **requirement-specific originals stay in the workspace** — this differs from the master doctrine's "after archiving, clear the requirement-specific files out of the workspace" and is **deliberate for the acceptance scenario** (once deleted, the human's review step could not be executed).

## Relationship to promotional material

What this acceptance run produces (timeline, journal, delivery repository, acceptance report) is **first-hand material** for promotion, more convincing than any self-description: **"a brand-new repository + a one-sentence requirement → a runnable e-commerce app"** can be reproduced on the spot.

**Where the example lives (decided)**: the deliverable goes into a **standalone repository** — [SHADOW-LI0327/dsh-process-kit-example](https://github.com/SHADOW-LI0327/dsh-process-kit-example); the "Example project" section of this plugin's README **only adds one link** (it is not stuffed into the npm package, which would grow the package from the 200 kB range to the MB range).

The promotion plan is its own separate item; see the follow-up conclusions.

## Three hard constraints when running this scenario (measured)

You MUST know these before running, or you will waste your time:

1. **The workspace root = the session cwd.** The plugin's five tools resolve the location of `docs/process/**` from the **cwd of the calling agent's session** (`rootOf()`). So "running it in another new project" requires **that session's cwd to be the new project** — driving another directory from a session in this repository cannot be done.
   - The environment variable `PROCESS_KIT_ROOT` can change the root, but it reads a **DSH process-level** env, so it can only be supplied when starting `dsh web`, **and it is currently undocumented** (it exists only in `lib/index.js`).
2. **The file sandbox.** This session may only write inside the workspace (`/Users/admin/workspace/dsh-plugins/dsh-process-kit`) and the platform temporary area (`/tmp` is writable, git works); **sibling directories under `/Users/admin/workspace/` are refused** (measured: `Operation not permitted`), and widening the sandbox is **one-off per command** — it cannot carry the build of a whole end-to-end flow.

3. **⑫ (post-hoc out-of-bounds judgement) depends on a git baseline.** It compares against the change set of `git diff`; **in a brand-new empty repository with no commit at all the change set is always empty** ⇒ ⑫ only honestly shows "⚠ skipped", which is **not a green**. Measured: after writing files into an empty repository, both `git diff --name-only` and `--cached` are empty, and only after `git add` does `--cached` list them. So commit once right after `process_init` lands, and then commit at every node (which is exactly what the process requires: "commit by the human first (default archiving = git)"). Another known boundary: **new files that are untracked and unstaged do not enter the change set**; that batch is caught by the write-target gate `check-artifact-paths`.

⇒ Conclusion: **this scenario SHOULD be run by a human opening a session in the new project's directory** (which is also the real usage), not proxied from a session in the plugin repository. Proxying can only degenerate into "initializing `docs/process` inside the plugin repository and then writing the app in there", which is neither "brand new" nor clean.
