# dsh-process-kit

[![CI](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/SHADOW-LI0327/dsh-process-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-process-kit)](https://www.npmjs.com/package/dsh-process-kit)
[![license](https://img.shields.io/npm/l/dsh-process-kit)](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)

> **中文**: see [README.md](./README.md).

A multi-role + multi-agent parallel development plugin that raises output quality through engineering discipline.

> **English**: this file. The plugin supports two process languages, **Chinese / English** (`process_init({ lang })`); see "Bilingual support" below.

## Introduction

Adds a file-driven engineering development process to [DSH](https://github.com/deepseek-ai/deepseek-harness). A requirement package's status, Gate sign-offs, and its process and bug records all live in the target repository's `docs/process/**`; the plugin only reads, renders, appends safely and lays down scaffolds — it keeps no state of its own.

It also bundles 9 role subagents with hard boundaries between them: whoever writes the implementation does not write the tests, and whoever writes the tests does not do acceptance; the product and architecture prior-art research runs **on demand** in parallel before Gate0, and candidates only enter the requirement check, never an AC directly.

## Features

- **File state machine**: progress lives in the frontmatter of `docs/process/**`. Calling `process_status` on every wake-up restores the context; no chat history required.
- **Gate stops**: stop to confirm only at Gate0/1/2/4 (requirement check, design, development, acceptance), and print a two-part summary at each stop (✅ done / ❓ awaiting a decision).
- **Tamper-resistant journal**: chained fingerprints (any rewritten / deleted / reordered line is detectable), recomputed on the reading side and reported red honestly; both status bits and approval provenance can be verified after the fact.
- **Role separation**: role skills are registered with the plugin; a same-named skill in the project's `.dsh/skills/**` overrides it.
- **Requirement prior-art research (on demand)**: when the human cannot state the goal clearly, dispatch `product-manager` + `architect` in parallel before Gate0 to look at GitHub / public docs and turn implicit requirements / technical constraints into candidate `Q` items of the check; **parallelism MUST converge**, candidates MUST NOT enter an AC directly, the fast path skips it, and it is **not the default for every full package**.
- **Zero dependencies**: imports no library outside the plugin, no build step.
- **Create only, never overwrite**: `process_init` only creates by default and overwrites nothing; existing repositories upgrade with `process_init(upgrade: true)` — framework-owned files are backed up before being overwritten, while project-customizable files such as `PROJECT.md` and the token files are never overwritten, only diffed in the report.

## Bilingual support (Chinese / English)

One process, two languages. Language affects **wording** only — never **write targets or criteria**:

- **Choosing a language**: `process_init({ lang: "en" })` lays down the English scaffold, `zh` the Chinese one; `auto` (the default) looks in order at `lang` in `docs/process/.process-kit.json` → the language of the repository's `AGENTS.md` / `README.md` → `zh`. The environment variable `PROCESS_KIT_LANG=zh|en` overrides it once, for that process. **Changing the language** = `process_init({ upgrade: true, lang: "en" })` (framework-owned files are overwritten in the new language, backed up first; `PROJECT.md` / token files are not overwritten, only reported as needing a manual merge).
- **Gates and tools follow the repository**: gate scripts' runtime messages, the reports of `process_status` / `gate_summary`, and the body text of all 9 role skills are emitted and taken according to the repository language (an English repository gets English; a Chinese repository behaves exactly as before).
- **The machine reads markers, the human reads prose**: templates place HTML comment markers above key sections (`<!-- process:owner-table -->` / `<!-- process:registry -->`); gates locate sections by marker first and fall back to a heading alias in either language only when a marker is missing; §4 / §5 config keys are accepted under **both languages** (e.g. `Rules dir` and its Chinese alias); the requirement check is recognized under both filenames, authoritative by frontmatter `kind: requirement-check`.
- **Full contract**: [docs/I18N.md](./docs/I18N.md) (resolution priority, marker list, the 26-key config mapping, maintenance discipline); `test/i18n.test.mjs` verifies the two scaffolds match, leave no residue, and that the gates run green in an English repository.

## Installation

| Method | target | Notes |
| --- | --- | --- |
| npm (recommended) | `dsh-process-kit` | Installed from npm; upgrading only needs a version bump (the exact version is whatever the registry says) |
| GitHub | `github:SHADOW-LI0327/dsh-process-kit` | No npm needed; pin a version with `#<tag>` or `#<commit>` |
| Local directory | an absolute path, e.g. `/Users/<you>/dsh-plugins/dsh-process-kit` | Use this when you need to change the plugin source; clone it locally first |

Effective immediately; restart the client only if the UI has not picked it up.

> **Cannot install the latest version? It is not an installation failure.** pnpm ships a 24-hour supply-chain protection by default (`minimumReleaseAge = 1440`): a version published less than 24 hours ago is not selected by `^range` / `latest` resolution. **Wait 24 hours**, or **pin an exact version** (`dsh-process-kit@0.9.0` — an explicit pin bypasses the policy by design). Setting `minimumReleaseAge` to 0 is not recommended: that turns the whole protection off.

## Quick start

```text
1. Install the plugin (effective on install, usually no restart needed).
2. Say what you want to build ("a website", "an app").
3. The AI runs `process_init` to initialize the process in this repository.
4. Work through the process; for the first package try the fast path: `flow: fast` in the requirement check, then after the human signs Gate0 dispatch dev + the existing regression suite.
```

`process_init` generates: `docs/process/` (master doctrine, dispatch manual, `PROJECT.md`, templates), `docs/process/.process-kit.json` (uninstall manifest: what was created + hashes, for precise cleanup), `scripts/process/` (gate and journal scripts), and `AGENTS.md` (created only when absent, never rewritten; pass `agents: false` to skip).

### Example project (standalone repository)

[dsh-process-kit-example](https://github.com/SHADOW-LI0327/dsh-process-kit-example) — an end-to-end run in a **brand-new empty repository**, from one sentence ("build an e-commerce app") to delivery (deliverables, process artifacts and journal evidence all stay in that repository). Start-up steps and the acceptance checklist are in [docs/ACCEPTANCE.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/ACCEPTANCE.md) (zh), including a script that **recomputes the journal's chained fingerprints without installing the plugin**.

### Upgrading an existing repository

```js
process_init({ upgrade: true, dryRun: true })   // first see which files would change
process_init({ upgrade: true })                 // then land it
```

| File | Upgrade behaviour |
| --- | --- |
| Framework-owned: `README.md` (doctrine), `orchestrator.md`, the four templates, `tools/README.md`, `scripts/process/*.mjs` | Overwritten only when the content changed; the previous version is backed up as `<file>.bak-<timestamp>` |
| Project-customizable: `PROJECT.md`, `ui/tokens.md`, `ui/recipe.md` | **Never overwritten**; listed under "needs a manual merge" together with the path of the bundled template |
| Data: `input/**`, `prd/<ID>*`, `bugs/**`, `reports/**` etc. | Never touched |

When `processVersion` in `PROJECT.md` falls behind, the report tells you to merge by hand against the bundled template.

### Uninstalling (when you no longer want the process)

All process content lands in the repository rather than in private plugin state, so it **can be removed completely**; but deletion is irreversible, so by default it only previews:

```js
process_uninstall({ dryRun: true })                  // dry-run is the default; see what would be deleted
process_uninstall({ confirm: true, dryRun: false })  // deletes for real only after the human explicitly confirms
```

| Handling | Content |
| --- | --- |
| **Deleted after confirmation** | `docs/process/**` (every process artifact) and `scripts/process/**` (or the custom `scriptsDir`); the uninstall manifest goes away with the directory |
| **Deleted only when init created it and it was not modified** | `AGENTS.md`, `.dsh/skills/<role>/SKILL.md` (decided by the manifest hash; byte-identical to the template also counts; modified copies are kept unless `force: true`) |
| **Never deleted** | an `AGENTS.md` / same-named skill containing user content; product source and tests; git history; `package.json` (it only reports commands that still point at deleted scripts) |

- **Backed up to a system temp directory by default**; if the backup fails, nothing is deleted. Deletion is a **workspace change** and does not rewrite git history — commit it yourself.
- **Uninstall the process before the plugin**: `process_uninstall` is itself provided by the plugin; once the plugin is gone, nobody is left to clean the repository.
- **Old installs without a manifest** are cleaned conservatively (directories as usual; `AGENTS.md` / skill copies only when byte-identical to the template), and the report names what was kept. For an old repository, run `process_init({ upgrade: true })` first to sync the scripts.

## Tools

| Tool | Description |
| --- | --- |
| `process_status` | Scans `docs/process` and returns each package's status, the four Gate lights, the journal tail, unclosed bugs and the next action |
| `gate_summary` | Generates the two-part Gate summary skeleton for the given package; the basis is filled in automatically, ✅ / ❓ are left blank for you |
| `process_journal` | Appends to the journal safely: lock + fingerprint verification + atomic replace, with the timestamp taken from the machine clock |
| `process_init` | Initializes the process scaffold and scripts into the current repository: create-only by default; `upgrade: true` upgrades an existing repository (framework-owned files are backed up before overwrite, project files are never overwritten); it also writes the `docs/process/.process-kit.json` uninstall manifest |
| `process_uninstall` | After confirmation, cleans up the process content the plugin put into the repository: dry-run by default, deletes only with `confirm: true` + `dryRun: false`; backs up by default; deletes only the `AGENTS.md` / skill copies that init created and that were not modified (or are byte-identical to the template), and never user files with custom content, product source or git history |

## Roles

Roles are provided by skills bundled with the plugin and are registered on install — no configuration needed. The skills work in every workspace, whether or not the repository has the process initialized; a same-named skill in the project's `.dsh/skills/**` takes precedence. Set the environment variable `PROCESS_KIT_SKILLS=off` to disable them.

### Role list (9 roles)

| Role | Duty | Since |
| --- | --- | --- |
| `product-manager` | PRD, interface contract, design notes; acceptance-completeness review after UAT; optional requirement prior-art research before Gate0 (`input/<ID>-prior-art.md`) | `0.1.0` |
| `architect` | In parallel with pm before Gate0, does the **technical prior-art and constraint scan** (`input/<ID>-tech-scan.md`, constraints / costs / licences only); after Gate0, produces the **architecture design and trade-offs** on demand (`prd/<ID>-arch.md`) | `0.6.0` |
| `test-agent` | Turns the PRD into acceptance tests (red) and independently re-runs verify (referee / player separation) | `0.1.0` |
| `dev-agent` | Implements against the PRD + contract until the tests are green; writes source only, MUST NOT modify tests | `0.1.0` |
| `uat-agent` | Real-device black-box UAT: judges only "does it match expectations when it is used" | `0.1.0` |
| `code-review-agent` | Correctness / regression / boundary / maintainability review of the source diff | `0.1.0` |
| `security-review-agent` | Authorization / privilege escalation / injection / secrets / sensitive-data review of the source diff | `0.1.0` |
| `logic-review-agent` | Adversarial logic review of the rules ledger and the source: rule→branch mapping, uncovered branches, concrete counter-examples | `0.1.0` |
| `ui-designer` | Translates the UI-touching items of the design notes into an **acceptable UI spec** (component decisions / state matrix / final copy / literal values) and produces an **openable HTML/CSS prototype + a `handoff.md` handoff table**; after dev implements and before UAT it runs the **UI restoration check**. Whether to dispatch is decided explicitly by the human at Gate0 with `uiDesign: required / not-needed`; **produces no PNG/PSD** | `0.2.0` |

> Full version history is in [CHANGELOG](./CHANGELOG.md) (zh); the exact version on npm is whatever the registry says.

**`ui-designer`'s boundaries**: **translate, never invent** (anything upstream did not write goes into an "undecided criteria" list for a human ruling); **project tokens first** (if `PROJECT.md` §4 configures project tokens they MUST be copied verbatim — no invented colours / font sizes / spacing); **HTML is the primary deliverable** (`index.html` + `styles.css` + `handoff.md`, no PNG/PSD); **the UI restoration check sits after dev and before UAT** (one `UI-NN` row per item into `reports/ui-review/<ID>.md`; only `pass` proceeds to UAT); **aesthetics are left to the Gate** (`check-ui-prototype` judges handoff completeness only).

### When the three review roles actually run

The 9 roles are not peers: `product-manager` / `architect` / `ui-designer` / `test-agent` / `dev-agent` / `uat-agent` are dispatched by the state machine inside a single-package flow; `code-review-agent` / `security-review-agent` / `logic-review-agent` run **only in the "pre-release full regression"**, and that stage is started explicitly by the human — **if a release regression was never started, these three never ran once** (`process_status` reports honestly whether `reports/release/**` has a report; absent means it never ran).

Two exceptions bring them on stage early: ① the human names them at any Gate; ② the package touches RBAC / amounts·allocation / schema / a new external interface, in which case the orchestrator puts "should the review run early" into the Gate summary.

## Configuration

The only thing that needs configuring is `docs/process/PROJECT.md`. Process documents hard-code no path or command of any specific project; they reference that file for everything, so a plugin upgrade never overwrites what you filled in, and switching projects only means refilling this file.

Seven sections: §1 apps and directories, §2 command slots, §3 artifact ownership table, §4 project configuration, §5 UAT preflight, §6 environment and credentials, §7 notifications (deprecated, number kept).

**The minimal usable setup fills only three sections**: §1 + §2 (at least the "quick verification" and "journal append" rows) + §3. Every key in §4 has a default and can be used as is; fill §5 / §6 when you are about to run UAT; write "not applicable" for the whole of §7. **§3 is a hard threshold**: leaving it empty makes the write-target gate exit 1 outright (deliberately not passing silently), so it is not one of those optional items you can still "configure later".

Every `<...>` in the templates is a placeholder; scripts ignore it, so it never becomes effective configuration. See [docs/CONFIGURATION.en.md](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/docs/CONFIGURATION.en.md) for details.

## Documentation

All documents have an English edition — this file, `docs/CONFIGURATION.en.md`, `docs/CONTRACT.en.md`, `docs/DESIGN.en.md`, `docs/ACCEPTANCE.en.md`, `docs/ECOSYSTEM.en.md`; `docs/I18N.md` is bilingual. The Chinese originals sit next to them (`README.md`, `docs/*.md`).

| Document | Content |
| --- | --- |
| [docs/I18N.md](./docs/I18N.md) | **Bilingual contract**: language resolution priority, machine markers, the 26-key zh/en config mapping, maintenance discipline |
| [docs/CONFIGURATION.en.md](./docs/CONFIGURATION.en.md) · [zh](./docs/CONFIGURATION.md) | PROJECT.md's seven sections, language setting, placeholder rules, gate scripts |
| [docs/CONTRACT.en.md](./docs/CONTRACT.en.md) · [zh](./docs/CONTRACT.md) | Machine-consumable contract: frontmatter / journal / chained-fingerprint algorithm / uninstall manifest / exit codes — **CI can consume it without the plugin** |
| [docs/DESIGN.en.md](./docs/DESIGN.en.md) · [zh](./docs/DESIGN.md) | Design red lines, the six places that must stay in sync, uninstallability, known traps |
| [docs/ECOSYSTEM.en.md](./docs/ECOSYSTEM.en.md) · [zh](./docs/ECOSYSTEM.md) | DSH plugin ecosystem: admission requirements, listing checklist and current state |
| [docs/ACCEPTANCE.en.md](./docs/ACCEPTANCE.en.md) · [zh](./docs/ACCEPTANCE.md) | Plugin acceptance: an e-commerce app end-to-end in a fresh project, AI-hosted Gates, a machine-verifiable checklist |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Dev environment, tests, bilingual discipline, commits and release |

## Development

Zero runtime dependencies; nothing to install or build:

```bash
npm test
```

Four smoke tests: `test/host.test.mjs`, `test/skill-registry.test.mjs`, `test/scripts.test.mjs`, `test/i18n.test.mjs`.

## License

[MIT](https://github.com/SHADOW-LI0327/dsh-process-kit/blob/main/LICENSE)
