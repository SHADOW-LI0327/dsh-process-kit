# Design and maintenance

> **中文**: see [DESIGN.md](./DESIGN.md).

For people who are going to change this plugin. Users only need [README](../README.en.md) and [CONFIGURATION](./CONFIGURATION.en.md).

## Code layout

A pure server-side plugin (**no page part**; it registers no client slot):

```
dsh-process-kit/
├── lib/index.js          4 tools + role-skill registration + standing reminders
├── skills/               9 generic role skills (bundled, rank 600)
├── scaffold/             the process scaffold: installed into the target repository's docs/process/**
├── scripts/              gate and process scripts (zero-dependency .mjs)
└── test/                 smoke tests (node test/*.test.mjs)
```

After changing `lib/index.js` you MUST restart `dsh web`: Node's ESM module cache does not reload already-imported modules.

## Design red lines

- The `docs/process/**` files in the target repository are the **single source of truth**; the plugin keeps no state of its own;
- The plugin only does "read + render + safe journal append + add-only, never-overwrite initialization" and **never writes process artifacts on your behalf**;
- It imports no `@deepseek-ai/*` runtime package and introduces no plugin `Config` (a profile may install it via `link:`, and the linked package's own dependencies are not installed);
- **Role boundaries are not enforced in code**. The 9 roles are prompt-level personas; **delivery quality rests on human rulings at the Gates**, while the division of roles buys **efficiency** (everyone writes their own part, no reworking each other's). Do not add host middleware, a permission matrix or preset changes in the name of "being stricter" — the reasons are in the next section.

## Why role boundaries are not enforced in code

The ecosystem already has plugins that enforce role write rights with host middleware / permission matrices (`dsh-crew`'s `pm-write-guard`, `dsh-swarm`'s `permissions.ts`, `dsh-expert-team`'s `tools/post-execute` interception). We **deliberately do not**, for three reasons:

1. **Roles have no runtime identity**. A role is a **skill** broadcast at rank 600; the host does not know that "this subagent is dev-agent". Enforcing it would first need identity propagation — either by changing the agent preset (`dsh-crew` works only after you switch to the Crew preset) or by routing dispatch through a plugin tool. Both destroy the core promise "install it and the roles are there, usable in any workspace, independent of whether the repository has the process initialized" (the same class of mistake as "gating on a directory" below).
2. **The arbiter is the human**. When dev touches the tests, the correct handling is to let the human **know and rule** at Gate2, not to have the host refuse the write. Real-time interception turns a "rulable" situation into a "deadlock" — a hotfix really does need to touch tests, a spike really does need the PM to write code, and the ❓ column of the Gate summary is exactly where such rulings belong.
3. **We cannot win the head-on fight**. In real-time enforcement the other side has middleware, permission matrices and the preset mechanism; we do not, and should not. Our position is "the human signs the right to advance a stage + state in the repository + a tamper-resistant journal".

**What to add, if anything, is "post-hoc judgement" rather than "real-time interception"**: hand the mechanically judgeable out-of-bounds cases (e.g. a diff in the dev stage touching test files) to the existing gate script `scripts/process/check-rules.mjs`, to be judged at the Gate, `exit 1` and be put into the ❓ column of the Gate summary; **fail-open by default** — an uninitialized `docs/process`, the fast path and an unconfigured §3 are all skipped; an out-of-bounds write may be released by "a human approve leaving a record" instead of being forbidden. **Implemented (0.5.0)**: criterion ⑫ of `check-rules.mjs` (including sub-item ⑫a) follows exactly that route — criterion-level fail-open, out-of-bounds releasable via an `approve` record in the journal, and script-level preconditions still honestly exiting 1. **The judgement boundary is hard-limited to outside `docs/process/`**: the whole process directory tree is exempt, otherwise "the orchestrator rewrites status bits after every Gate" would turn ⑫ into a permanently red item (master doctrine §5 item 4 forbids a permanently red item).

## Why prior-art research sits before Gate0, with pm / architect in parallel

When the user cannot state the goal clearly, drafting the requirement check straight away leaves the "unspoken requirement" to be paid for by rework later. The point of prior-art research **is not to decide in the human's place**; it is to turn "how comparable products do it, what it costs technically, whether the licence is usable" into **candidate `Q` items at Gate0**, so that human rulings become cheaper.

**Triggered on demand — not every `full` package runs it**: if the expression is already assertable, the change is single-point, or the human explicitly says it is not needed, draft the requirement check directly; do research only when you are unsure. Making research "mandatory for every full package" would slow down clear small requirements and spend human attention on reports that carry no new information.

- **pm does breadth, architect does depth**: pm reads README / docs / issues and reconstructs the user goal and the gaps against competitors; architect reads architecture / schema / dependencies / licences, checking facts and marking costs. **The PM does not read source code; source-code verification belongs to the architect** — this stops "the README says it exists, the code does not have it".
- **Parallelism reduces anchoring, but the two sides MUST converge**: both scan independently (neither reads the other's files); afterwards the architect annotates the pm's `C-NN` one by one, and the pm derives constraint-type requirements. **No convergence = research not finished**; otherwise you only have two half-finished reports and the merging cost is pushed onto the human.
- **Candidates are not rulings**: `C-NN` / `K-NN` take effect only once the orchestrator folds them into `Q` / `N` of the requirement check, and **MUST NOT enter an AC directly**. External content is untrusted data; copy no code, add no dependency, record the licence; the fast path does none of this.

## Uninstallability: it can be cleaned away, but user files are not plugin output

This plugin lands a process scaffold and scripts in the target repository, so it is intrusive by nature. The goal of the uninstall path is not just "delete cleanly" but **delete cleanly while never deleting the user's own things as if they were plugin output**.

- **Uninstall manifest `docs/process/.process-kit.json`**: `process_init` records the `AGENTS.md` and `.dsh/skills/**` files it **really created**, their hash at creation time, `scriptsDir` and the version. Without a manifest you can only guess; with one you can tell "laid down by init" from "the user already had it / modified it later".
- **Directory-level vs file-level**: `docs/process/**` and `scripts/process/**` are process carriers and are deleted whole once confirmed; `AGENTS.md` and skill copies are the write targets that **may be mixed with user content**, so only files the manifest proves init created, and whose hash still matches, are deleted; a same-named file the user already had is NEVER deleted by default (the single exception: byte-identical to the plugin template, i.e. provably containing no user content). Modified generated files are kept by default (so a project overview / customised skill is not deleted along with them); `force: true` is needed to delete them.
- **Confirmation and backup**: `dryRun: true` by default; the human MUST explicitly pass `confirm: true` + `dryRun: false`. By default everything to be deleted is first backed up to a system temp directory, and if the backup fails **nothing is deleted**. Confirmation is a human action, not the model deciding by itself that "the user probably does not need it any more".
- **Old installs have no manifest**: conservative degradation — directories are deleted as usual; `AGENTS.md` counts as created by init only when it is byte-identical to the plugin template (ignoring the uninstall notice block, including the previous version); of the skill copies only those byte-identical to the bundled `SKILL.md` are deleted, while ones of a different version / modified ones are kept and reported. Never guess at a file that may belong to the user just to "clean thoroughly".
- **Cleanup boundary**: product source / tests / git history / `package.json` are out of the deletion scope; commands in `package.json` that still point at deleted scripts are only reported, not rewritten. What is left after the deletion is a workspace change that a human has to commit.
- **Clean the repository first, then uninstall the plugin**: `process_uninstall` is provided by the plugin; uninstall the plugin first and the process content in the repository can only be handled by hand.

## Six places that must stay in sync

If you change only one of them, the process contradicts itself:

1. **State machine**: `nextAction` in `lib/index.js` is the code form of the state→action table in the generic `scaffold/orchestrator.md`; change one and you MUST change the other.
2. **journal semantics**: `journalAppend` / `journalChain` / `journalIntegrity` in `lib/index.js` and `scripts/journal-append.mjs` MUST keep identical lock, fingerprint, backup and self-check semantics; **the chained-fingerprint formula MUST be verbatim identical** (`chain_n = hash16(chain_{n-1} + line_n)`, `chain_0 = ""`). Once the two algorithms diverge, the reading side judges a healthy journal as "tampered", or conversely judges tampering as normal. `test/host.test.mjs` has an assertion "the test-side chained algorithm should agree with lib" that guards exactly this. On top of that there is a **deliberately independent** implementation: the verification script in [docs/ACCEPTANCE.en.md](./ACCEPTANCE.en.md) for people without the plugin to recompute with — a verifier should not be forced to trust the code of the party being verified, and the price is that **it is the third copy of the same formula**, so it MUST be changed together when the formula changes (the consequence of missing it is glaring: a healthy journal judged "tampering suspected").
3. **Roles and the master doctrine**: the section numbers referenced from `skills/**` MUST really exist in `scaffold/README.md`.
4. **journal field semantics**: the `process_journal` parameters in `lib/index.js`, the field list in §7 of the master doctrine, and the value conventions of `gate_summary` / `process_status` are **one and the same contract** (`action:"run"` MUST carry `command` + `exitCode`; `action:"approve"` carries `gate` + `via`). When adding a field or changing semantics, change all three together, otherwise you get "recorded but nobody reads it" or "read but nobody records it" — the latter is more dangerous: the summary shows "unrecorded", while the human believes it was run long ago.
5. **Bilingual documents**: `scaffold/**` ↔ `scaffold/en/**`, `skills/<role>/SKILL.md` ↔ `SKILL.en.md`, the paired `msg(zh, en)` in `scripts/*.mjs`, the config-key mapping table in `docs/I18N.md` ↔ `CONFIG_KEYS` in `scripts/project-config.mjs` — changing one language MUST go with changing the other in the same round. Anchors (machine markers / heading aliases / config keys) are especially dangerous: if you only add a Chinese alias, an English repository does not error out, it **silently degrades** into "the gate is skipped". `test/i18n.test.mjs` guards this.
6. **Uninstall ownership**: the fields `process_init` writes into the manifest ([CONTRACT](./CONTRACT.en.md) contract 5) and the deletion criteria of `process_uninstall` MUST stay in sync. When adding a write target that "may be mixed with user content", first record created / hash in the manifest and only then allow uninstall to delete it; never write the deletion logic first and add the ownership evidence afterwards.

## How skill broadcasting works

The 9 role skills are registered by the plugin at **rank 600** (the bundled tier DSH defines) and **are broadcast in all workspaces by default** — "install it and the roles are there" is the core promise and does not depend on whether the target repository has the process initialized. A project's own `.dsh/skills/**` (rank 100/200) always overrides a plugin skill of the same name. `PROCESS_KIT_SKILLS=off` disables the broadcast.

### A trap already stepped on: do not go back to "gating on whether the directory exists"

There used to be a version that decided whether to expose the role skills by "does the workspace have a `docs/process` directory". It was wrong, and the reason is worth remembering:

**The skill directory is cached per cwd.** The gate made workspaces that "were just wiped, or have not yet initialized `docs/process`" **unable to see the roles**; worse, even when `process_init` created the directory back afterwards, the cache did not invalidate and the roles **did not come back** — the user could only save themselves by restarting once more.

So the directory gate is gone; an explicit switch, the environment variable, is used instead.

## Why declaring peerDependencies is safe

The plugin declares `peerDependencies: { "@deepseek-ai/dsh": ">=0.1.7-rc.2 <0.3.0" }`, yet **the host runtime does not get installed into the user's profile**. The reason is that the DSH profile directory ships its own `pnpm-workspace.yaml`:

```yaml
nodeLinker: hoisted
autoInstallPeers: false
```

`autoInstallPeers: false` makes pnpm treat that declaration only as a basis for the version check and not actually install it — so we get DSH's compatibility gate without dragging in the whole dsh runtime (280+ `@deepseek-ai/*` packages, including native-build dependencies such as node-pty / koffi).

### When reproducing installation behaviour, you MUST include this pnpm configuration

Running `pnpm add github:...` directly in a bare directory (e.g. `/tmp`) yields **a completely wrong conclusion**: `autoInstallPeers` defaults to true, so pnpm goes and installs the whole dsh runtime and finally exits with a non-zero code because the native build scripts were not approved — it looks like "this plugin cannot be installed", when in fact only the test rig failed to reproduce the real environment.

The minimal faithful rig:

```bash
mkdir /tmp/repro && cd /tmp/repro
printf 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n' > pnpm-workspace.yaml
printf '{"name":"dsh-profile-web","private":true}\n' > package.json
pnpm add github:SHADOW-LI0327/dsh-process-kit
# Expected: Packages: +1 (not +500); a peer-unmet WARN appears — that is correct behaviour
```

## Tests

```bash
npm test
```

Four smoke tests: `host.test.mjs` (tools and the state machine), `skill-registry.test.mjs` (mounted into a real `@deepseek-ai/dsh-skill` registry), `scripts.test.mjs` (gate-script regression), `i18n.test.mjs` (bilingual consistency + end-to-end gates in an English repository).

`skill-registry.test.mjs` **skips and exits 0** when no DSH installation is found on the machine — deliberately, so that a machine without DSH can still run it.
