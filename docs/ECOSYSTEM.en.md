# Ecosystem admission status

> **中文**: see [ECOSYSTEM.md](./ECOSYSTEM.md).

This document records dsh-process-kit's **gaps and evidence** relative to the DSH plugin community conventions, for a future decision on whether to invest.

Conclusion: **do only "make it installable", not "polish it for listing"**. The deferred items below are not oversights but deliberate non-work — the trigger conditions are at the end.

---

## 1. Current state of the ecosystem: everything is third-party

DSH officially has **no** plugin marketplace or plugin catalog. Searching the official installation package (`@deepseek-ai/dsh`) for `marketplace` / `catalog` / `dsh-plugin.org` returns nothing.

| Name | Author | Nature | How to get in |
|---|---|---|---|
| [dsh-plugin.org](https://dsh-plugin.org) | `dshplugin` (individual) | Plugin marketplace website | Public repository + GitHub topic `dsh-plugin` + the site's Issue template |
| `dsh-plugin-shop` | `LivXue` | Auto-discovery catalog | npm `keywords` containing `dsh-plugin`/`deepseek-harness`, or a GitHub topic of the same name — **collected automatically, no application needed** |
| `dsh-plugin-guide` | `PerryLink` | Documentation + CLI checker | No barrier (a tool, not a marketplace) |

So "joining the ecosystem" actually means: **a public repository + one keyword/topic**. It costs close to nothing, but it does not constitute an endorsement of quality either (`dsh-plugin.org`'s self-reported plugin count contradicts itself across pages).

## 2. Official hard constraints (already satisfied by this repository)

The official conventions live in the skill bundled with DSH: `@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/` (`references/host-plugin.md`, `references/ui-plugin.md`, `templates/decoration/`).

| Constraint | Source | Status |
|---|---|---|
| The bundle declares `dsh.bundle.patch`, with the patch shaped like `- insert: [{ id, name }]` | `references/host-plugin.md:7-27` | ✅ |
| A host-only bundle needs no dependencies / install script / build tool | `references/host-plugin.md:7` | ✅ zero dependencies, no build |
| `index.js` exports `apply(ctx, config)` (+ optional `inject` / `Config`); export forms MUST NOT be mixed | `references/host-plugin.md:49-52` | ✅ |
| Resource registration goes through `ctx.effect` / `ctx.on` and returns a cleanup | `references/host-plugin.md:54` | ✅ |
| Client `exports["./client"]` + `dsh.client.platform`, `dsh.client.inject` | `references/ui-plugin.md:3`; `dsh-client-modules/lib/index.js:170,719` | — **not applicable**: the page part has been removed; this plugin is a pure server-side bundle |
| Display metadata: `meta.title/description` in `locale/en.json`, top-level `icon` | `references/host-plugin.md:29-45`; `readPluginMeta` in `dsh-app-boot/lib/index.js` | ⏸ deferred |
| Do not import Harness client packages (such as `dsh-client-ui-primitives`) | `SKILL.md:21` | ✅ no client code |
| Do not replace the app root; do not append a second application to `document.body` | `references/ui-plugin.md:13` | ✅ no client code |

## 3. Done (standard installation works)

- [x] **All three spec forms work**: npm package name / `github:SHADOW-LI0327/dsh-process-kit` / a local absolute path
- [x] `peerDependencies: { "@deepseek-ai/dsh": ">=0.1.7-rc.2 <0.3.0" }` — so the DSH compatibility gate can stop an incompatible host
- [x] `private` removed, `publishConfig.access` added — the conditions for `npm publish` are met
- [x] A `files` allowlist (`npm pack` used to pack `test/**` into the package)
- [x] `repository` / `homepage` / `bugs` / `keywords` / `engines` / `author`
- [x] Page part removed (since 0.4.0): no more `exports["./client"]`, `dsh.client` or `GET /process-kit` route
- [x] CI (`npm test` × node 22.19 / 24 + a `npm pack` content check)

## 4. Deferred items (community conventions, not official requirements)

| Item | Requirement | Source | Why it is deferred |
|---|---|---|---|
| `locale/en.json` + `locale/zh.json` | `meta.title` / `meta.description` | An official feature (`readPluginMeta`), but optional display metadata | Skipping it only means the plugin manager card shows the raw package name and the default image; functionality is unaffected |
| `icon.svg` | A top-level `icon`, SVG/PNG/JPEG/WebP ≤256 KiB, and it MUST be inside the package directory | Same as above | Same as above; an icon asset has to exist first |
| `engines.node` | — | Community guide §8 | **Already done** (`^22.19.0 \|\| >=24.0.0`) |
| `packageManager` | Pin `pnpm@11.7.0` | Community guide §8 | This repository has zero dependencies and no lockfile, so pinning a version only adds corepack friction |
| READMEs in five languages | `README-zh/es/pt/hi.md` | Community guide §8 | A personal convention of the guide's author, not a community consensus; one Chinese and one English file is enough |
| ~~GitHub topic `dsh-plugin`~~ | A repository setting | The discovery mechanism of `dsh-plugin.org` / shop | **Removed from the deferred list** ⇒ it is a zero-cost to-do, see §7 |
| Issue / PR templates, `SECURITY.md` | — | Common open-source practice | Not required until there are external contributors |

## 5. State of the community checker

Run `dsh-plugin-dev check` from `dsh-plugin-guide` to check it offline (that package is third-party, not official):

```bash
npm pack dsh-plugin-guide && tar -xzf dsh-plugin-guide-*.tgz
node package/dist/dsh-plugin-dev.js check --cwd .
```

Before the fixes: `FAILED (6 passed, 1 failed, 4 warned, 5 skipped)` (the only error was the missing `engines.node`).

After the fixes: `OK (8 passed, 0 failed, 3 warned, 5 skipped)`. The 3 remaining warnings are exactly the deferred items in the table above (`packageManager`, `display-meta`, `readme-five-langs`), deliberately left unhandled.

## 6. When the deferred items become worth doing

Invest only once any one of these conditions holds:

1. The raw package name shown in the plugin manager has caused real confusion (→ do `locale` + `icon`, about half an hour);
2. External users appear and ask questions on their own (→ add a contribution flow beyond CONTRIBUTING);

Until then, the **only** basis for judging whether this plugin has value is: has anyone actually landed the `docs/process/**` conventions in their own repository.

---

## 7. Listing checklist (zero-cost exposure · requires a human)

**Everything in this section is at the level of "click something / file an Issue" and involves no code change.** It is written down here because these actions require **the repository owner's identity** (GitHub settings or a third-party Issue); the AI side cannot do them on the human's behalf (this machine has no `gh` and no token; even with them, it should not change public repository settings for a human).

**First confirm the precondition (already met)**: `keywords` in `package.json` contains `dsh-plugin` and `deepseek-harness` — `dsh-plugin-shop` collects on those two words **automatically, with no application** (§1). So everything below except item 1 is only a bonus; skipping it does not affect being collected.

| # | Action | How exactly | Impact | Status |
| --- | --- | --- | --- | --- |
| 1 | **Add the GitHub topic** | Repository page → the About gear in the top right → Topics, enter `dsh-plugin` (optionally also `deepseek-harness`, `cordis`) → save | Both `dsh-plugin.org` and the shop's discovery mechanism read it; this is the **only** step that MUST be done by hand | ✅ **Done** (measured on 2026-10-14: `GET /repos/SHADOW-LI0327/dsh-process-kit` returned `topics: ["deepseek-harness","dsh","dsh-plugin"]`) |
| 2 | Submit to `dsh-plugin.org` | File one item using that site's Issue template (repository URL + one-sentence description) | One more catalog to be discovered in; that site's self-reported plugin count is self-contradictory (§1), so its endorsement value is limited | ⏳ waiting on a human |
| 3 | `locale/en.json` + `icon.svg` | See §4 | Affects only how the plugin manager card looks | ⏸ deferred (§6 condition 1) |

> **Why item 1 is called out separately**: it is the **entire practical meaning** of "joining the ecosystem" (§1's conclusion — a public repository + one topic). The rest is display-layer polish.

**Done criterion for the checklist**: `dsh-plugin` appears in the repository page's Topics, and `dsh-plugin-shop` can find this package. **Both are already met** (2026-10-14): the topics are in the table above; the shop index (`count 14843`) already holds an entry for this package, `dsh-process-kit` (`catalog.category: "workflow"`, `source: "npm"`). The remaining items 2 and 3 are optional exposure surfaces; skipping them does not affect being collected.
