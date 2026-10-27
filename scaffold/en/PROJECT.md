---
project: <project name>
processVersion: 2
lang: en
---

# Project adaptation (PROJECT)

> This file is the **only interface between the generic process and this project**: the generic documents (master doctrine / dispatch manual / templates) reference only this table and **never hard-code project details**.
> Changing projects = change only this file; the generic process files **MUST NOT** be rewritten because a project differs.
> **Filling requirement**: replace every `<...>` placeholder with this project's real value; for an optional item you leave unused write "not applicable" plus a one-line reason.
> **Machine-read convention** (§4 / §5): keys and values are read row by row from the tables; **copy key names verbatim, never rename them**; wrap values in backticks, separate several values with `,`, and **put no space and no `|` inside a value** (a space is chopped up as a separator and `|` truncates the table column; write regexes in an equivalent space-free, pipe-free form); keys not listed are ignored.

---

## 1. Apps and directories

> Register every "app / key directory" of this project: **one app per row**, stating what it is, where the code lives, and who may write it.
> Placeholders such as `<app-a>` / `<app-b>` in the generic documents are always substituted with the values of this table.

| App/dir | Description | Writable roles |
| --- | --- | --- |
| `<app-a>/` | <e.g. backend API service; the stack in one sentence> | `<role-dev>` |
| `<app-b>/` | <e.g. web admin console; the stack in one sentence> | `<role-dev>` |
| `<app-c>/` | <e.g. mobile H5; the stack in one sentence> | `<role-dev>` |
| `<test-dir>/` | <e.g. integration test directory; who maintains it> | `<role-test>` |
| `<e2e-dir>/` | <e.g. end-to-end / operation script directory; who maintains it> | `<role-uat>` |
| `docs/process/` | Process directory (the framework reserves this path, **do not rename it**) | `<role-orchestrator>` |
| `docs/process/tools/` | Process artifact directory (one-off scripts / probes / screenshots; not in version control) | `<role-test>` · `<role-uat>` |
| `<coordination board>` | <Parallel-session coordination board path: one line per entry `ID · session · time · this package's write target · occupied resources`; covers mutually exclusive resources such as the shared build channel / devices / database. Master doctrine §2.7> | Everyone (compare write-target overlap first, then register before use) |

---

## 2. Command slots

> The generic process recognises only these **four purposes**, never concrete commands; the commands are supplied by this table. **Four fixed rows; do not add or remove purposes, do not rename them.**
> Each row is "purpose → command → description"; put the command in backticks exactly as executable, and state the exit-code semantics in the description.

| Purpose | Command | Description |
| --- | --- | --- |
| Quick verification | `<quick verification command>` | <e.g. `npm run check`. Semantics = **no red in this verification**; any segment that reports red MUST be reported as-is, and turning red into green via allowlists / exclusions / a wrong exit code is forbidden; the baseline it ran on MUST be declared. **After the run, append one journal record with `action:"run"` + `command` + the real `exitCode`** — the "🔒 gate evidence for this round" section of the Gate summary accepts only that, not the sentence "I already ran it"> |
| Artifact write-target gate | `<artifact write-target gate command>` | <Decides whether **new** files that "will go into the next commit" land inside the ownership table paths; the only release source = a registry line in the registry section of `docs/process/tools/README.md`. Three modes: default = untracked (**invisible once you run `git add`**) · `--staged` = new in the index (the last line of defence before commit) · `--committed[=<rev>]` = post-hoc audit of new files in already-committed revisions; **when 0 items are inspected it only reports ⚠ idle, never green**> |
| Rules ledger gate | `<rules ledger gate command>` | <Validates the pairing between ledger and test cases (`@case` exists and `@status=active`), `@prd` ownership, version consistency, import allowlist> |
| journal append | `<journal append command>` | <Append-only write to `prd/<ID>.journal.jsonl`; lock + fingerprint check + atomic replace; **read-modify-write is forbidden**; `at` comes from machine time; **gate execution records MUST carry the exit code** (master doctrine §7 item 8)> |

> **The command slot and the real command MUST change together**: changing only the document and not the command changes nothing (the command is what actually runs).
>
> **Commands do not leave their own trace**: once a gate has run, the orchestrator adds one `action:"run"` record (command verbatim + real exit code) — otherwise the Gate summary only shows "not recorded" and the human cannot tell whether it ran at all.
>
> **Layered verification adds no fixed slots**: L1 = dev uses the test runner's own filter (no slot); L2 = "quick verification" above, run at package scope; L3 = the full form of the same test command / a release-level combination (the project states it in the "description" column). **Do not add or remove the four rows of this table for layering**; the scope form is agreed by the project (e.g. `--scope package` / directory filters).

---

<!-- process:owner-table -->
## 3. Artifact ownership table

> Every role's **single legal write root**; stop the moment you go out of bounds, never invent paths yourself.
> Paths are written relative to the repository root; write the owner as a role name (consistent with the role definition files).
> **Machine-read convention**: `check-artifact-paths` takes only the **"Writable paths" column** as the table of allowed write paths, supporting `**` cross-directory globs and the `dir/` directory prefix; the "Forbidden" column is for humans to read only.
> **Do not write `<...>` in variable paths**: any entry containing `<` or `>` is dropped as an "unreplaced placeholder" (deliberately — see next item), so forms like `scripts/<ID>-<purpose>.ts` **do not take effect**. To express a variable use a `*` glob (e.g. `scripts/*-*.{ts,sql}`), or leave it out of this table and instead **register it item by item** in the registry section (stricter; recommended for batch scripts).
> **Unfilled = unconfigured**: entries containing `<` or `>` are treated as placeholders and **release no path**; content inside ``` code blocks never participates in parsing. If the "Writable paths" column yields no valid entry, the gate **errors out with exit 1 and never silently releases**.

| Role | Writable paths | Forbidden |
| --- | --- | --- |
| `<role>` | `<path>/**` | `<forbidden>` |

> **Example (after copying you MUST replace every `<...>` with a real path; this block does not participate in machine parsing)**:
> The table below merely demonstrates the style and is **not** this project's configuration — the gate reads nothing inside the code block.

```markdown
| Role | Writable paths | Forbidden |
| --- | --- | --- |
| `<role-orchestrator>` (orchestrator) | `docs/process/README.md` · `docs/process/orchestrator.md` · `docs/process/PROJECT.md` · `docs/process/input/**` · `docs/process/ui/**` (the UI default layer landed by the framework: tokens / recipe) · `docs/process/tools/README.md` (registry section) · `docs/process/prd/*.journal.jsonl*` · `scripts/process/**` (framework-provided gate / journal / init scripts, resident) · `reports/orchestrator/**` | Writing implementation / writing tests / making Gate decisions on the human's behalf |
| `<role-pm>` | `docs/process/prd/**` · `docs/process/contracts/**` · `docs/process/input/<ID>-prior-art.md` · `docs/process/uat/<ID>-checklist.md` · `reports/pm-review/**` | Reading business implementation / tests / e2e / logs; writing implementation |
| `<role-architect>` | `docs/process/input/<ID>-tech-scan.md` · `docs/process/prd/<ID>-arch.md` · `reports/architect/**` | Reading business-logic implementation; writing PRD / contracts / AC / tests / source; copying external code or introducing dependencies |
| `<role-ui-designer>` | `docs/process/prd/<ID>-ui-spec.md` · `docs/process/prototypes/<ID>/**` · `reports/ui-review/**` | Changing production implementation source; reading backend implementation / frontend component internals / tests / e2e / logs; writing other roles' artifacts |
| `<role-test>` | `<test-dir>/packages/<ID>/**` · `<test-dir>/fixtures/<ID>-*` · `docs/process/rules/**` · `reports/test/**` · `docs/process/tools/<ID>/**` | Changing `src`; reading business implementation details (except signatures / schema) |
| `<role-dev>` | `<app-a>/src/**` · `<app-b>/src/**` · `<app-c>/src/**` · `scripts/<ID>-<purpose>.{ts,sql}` (production migration / ops scripts only, and they must be registered first) | Changing `test/` · changing `e2e/` |
| `<role-uat>` | `docs/process/uat/**` · `reports/uat/**` (including `evidence/`) · `<e2e-dir>/**` | Reading any code / tests / logs; judging anything beyond whether the feature is right |
| `<role-logic-review>` · `<role-code-review>` · `<role-security-review>` | `reports/<role>/**` | Changing `src`; pasting large code blocks |
```

> **`input/**` is not owned by the orchestrator alone**: the requirement check and the `research-brief` belong to the orchestrator, `prior-art` belongs to pm, `tech-scan` belongs to architect; each writes its own file, **parallel does not mean co-writing**. **`<ID>-arch.md` inside `prd/**` belongs to architect**, the remaining PRD / contracts / design notes belong to pm; the orchestrator only lands the status bits. The write-target gate releases by the **union** of owners, yet the discipline is still **single owner**.

> **Status-bit exception (MUST be written into §3)**: in the frontmatter of `prd/<ID>.md` the fields `status` / `gate0` / `gate1` / `gate2` / `gate4` are landed by the **orchestrator** at each Gate — the master doctrine requires "land the status bit after the Gate passes", and **judging `prd/**` to pm alone makes that rule impossible to satisfy at the same time** (one round of instance acceptance already showed this: the status bit was written by the orchestrator while the ownership table did not grant it to the orchestrator), and criterion ⑫ (post-hoc out-of-bounds judgement) would **misjudge the orchestrator's status-bit write as out-of-bounds**. All other content (PRD body / contracts / checklist) still belongs to `<role-pm>`. Pick one of two forms: add `docs/process/prd/<ID>.md` to the orchestrator row (stating "status bits only"), or state the exception clause explicitly here.

> **The `*` after `journal.jsonl` cannot be omitted**: appending to a journal also side-writes a `<ID>.journal.jsonl.meta.json` fingerprint file (needed for lock and fingerprint checking). If you write only `*.journal.jsonl`, then as soon as the project narrows the pm row to `prd/*.md` (§3 says explicitly that variable paths use `*` globs, which is a very natural thing to write), **the framework's own audit file gets judged out-of-bounds by the framework's own write-target gate**. Semantics: **the row that owns the journal MUST cover it itself**, and must not rely on somebody else's `prd/**` to catch it in passing.
> Note: this explanation can only live here — **do not put a note containing `<...>` into a path cell**, that makes the whole path be dropped as an unreplaced placeholder.

**Forbidden write targets (no role may ever write them)**:

- One-off probes / fixture seeding / cleanup / screenshots / evidence-capture scripts landing at the version-controlled `scripts/` root level ⇒ they belong in `docs/process/tools/<ID>/`;
- any new file under `scripts/` **that is not registered in the registry on the artifact side**;
- the `docs/process/` root level (it holds only the master doctrine · dispatch manual · this file and the four templates);
- any one-off artifact **not covered by the ignore rules** (it will certainly go into the human's commit) — "delete it after use" is no exemption.

---

## 4. Project configuration

> This section is the **project-specific configuration** entry point for the gate scripts: `check-rules.mjs` / `sync-prd-version.mjs` read the test directories and ledger location here, `check-artifact-paths.mjs` reads the registry file here, `check-ui-prototype.mjs` reads the UI prototypes directory here. **Every row is optional**; delete a whole row to use the default; wrap values in backticks, separate several with `,`, no spaces inside a value.
> **Unfilled = unconfigured**: `<...>` in the value column marks a placeholder — **leave it unfilled and you get the default promised by the "description" column**; any value containing `<` or `>` is ignored by the scripts (example values live only in the "description" column and never participate in parsing). Content inside ``` code blocks does not participate in parsing.
> **Do not hard-code stack assumptions**: commands, directories and type vocabularies are all supplied by this table; the scripts only do deterministic reading and judging.

| Configuration key | Value | Description (default / example / optional?) |
| --- | --- | --- |
| Test scan dirs | `<dir>` | Optional, default `test` (example: `test`). The test roots that `check-rules` scans recursively; separate several with `,`; paths relative to the repository root |
| Test file suffixes | `<suffix>` | Optional, default `.test.ts`, `.test.mjs`, `.test.js` (example: `.test.ts`, `.test.mjs`). `check-rules` and `sync-prd-version` recognise test files by these (the latter only recognises files under "Package test dirs" of this section) |
| Flow test dirs | `<dir>` | Optional, default the same as "Test scan dirs" (example: `test`). Tests under these directories are bound by the "Import allowlist" |
| Package test dirs | `<dir>` | Optional, default `test/packages` (example: `test/packages`). The home of requirement-specific tests: one subdirectory per package `<dir>/<ID>/`; archived batches are exempt from the git-tracking filter, but **they are scanned only while that package still has a ledger**; `sync-prd-version` also locates `<ID>`'s test files here |
| Import allowlist | `<regex>` | Optional, default `^node:`, `^https?:`, `^\.\.?/`, `^vitest$`, `^@?vitest`, `^jest$`, `^@jest/`, `^mocha$`, `^express$`, `^supertest$` (example: `^node:`, `^\.\.?/`, `^@app/api`, `^@app/db`). Each item is a **regex** matched against import specifiers (compliant entry points such as helpers / schema / routes are registered here) |
| Automation types | `<type>` | Optional, default `vitest`, `jest`, `node`, `junit`, `cdp`, `manual`, `uat`, `none`, `pending`, `withdrawn` (example: `vitest`, `cdp`, `manual`, `none`, `pending`, `withdrawn`). The **exact** vocabulary for `automation:` in the ledger; a value outside the table is judged ❌ |
| @case carrier types | `<type>` | Optional, default `vitest`, `jest`, `node`, `junit` (example: `vitest`). These types MUST have an `@case TC-<ID>` carrier in the source (other types are exempt from `@case` but should declare `carrier:`) |
| JUnit test dirs | `<dir>` | Optional, default not scanned (example: `mobile/android/app/src/test`). Once configured, recursively scans `@case` in `.java` (skipping `build/`) as junit carriers |
| Pending-decision patterns | `<regex>` | Optional, default = the alternation regex of the two branches (`pending Q-\d+ ruling` and `or HTTP \d+`, joined by a vertical bar) (example: `pending Q-\d+ ruling`); a cell of this table cannot contain a vertical bar, so for a custom multi-branch pattern split it into equivalent single branches or just delete this row and use the default. After the PRD is frozen (`status: frozen` / `gate2: approved`) these words MUST NOT survive in the test |
| Rules dir | `<dir>` | Optional, default `docs/process/rules` (example: `docs/process/rules`). The directory holding `<ID>.yaml` ledgers |
| PRD dir | `<dir>` | Optional, default `docs/process/prd` (example: `docs/process/prd`). The directory holding `<ID>.md` and `<ID>-design.md` |
| Registry file | `<path>` | Optional, default `docs/process/tools/README.md` (example: `docs/process/tools/README.md`). `check-artifact-paths` reads the backtick-registered paths in its `## Registry` section (registered = released) |
| UI project tokens | `<path>` | Optional, default not configured (example: `web/src/styles/tokens.css`, `tailwind.config.ts`). **The location of the theme / design tokens / design system package the project already has** (separate several with `,`). Configured ⇒ UI design **MUST copy this token set first** and MUST NOT invent colours and spacing; not configured ⇒ fall back to the generic defaults of `docs/process/ui/tokens.md`. **The two MUST NOT be mixed**: half copied from the project and half default within the same package is worse than all-default. **Configured ⇒ gate ⑩ judges it**: it extracts a palette from this token source (CSS variables and scattered colour literals both count) and requires **all** primary on-screen colours to be derivable from that palette (two palette colours may be composited at any α); a screen that "used a whole different palette" is judged ❌. Not configured ⇒ ⑩ only warns ⚠ |
| UI prototypes dir | `<dir>` | Optional, default `docs/process/prototypes` (example: `docs/process/prototypes`). One subdirectory per package `<dir>/<ID>/`: **`index.html` (entry of the main deliverable) + `styles.css` + `handoff.md`**; `check-ui-prototype` judges accordingly. PNG/PSD are not deliverables of this process |

> **Two release sources**: the write-target gate releases a file via the "Writable paths" column of §3 **or** the registry of the "Registry file" in this section; a one-off file that neither covers is always judged ❌.

---

## 5. UAT preflight

> This section is the project-specific configuration entry point of `check-uat-readiness.mjs`: once filled, run it once before dispatching UAT to confirm that "environment + UAT account + target endpoints + checklist" are ready.
> **Every row is optional**; **command-line arguments take precedence over this section** (the same-named `--core` / `--web` / `--mobile` / `--account` / `--password` / `--api-prefix` / `--login-path` / `--token-field` / `--cdp` / `--checklist-dir` / `--evidence` override this table).
> When "UAT account" or "Target endpoints" is not configured, the corresponding check **degrades to ⚠** (it neither crashes nor misjudges readiness).
> **Unfilled = unconfigured**: `<...>` in the value column marks a placeholder — **leave it unfilled and you get the default promised by the "description" column**; any value containing `<` or `>` is ignored by the scripts (example values live only in the "description" column and never participate in parsing).

| Configuration key | Value | Description (default / example / optional?) |
| --- | --- | --- |
| Core backend | `<URL>` | Optional, default `http://127.0.0.1:3000` (example: `http://127.0.0.1:3000`). Backend liveness probe, and the base address for the login / target-endpoint probes |
| Web frontend | `<URL>` | Optional, default `http://127.0.0.1:5173` (example: `http://127.0.0.1:5173`). Web frontend liveness probe |
| Mobile | `<URL>` | Optional, default `http://127.0.0.1:5174` (example: `http://127.0.0.1:5174`). Mobile liveness probe (a browser mobile viewport also works) |
| UAT account | `<account>` | Optional, default not configured (login and endpoint permission probes are skipped) (example: `uat_demo`). Register **test accounts only**, never production accounts |
| UAT password | `<password>` | Optional, default not configured (example: `uat-demo-pass`). Pairs with "UAT account"; **write only the source or a test password**, never a production plaintext secret |
| Target endpoints | `<endpoint segment>` | Optional, default not configured (skipped) (example: `users?pageSize=1`, `roles`). A list of endpoint segments relative to "API prefix"; a successful login ≠ having permission, so each segment must return HTTP 200 |
| API prefix | `<prefix>` | Optional, default `/api/v1` (example: `/api/v1`). Appended after `Core backend` |
| Login path | `<path>` | Optional, default `<API prefix>/auth/login` (example: `/api/v1/auth/login`). POST `{account,password}`, expecting 200 |
| Token field | `<dot path>` | Optional, default `data.accessToken` (example: `data.accessToken`). The **dot path** used to take the token out of the login response |
| Device CDP | `<URL>` | Optional, default `http://localhost:9222/json` (example: `http://localhost:9222/json`). Unreachable only yields ⚠, it does not block |
| Checklist dir | `<dir>` | Optional, default `docs/process/uat` (example: `docs/process/uat`). A **missing** `<ID>-checklist.md` inside it is judged blocking (UAT sends the package straight back) |
| Evidence dir | `<dir>` | Optional, default not configured (⚠ is reported for `--progress`) (example: `docs/process/reports/uat/evidence`). Counting the `U-NN-*` evidence files gives the per-item completeness |

> **`--pkg <ID>` has no default and is mandatory** (passed on the command line); every other parameter may be omitted, and an omitted one falls back to this table or the script's built-in default.
> `--progress` additionally prints the per-item UAT completeness (checklist `### U-<NN>` items ↔ evidence files prefixed `U-NN-`).
>
> **Environment lifecycle belongs to the orchestrator**: starting services / installing dependencies / migrating seeds / taking the baseline snapshot / health checks are hosted and registered by the orchestrator; dev is responsible only for the environment that this change alters (schema sync / new dependencies / migration scripts). Not ready before dispatch ⇒ do not dispatch dev.

---

## 6. Environment and credentials

> Register **locations and ways to obtain**, **never plaintext secrets**.

| Item | Value / path | Description |
| --- | --- | --- |
| Service address (local) | `<http://127.0.0.1:PORT>` | <port list per app> |
| Database | `<connection-string source: env var name / .env key name>` | <local database name; schema change discipline: change only the schema source files, migrations are the human's responsibility> |
| Test account | `<seed command / credential file path>` | <list UAT accounts per role, stating the site / permission prerequisites; do not modify shared account data> |
| Device / hardware | `<device identifier / driver port>` | <occupancy registration: claim / release / TTL; a package MUST NOT be dispatched while an occupancy is unreleased> |
| Credential file | `<uat credential file path>` | <kept long term, not a batch artifact; not in version control> |
| Ignore rules | `<relevant .gitignore entries>` | <which process paths are ignored, so that "not in git = not done" is not misjudged> |

---

## 7. Notifications (**deprecated, number kept**)

> This framework no longer has a notification channel: the Gate lives in the conversation and the "human absent" scenario is out of scope. **Write "not applicable" for this whole section**; the number is kept only to avoid misaligned §1–§7 references across the documents.
