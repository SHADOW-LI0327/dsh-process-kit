# Configure your repository

The plugin itself needs no configuration. What you configure is the **process in your repository**, and its only interface is `docs/process/PROJECT.md`.

## The only interface: PROJECT.md

The shared documents (`docs/process/README.md` master doctrine, `orchestrator.md` dispatch manual, `skills/**` role skills) only **reference** `PROJECT.md` and hard-code no path, command or credential of any specific project. That brings two promises:

- **Upgrading the plugin never overwrites the PROJECT.md you filled in**;
- **Switching projects only means refilling PROJECT.md**.

### The seven sections

| Section | Content |
|---|---|
| §1 Apps and directories | Which apps this project has (frontend / backend / mobile …), each one's source directory, and the path of the parallel-session coordination board |
| §2 Command slots | The command for each kind of action (run tests, start services, build an acceptance package …) |
| §3 Artifact ownership table | Which paths are writable targets, and which role owns each of them |
| §4 Project configuration | Language, package manager, test framework, automation types and other values |
| §5 UAT preflight | Conditions that MUST hold before real-device acceptance |
| §6 Environment and credentials | Which environment variables and credentials are needed |
| §7 Notifications | **Deprecated** (number kept; write "not applicable") |

## Language (zh / en)

The process itself supports two languages, and the language is a **repository-level** setting, not a plugin-level one:

| Order | Source | How to change it |
|---|---|---|
| 1 | Environment variable `PROCESS_KIT_LANG` | `PROCESS_KIT_LANG=en dsh web` (process-level temporary override, for troubleshooting) |
| 2 | `lang` in `docs/process/.process-kit.json` | Written automatically by `process_init({ upgrade: true, lang: "en" })`; it can also be edited by hand |
| 3 | `lang` in the frontmatter of `docs/process/PROJECT.md` | Edit that line directly |
| 4 | Inferred from the language of `AGENTS.md` / `README.md` | No configuration needed |
| 5 | None of the above ⇒ `zh` | Zero change for existing repositories |

The `lang` argument of `process_init` accepts `zh` / `en` / `auto` (default `auto`: manifest → repository documents → `zh`).

**Switching language**: `process_init({ upgrade: true, lang: "en" })`. Framework-owned files (master doctrine / dispatch manual / templates / gate scripts) are overwritten in the new language and backed up first as `<file>.bak-<timestamp>`; `PROJECT.md` / `ui/tokens.md` / `ui/recipe.md` are project-customizable files and **are not overwritten** — the report only says "needs a manual merge" and points at the location of the bundled new-language version.

**How the gates accept both spellings**: templates put a machine marker above key sections (`<!-- process:owner-table -->` / `<!-- process:registry -->`); when a marker is missing, matching falls back to the heading alias in either language (`## 3. Artifact ownership` / `## Registry`, each with its Chinese counterpart — the complete alias table is in [I18N.md](./I18N.md) §3); §4 / §5 config keys are accepted in both the Chinese and the English spelling (for example `Rules dir`). **Never delete the markers** — they are the only anchor that does not drift with the wording.

**Maintenance discipline**: change either language, and you MUST change the other one in the same round; `test/i18n.test.mjs` inside `npm test` verifies that the two scaffold file lists match, that the English side has zero Chinese residue, that the config key mapping table agrees across all three sources, and that both gates run green in an English repository. The full contract is [I18N.md](./I18N.md).

## Unfilled = unconfigured (placeholder discipline)

Every `<...>` in the templates is a placeholder that **scripts ignore**. This is a hard rule, not a suggestion — because "a false green is more dangerous than a red":

- **§3 writable paths**: an entry containing `<` or `>` **releases nothing at all**. If the whole column yields no valid entry, the write-target gate **errors out with exit 1 and never passes silently**.
- **§4 / §5 values**: a value containing `<` or `>` counts as unconfigured and **falls back to the built-in default promised by the "notes" column**. Example values in the template therefore never override the default configuration.
- **Code block interiors do not participate in parsing**: the complete examples in the template sit inside fenced code blocks, so copying them does not pollute machine reading.
- **Do not write `<...>` for variable paths**: use a `*` wildcard (e.g. `scripts/*-*.{ts,sql}`), or leave the path out of §3 and **register each file individually** in the registry — the latter is stricter and recommended for batch scripts.

## Gates and process scripts

`process_init` drops a copy of the scripts into your repository (zero dependencies, built-in `node:` modules only, directly runnable with `node`):

| Script | Purpose |
|---|---|
| `journal-append.mjs` | Appends to the journal safely (lock + fingerprint verification + atomic replace + a **chained fingerprint `chainHash`**: it detects any modified line / deleted line / reordered line, not just the last one) |
| `check-artifact-paths.mjs` | Verifies that artifacts land inside the paths allowed by §3 |
| `check-rules.mjs` | Verifies process rules (Gates, status bits, ownership table, ledger ↔ test cross-references); includes **post-hoc out-of-bounds judgement** (role boundaries, fail-open) |
| `check-ui-prototype.mjs` | Verifies HTML prototype delivery: `index.html` / `data-ui` coverage / `handoff.md` / external network / local links; **judges handoff completeness only, not aesthetics** |
| `sync-prd-version.mjs` | Syncs the PRD version number |
| `project-config.mjs` | The PROJECT.md parser shared by the scripts above (including the zh/en anchor alias tables `SECTION` / `HEADER` / `CONFIG_KEYS`) |
| `i18n.mjs` | Language resolution (`resolveLang`) and the paired message picker (`makeMsg`), shared by the scripts above |

> **The scripts are a copy that ships with the project and do not update automatically when the plugin is upgraded.** After the plugin fixes gate logic, run `process_init(upgrade: true)` once to sync these scripts and `docs/process/tools/README.md`.
>
> **When upgrading to the version with chained fingerprints**: a `.meta.json` written by an old copy has no `chainHash`, so the reading side honestly reports "⚠ old format: only line count and last line were verified" — **it does not falsely report tampering**; run `process_init(upgrade: true)` once and records written from then on carry chained fingerprints.

## How context enters the session

The old AGENTS.md route (the harness reading a workspace instruction file) and the plugin are not alternatives but three complementary layers:

| Layer | Carrier | Scope | Content |
|---|---|---|---|
| Framework-level standing | the systemPrompt section registered by the plugin | **all** workspaces and subagents under that profile | 7 hard reminders: call `process_status` first, Gates MUST be human-signed, two-part format, journal discipline, roles provided by plugin skills, pointer to the source of truth; the first line also mentions the `process_uninstall` uninstall path |
| Project-level standing | `AGENTS.md` in the repository | that repository | pointers: this project's process source of truth is `docs/process/README.md`, adaptation is `PROJECT.md`; it **does not restate the rules** |
| Injected on demand | role skills / `docs/process/README.md` / `PROJECT.md` | enters context on dispatch or when it is read | role duties, state machine, Gate format, ownership table |

The plugin **cannot replace** the second layer: the plugin is a generic package that spans repositories, and only the repository itself knows where its own process source of truth is. So `process_init` guarantees that it exists (created only when missing; when it already exists, only the sections to merge are printed).
