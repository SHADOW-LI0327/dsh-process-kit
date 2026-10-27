# Machine-consumable contract

> **中文**: see [CONTRACT.md](./CONTRACT.md).

For people / scripts / CI / other agents that want to consume process state **outside the plugin**.

## Why "not installing the plugin" works

All of this plugin's state **lives in plain text in the target repository** (`docs/process/**`); the plugin only does "read + render + safe append + add-only, never-overwrite initialization" ([DESIGN](./DESIGN.en.md) red line 1). Therefore:

- **CI, pre-commit, code review and external tools need neither this plugin nor DSH** — reading the files is enough;
- After the plugin is uninstalled the state is still complete, readable and verifiable — this is the structural difference of "state in the repository" versus "state on the plugin side (SQLite / home directory / task JSON)";
- Conversely, what this document pins down is **which fields you may depend on**.

This document describes the **stable contract**. Changes to field semantics follow semver and are called out in the [CHANGELOG](../CHANGELOG.md) (zh).

---

## Contract 1: package frontmatter

The YAML frontmatter of `docs/process/prd/<ID>.md` and `docs/process/input/<ID>.md` (the requirement check):

| Field | Values | Meaning |
| --- | --- | --- |
| `id` | `^[A-Z]+-\d+$` | Requirement package ID, the primary key of the whole process |
| `status` | `intake` / `clarifying` / `red` / `implementing` / `verifying` / `uat` / `archives` / `done` / `terminated` … | How far the process has got (for the state machine see the master doctrine) |
| `flow` | `full` / `fast` | Tier. `fast` has Gate0 only |
| `gate0` `gate1` `gate2` `gate4` | `pending` / `approved` … | **Status bits**: whether a given Gate has passed. **They do not record who approved it** (see contract 2) |
| `prdVersion` | integer | PRD version; MUST agree three-way with the rules ledger and the test header |
| `uiDesign` | `required` / absent | Whether UI is touched (decides whether ui-designer is dispatched) |

> ⚠ **`gate*: approved` does not mean "a human signed it"**. It only says the status bit was written as approved; **the approval provenance is in the journal**. To distinguish a human signature from an AI-hosted one (acceptance harness) you MUST read `via` as defined in contract 2.

> **A single ID may own several files**: the primary `prd/<ID>.md`, plus companions such as `<ID>-design.md` / `<ID>-ui-spec.md` / **`<ID>-arch.md`** / the checklist — and **companions carry `id` in their frontmatter too**. **Contract: status bits always come from `prd/<ID>.md`**; companions never participate in value resolution. Only when the primary file is missing do they serve as a fallback, and `process_status` warns "cannot find the primary file". **`<ID>-arch.md` is the exception: it is not a status carrier** — it only appears as `artifacts.arch` of the primary package, and without a same-ID primary file it **does not form a package of its own**, there is only a warning "cannot find the primary file". **The `-arch` suffix is reserved for architecture design and trade-offs**: a requirement package ID MUST NOT end with `-arch` (otherwise the primary file is taken for a companion, and package-ID normalization in `check-rules` merges it into the parent level as well).
>
> Machine consumers MUST resolve the primary file by that same rule and **MUST NOT take the first entry in directory order**: `readdir`'s return order is undefined, and `<ID>-` sorts before `<ID>.` lexicographically — get it wrong and a package with `status=done` / `gate2=approved` is read as a companion's `confirmed` / `pending`.

## Contract 2: journal (JSONL, one JSON object per line)

`docs/process/prd/<ID>.journal.jsonl`, append-only, **read-modify-write by hand is NEVER allowed**.

| Field | Required | Meaning |
| --- | --- | --- |
| `at` | ✅ | ISO8601 **machine time** (filled in by the tool, not a time the model asserts) |
| `actor` | ✅ | Who did it, e.g. `orchestrator` / `subagent:test-agent` |
| `id` | ✅ | Package ID |
| `step` | | Stage: `pm` / `architect` / `test` / `dev` / `uat` / `review` / `archives` … |
| `action` | | `write` / `run` / `approve` / … |
| `phase` | | Phase (used to recompute stage duration / rework count) |
| `files` | | Array of files involved |
| `note` | | One-line fact |
| `gate` | | `gate0` / `gate1` / `gate2` / `gate4` |
| `command` | see below | The gate command actually executed (verbatim) |
| `exitCode` | see below | The **real exit code** of that command |
| `artifact` | | Evidence pointer (artifact / report path) |
| `via` | see below | `human` (human signature) / `ai-hosted` (AI-hosted signature) |

**Two conditional hard constraints** (enforced on the write side, dependable on the consume side):

- `action: "run"` ⇒ **MUST** carry both `command` and `exitCode`. "It ran", with no exit code, is exactly the masking the master doctrine forbids. **This is the only machine-verifiable source for "did this Gate run, and did it go red".**
- `action: "approve"` ⇒ **MUST** carry `gate` (`gate0` / `gate1` / `gate2` / `gate4`) and `via` (**enforced at the tool layer**: missing either one is an immediate error). **In real development `via` MUST be `human` only**; `ai-hosted` is allowed only in acceptance / regression harnesses (e.g. a brand-new project running an e-commerce app end to end), and it MUST NOT pose as a human signature.

- **An undeclared field ⇒ outright rejection** (a misspelled capitalisation counts too; the tool offers suggestions such as "did you mean `exitCode`?"). Older versions **silently dropped** them, and in a real run 4 records consequently lost their command and exit code — "I recorded it" turned into "it was never actually recorded".

> If the status bit says `approved` but the journal has no matching `approve` record ⇒ the plugin displays `⚠no record` (the provenance cannot be established); `via:"ai-hosted"` ⇒ the display is `gate2:approved🤖AI-hosted`.

## Contract 3: side-car fingerprint and integrity verification

`docs/process/prd/<ID>.journal.jsonl.meta.json`:

```json
{ "lines": 3, "lastHash": "<first 16 hex chars of sha256>", "chainHash": "<same as above>" }
```

Verification algorithm (**reproduce it verbatim**, otherwise a healthy journal is judged as tampered):

```
hash16(s)  = first 16 hex chars of sha256(s)
lines      = number of non-empty lines
lastHash   = hash16(raw text of the last line)
chainHash  = fold(lines, (chain, line) => hash16(chain + line), initial value "")
```

**Verdicts** (four outcomes; **"cannot verify" is not green**):

| Verdict | Condition |
| --- | --- |
| ✅ consistent | `meta.lines === line count` and `meta.chainHash === chainHash` |
| 🚨 tampering suspected | line-count mismatch (truncation / an append that was never registered), `lastHash` mismatch (the last line was changed), `chainHash` mismatch (**any middle line changed / a line deleted / lines reordered**) |
| ⚠ old format | the meta has no `chainHash`: only the line count and the last line can be verified, **middle lines cannot** |
| ⚠ not verified | no `.meta.json`, or the meta is corrupt |

> `lastHash` alone is not enough: changing a middle line, or deleting one line and adding another, both fool it — that is exactly why `chainHash` was added.

## Contract 4: gate scripts (CI side)

`scripts/process/*.mjs` are **zero-dependency** Node ESM scripts, directly runnable in CI, and **the criterion is the exit code**: `0` = pass / not applicable, non-zero = red (red is a gap and MUST NOT be masked).

| Script | What it judges |
| --- | --- |
| `check-artifact-paths.mjs` | Artifact landing: whether **newly added** files land under a legitimate root. **Three modes**: by default it judges untracked files (invisible once `git add` has run) · `--staged` judges the new files in the index · `--committed[=<rev>]` judges the new files of one committed revision; **it only judges additions** (normal operations such as editing `README.md` are not judged). See the ⚠ below |
| `check-rules.mjs` | Self-consistency of the rules-ledger ↔ test ↔ PRD three-layer evidence chain, the import allowlist, `prdVersion` agreement; **post-hoc out-of-bounds judgement** (role boundaries, fail-open) |
| `check-uat-readiness.mjs` | UAT preflight: environment + account + target endpoints ready |
| `check-ui-prototype.mjs` | HTML prototype delivery: `index.html` / `data-ui` coverage / `handoff.md` / external links / local links; **judges handoff completeness only, not aesthetics** |
| `journal-append.mjs` | Safe append (lock + fingerprint + atomic replace + self-check), writes the meta |
| `sync-prd-version.mjs` | Syncs the five declaration sites of `prdVersion`; under `--check`, **an artifact that exists but lacks that field line ⇒ judged inconsistent, exit 1** (only a completely missing file is skipped, fail-open) |

**fail-open is deliberate**: with `docs/process` uninitialized, on the fast path, or with no ownership table configured in the project, everything is skipped with `exit 0`, so repositories that have not adopted the process are never hit.

> ⚠ **The write-target gate's reading is only valid "before commit"** (measured in instance acceptance): `check-artifact-paths.mjs` judges **non-ignored untracked files**. The same command, run **before** the delivery commit, read `69 untracked files checked (69 released)`, and run **after** the commit, read `0 (0 released)` — **both reported `exit 0`**, yet the second one **checked nothing at all**.
>
> Three modes (since 0.5.0; the report **MUST state which one was used**):
>
> | Mode | What it judges | Where it is used |
> | --- | --- | --- |
> | default | non-ignored untracked **new** files | before commit; **invisible once `git add` has run** |
> | `--staged` | **new** files in the index | the last line of defence before commit (covers the blind spot left by `git add`) |
> | `--committed[=<rev>]` | the **new** files of one committed revision (default `HEAD`) | **CI / post-hoc audit** — in CI the artifacts were committed long ago, so only this mode has anything to judge |
>
> **When 0 files were checked it only reports `⚠ empty run` and NEVER paints green**: judging nothing does not count as having judged ("cannot verify" is not green). All three modes **judge additions only** (`--diff-filter=A`); editing a non-artifact file such as `README.md` / `package.json` is outside this gate's remit. Re-checking already-committed artifacts for out-of-bounds writes can also be done as an independent audit over the full `git ls-files` set (the instance acceptance report contains such an `audit-ownership.mjs`, and it was reverse-tested — a deliberately out-of-bounds file MUST come back red).

## Contract 5: uninstall manifest (`docs/process/.process-kit.json`)

`process_init` writes an **uninstall manifest** into the process directory; its only purpose is to answer "which things did init lay down, and were they modified afterwards". It is not a process-status carrier and takes no part in the state machine; without it, `process_uninstall` degrades conservatively.

```json
{
  "schema": 1,
  "package": "dsh-process-kit",
  "version": "0.7.0",
  "installedAt": "<ISO8601>",
  "updatedAt": "<ISO8601>",
  "lang": "zh",
  "processDir": "docs/process",
  "scriptsDir": "scripts/process",
  "agents": { "path": "AGENTS.md", "created": true, "sha256": "<64 hex>" },
  "skills": { "dir": ".dsh/skills", "createdFiles": { "product-manager/SKILL.md": "<64 hex>" } }
}
```

- `lang`: the repository's process language (`zh` / `en`); it is the **language source of truth** (only the `PROCESS_KIT_LANG` environment variable outranks it, and it outranks `lang` in `PROJECT.md`). Gate scripts, tool reports and role skills all take their wording from it; `process_init`'s `lang: "auto"` reads it first too, and only falls back to inferring from the repository documents when it is absent.
- `agents` / `skills` may be `null`: the corresponding write target was never touched.
- `agents.created: false`: `AGENTS.md` already existed and init did not modify it; uninstall keeps it by default. The single exception: it is byte-identical to the plugin template (ignoring the uninstall notice block) ⇒ it holds no user content and can be cleaned up safely.
- `skills.createdFiles` lists only the files **init really created**; the value is the sha256 at creation time. Files the user already had / that init skipped are not listed.
- `scriptsDir` may be customised with `process_init({ scriptsDir })`; uninstall deletes according to it. It MUST be a dedicated subdirectory: `process_init` rejects `docs/process` or its parent, and broad top-level directories such as `scripts` / `docs` / `src`, so that deleting a whole directory on uninstall never takes project files with it.
- **`AGENTS.md` / `.dsh/skills` are the only write targets that need file-level ownership judgement**: with a manifest, only files that are "created=true and hash still matching" are deleted, or an `AGENTS.md` byte-identical to the plugin template (no user content); modified ones are kept by default, and deleted only under `force`. `docs/process/**` / `scripts/process/**` are directory-level process carriers and are deleted whole once confirmed.
- Old repositories have no manifest: uninstall then decides by directory plus "is `AGENTS.md` byte-identical to the plugin template (ignoring the uninstall notice block, including the previous version; both the Chinese and the English template count)"; of the skill copies, only those byte-identical to the bundled `SKILL.md` / `SKILL.en.md` are deleted, the rest are kept and reported.
- An old repository's manifest **has no `lang` field**: it is treated as `zh` throughout (zero behaviour change for existing repositories), and `process_init({ upgrade: true, lang: "en" })` fills it in and overwrites the framework-owned files in English.

## Contract 6: structured returns of the plugin tools (agent side)

The return values of `process_status` / `gate_summary` / `process_journal` / `process_init` / `process_uninstall` are **structured objects** (`render` only takes care of display). The fields you may depend on:

- `process_status` → `{ found, root, lang, processDir, generatedAt, packages[], openBugCount, orphanBugs[], warnings[], releasePending, releaseReports[] }` (`lang` decides the report language); each package carries `id` / `status` / `gates` / **`gateHost`** (`human` / `ai-hosted` / `unrecorded`) / `prdVersion` / `artifacts` (including `uiSpec` / `prototype` / `uiReview` etc.) / `openBugs` / `next`, plus `journal: { lines, lastAt, lastActor, lastStep, integrity, runs[], approvals[] }`.
- `journal.integrity` → `{ state: 'verified' | 'legacy' | 'tampered' | 'unverified', reason?, lines? }`.
- `journal.runs[]` → `{ at, gate, actor, step, command, exitCode, artifact }` (`action:"run"` of contract 2).
- `journal.approvals[]` → `{ at, gate, actor, via }` (`action:"approve"` of contract 2).
- `process_init` → `{ created[], skipped[], updated[], manual[], upgrade, dryRun, lang, manifest, manifestChanged, report }`; `manifest` is always `docs/process/.process-kit.json`; `lang` is the **resolved** scaffold language (`auto` is resolved to `zh` / `en`) and agrees with `lang` in the manifest.
- `process_uninstall` → `{ dryRun, manifest, removed[], preserved[], backupDir, report }`; `removed` is the list of directory-level / file-level deletions, and `backupDir` being `null` means nothing was backed up.

---

## Consumption examples

> All three snippets obey **the value-priority rule of contract 1** and **the field semantics of contract 2**: status bits are read from `prd/<ID>.md` only (the `_`-prefixed templates are skipped, and companions such as `<ID>-design.md` / `<ID>-ui-spec.md` are not read either — **the criterion is that the file-name stem equals the frontmatter `id`**), and they **always `JSON.parse` and then read fields; they never depend on key order**.
>
> **Do not match key order with a literal grep**: a pattern such as `grep -o '"gate":"gate2","actor":"[^"]*","via":"[^"]*"'` **never matches** as soon as the journal's key order changes — in the instance acceptance the approval record for `gate2` **plainly existed**, yet the snippet printed "no approval record". That is a **false negative**: more dangerous than a false positive, because it makes people conclude "nobody signed this Gate".

### CI: treat "process state" as a gate (no plugin installed)

```bash
# ① Rules ledger / rules gate: non-zero means red
node scripts/process/check-rules.mjs

# ② Write-target gate: before commit use --staged (the default mode goes blind once `git add` has run); in CI use --committed
node scripts/process/check-artifact-paths.mjs --staged

# ③ journal integrity: recompute the chained fingerprint (plain node, no dependencies)
node -e '
const fs=require("fs"),c=require("crypto");
const h=s=>c.createHash("sha256").update(s).digest("hex").slice(0,16);
const dir="docs/process/prd"; let bad=0,legacy=0,ok=0,unchecked=0;
if(fs.existsSync(dir)) for(const f of fs.readdirSync(dir).sort().filter(n=>n.endsWith(".journal.jsonl"))){
  const p=`${dir}/${f}`, lines=fs.readFileSync(p,"utf8").split("\n").filter(l=>l.trim());
  let chain=""; for(const l of lines) chain=h(chain+l);
  const mp=`${p}.meta.json`;
  if(!fs.existsSync(mp)){ unchecked++; console.error(`⚠ ${f}: no meta — not verified (not green)`); continue; }
  let m; try{ m=JSON.parse(fs.readFileSync(mp,"utf8")); }catch{ unchecked++; console.error(`⚠ ${f}: meta failed to parse — not verified (not green)`); continue; }
  if(m.lines!==lines.length || m.lastHash!==h(lines[lines.length-1]??"")){ bad++; console.error(`🚨 ${f}: line count / last line mismatch — tampering suspected`); continue; }
  if(typeof m.chainHash!=="string"){ legacy++; console.error(`⚠ ${f}: old-format meta (no chainHash) — only the line count and the last line were verified; a changed middle line / a deleted line / a reordered line goes undetected`); continue; }
  if(m.chainHash!==chain){ bad++; console.error(`🚨 ${f}: chained fingerprint mismatch (a middle line changed / a line deleted / lines reordered)`); continue; }
  ok++;
}
console.error(`journal: verified ${ok} · tampering suspected ${bad} · old format ${legacy} · not verified ${unchecked}`);
process.exit(bad?1:0);'
```

> **How to read it: only "verified" is green.** `old format` and `not verified` both mean "cannot verify", **which is not a pass** — to get green, run `process_init({ upgrade: true })` once in the repository and bring the side-car meta up to the chained form. The four counters are deliberately displayed separately: folding "cannot verify" into "pass" is treating colourless as green.

### Find "which packages are waiting for Gate2, and who signed the approval"

```bash
node -e '
const fs=require("fs"),dir="docs/process/prd";
for(const f of fs.readdirSync(dir).sort()){
  if(!f.endsWith(".md")||f.startsWith("_")) continue;                    // skip templates (same as the plugin loader)
  const fm=fs.readFileSync(`${dir}/${f}`,"utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if(!fm) continue;
  const m=fm[1].match(/^id:\s*(\S+)\s*$/m); if(!m) continue;
  const id=m[1];
  if(f.slice(0,-3)!==id) continue;                                       // companions do not participate: contract 1 takes <ID>.md as authoritative
  if(!/^gate2:\s*pending\s*$/m.test(fm[1])) continue;
  const jp=`${dir}/${id}.journal.jsonl`; let via="no approval record";
  if(fs.existsSync(jp)) for(const l of fs.readFileSync(jp,"utf8").split("\n")){
    if(!l.trim()) continue; let e; try{ e=JSON.parse(l); }catch{ continue; }
    if(e.action==="approve"&&e.gate==="gate2") via=e.via==="human"?"human":"🤖"+(e.via??"via not recorded");
  }
  console.log(`${id}\t${via}`);
}'
```

> Along the way this also demonstrates two loader rules: **`_` prefixes are skipped** and **the primary file is authoritative**. Miss either one and `_TEMPLATE.md` or `FEAT-001-design.md` is taken for "a package waiting for Gate2" (the instance acceptance tripped over both).

### Collect "Gate evidence" for a release check

```bash
# A non-zero exit code = red, i.e. a gap; a missing exitCode = unrecorded (both MUST be cleared or explicitly exempted)
node -e '
const fs=require("fs"),dir="docs/process/prd"; let bad=0,noCode=0;
for(const f of fs.readdirSync(dir).sort().filter(n=>n.endsWith(".journal.jsonl"))){
  for(const l of fs.readFileSync(`${dir}/${f}`,"utf8").split("\n")){
    if(!l.trim()) continue; let e; try{ e=JSON.parse(l); }catch{ continue; }
    if(e.action!=="run") continue;
    if(e.exitCode===undefined||e.exitCode===null){ noCode++; console.error(`⚠ ${f}: run without exitCode (${e.command??"no command"}) — unrecorded, does not count as having run`); continue; }
    if(e.exitCode!==0){ bad++; console.error(`🚨 ${e.gate??"?"} exit ${e.exitCode}: ${e.command??"?"}`); }
  }
}
console.error(`non-zero exit codes ${bad} · missing exit codes ${noCode}`); process.exit(bad?1:0);'
```

> The sentence "it ran" is not evidence in itself: **only an `action:"run"` with a real `exitCode` counts**. If you cannot write one, first check whether you are using an old version of the tool that accepts only 7 fields (contract 2).

---

## Change discipline

- Adding a field: backward compatible; consumers should ignore unknown fields; the plugin's tool returns are **incremental**.
- Changing field semantics / removing a field: a breaking change — call it out in the CHANGELOG, and per "three places that must stay in sync" in [DESIGN](./DESIGN.en.md) change `lib/index.js`, §7 of the master doctrine and this file together.
