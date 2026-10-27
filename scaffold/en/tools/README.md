# Process artifact directory (`docs/process/tools/`)

> **The master rule is the "process artifacts and script conventions" section of the master doctrine**; this file holds only the **authoring details** and the **registry**.
> ⚠ This directory usually **does not enter version control** (excluded by the ignore rules) ⇒ neither does this file: it is cleaned up together with the artifacts; fetch it back from git history when needed (or from the optional archive bundle).
> **What counts as a process artifact**: acceptance harness · probes · fixture seeding / cleanup · screenshots / evidence capture · one-off data checks — process items produced for **one batch**.
> **What does not**: formal tests that must be re-run long term (they go in `test/`) and **long-lived process gates** (they go in the version-controlled `scripts/`, otherwise they break on the next machine); resident process tooling such as gates and the journal append **MUST NOT** be moved out as process items.

---

## Authoring details

1. **Run from the repository root**: choose the runner by extension (`.ts` / `.mjs` / `.sh` / `.py`); the exact usage follows each script's header comment.
2. ★★ **Locating the repository root MUST be done dynamically; hard-coded relative depth is forbidden** — a one-level miscount does not produce an error, it makes **evidence be silently written into the wrong directory** (= lost evidence, harder to spot than a hard failure):

```ts
// CJS can use __dirname; ESM can use dirname(fileURLToPath(import.meta.url))
function findRepoRoot(from: string) {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`repository root not found: ${from}`);
    dir = parent;
  }
}
```

3. ★★ **If the runner transpiles `.ts` as CJS** (reporting `Top-level await is currently not supported with the "cjs" output format`) ⇒ **`import.meta.*` and top-level `await import()` are forbidden**; to load source from the repository use `createRequire(__filename)(absolutePath)`.
4. ★★ **You MUST assert your own evidence write target**: before writing, confirm the target is inside the agreed evidence directory (the process artifact path designated in PROJECT.md §1); **if it is not, `exit 1` and print the "resolved repository root + target path"**. The write target **may be overridden by an environment variable, uniformly `<EVID_DIR_ENV>`**, but it is **equally bound by the write-target assertion — out of bounds means `exit 1`** (an override is not a backdoor).
5. ★★ **Regression rests on run evidence, not on version control**: this directory usually carries no version-control trace ⇒ the correctness of a change **can only be backed by the readings of one run** ⇒ if you touched an artifact, the report MUST carry the **re-run readings (including the reverse control)**.
6. ★★ **A cleanup harness MUST prove "residue after cleanup = 0"**: the steps are independent of one another (each step / each table has its own `try/catch`; never put several deletes in one transaction); at the end **hard-assert residue = 0**, otherwise judge red; the delivery MUST carry two readings, "before the run / after the run".
7. **Reporting "green" MUST carry "how it would go red"**: a script that only writes to disk and never exits non-zero is equivalent to a silent exemption and MUST NOT count as coverage; the reverse control is the cheapest proof.

---

<!-- process:registry -->
## Registry

> **Purpose**: the **only release source** of the write-target gate = this section (this registry **must not be moved and stays until commit**). It judges only **untracked** files that "will go into the next commit".
> **Rule**: batch production migrations / ops scripts go in `scripts/<ID>-<purpose>.{ts,sql}`; **while uncommitted** add **one line at the end of this section** to register them (**registered = released**), and **delete that line right after committing** — this section keeps only resident items and never accumulates batch business files.
> Already committed files **need no registration** (the gate scans only untracked files).
> **Upgrade backups need no registration**: the `<file>.bak-<timestamp>` that `process_init(upgrade)` writes next to a file is excluded automatically by the gate (a temporary item); delete it once verified.

**Resident (already in version control — do not move out as process items)**:

- `<artifact write-target gate script>` · `<rules ledger gate script>` — resident gates, already merged into the "quick verification" command slot (see PROJECT.md §2), do not move them out.
- `<journal append script>` · `<version sync script>` — resident process tooling, do not move them out as process items.

**Batch registry line (example format, do not copy; after copying you MUST replace every `<...>` with a real path)**:

> The code block below only demonstrates the style and **constitutes no registration** (the gate does not parse inside code blocks, and any entry containing `<...>` never counts as a registration).

```markdown
- `scripts/<ID>-<purpose>.{ts,sql}` — batch data backfill script (read-only by default + prints the restore SQL); **delete this line after committing**.
```
