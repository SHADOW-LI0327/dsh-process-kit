---
id: <ID>
kind: ui-spec
title: <title> · UI spec
prd: docs/process/prd/<ID>.md
design: docs/process/prd/<ID>-design.md
status: draft # draft / confirmed / terminated
gate1: pending
---

# <ID> <title> · UI spec

> **What this file is**: it translates **the UI-touching items of the design notes** into an **acceptable UI spec** — which components make up the screen, which interaction states exist, and what the user-visible copy is. It is the **criterion source** for test to write UI assertions.
> **What this file is not**: not a PRD (the criteria live in the PRD's `AC`), not a contract (fields and signatures live in `contracts/<ID>.md`); it **writes no production implementation details** (component internals / state-management choices / production file paths / interface call details). Class names inside the HTML prototype are a design carrier only, not a requirement on dev's production class names.
> **The main deliverable is the HTML prototype**: `prototypes/<ID>/index.html` + `styles.css` + `handoff.md`. dev opens it and sees the real DOM / CSS / states; §8 of this file then writes colours / spacing / font sizes and tracking / radii as **literal values**. **This role produces no PNG / PSD**; images only, with no openable HTML = not delivered.
> **Authoritative source**: the ruling table of the requirement check (`R-NN`) and the design notes. **No new business semantics may be invented here** — when a new semantic is needed it flows back to the PRD pending items for the human to rule.
> **Review timing**: **reviewed together with Gate1**. It is a criterion source and criteria must be reviewed by a human, so it gets no separate stop point and is not written up after Gate1.
> `status` is ui-spec's own secondary status bit (`confirmed` = Gate1 has passed / this file is finalised), **not** a value of the PRD state machine; the authoritative status bit lives only in `prd/<ID>.md`.
> **Applicability**: only packages whose **requirement check declares `uiDesign: required`** need this file; `not-needed` (or undeclared) packages do not produce it. That "do we need UI design" decision is made by **the human at Gate0** (see `input/_CHECK_TEMPLATE.md`), not inferred by the orchestrator.

## Current status at a glance

> Readable in one screen, stating only "what the status is now", no history; updated in place with each delivery.

- Spec items: `UI-NN` __ in total (assertable __ / non-assertable __)
- Component decisions: reuse __ / change existing __ / new __
- State matrix: __ interaction points, __ left blank
- Prototype entry: `prototypes/<ID>/index.html`; style source `<styles.css / inline>`
- Handoff: `handoff.md` covers __ / __ `UI-NN` (see §8.3)
- Browser check: `<browser + version + viewport>` ／ `not checked (reason: …)`
- Visual values: colours __ / spacing __ / font size and tracking __ (see §8.2)
- Blocking items: <list if any / none>
- Last updated round: <rN>

---

## 1. UI spec list (mandatory, checked item by item at Gate1)

> Every item MUST trace back to a source (`R-NN` / `AC-N` / a design-notes item) and be written as **user-observable behaviour**.
> An item without an observable criterion = **unqualified**: send it back to pm to fix the design notes, **do not invent a testable cut of your own**.

| ID | Short name (6–12 chars) | Observable criterion sentence | Source | App / page | Component decision | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-01` | <short name> | <element appears / copy keyword / navigation / disabled state / field value / empty-state hint> | `R-01` · `AC-01` | `<app>` / <page> | `reuse:<component>` | implemented / deviation / not implemented |
| `UI-02` | <short name> | <…> | `AC-02` | `<app>` / <page> | `new` | implemented |

---

## 2. Component decision table (mandatory)

> **Reuse first.** A `new` without justification is unqualified.

| # | Component | Decision | Basis / impact surface |
| --- | --- | --- | --- |
| `C-1` | <component name> | `reuse` | Alignment with the existing `props`: <fully aligned / which existing parameters must be passed> |
| `C-2` | <component name> | `change` | **Changes the external behaviour of an existing component** — impact surface: who else uses it <list>; compatibility conclusion <…> |
| `C-3` | <new component name> | `new` | **Why the existing components cannot be reused**: <reason> |

---

## 3. Interaction state matrix (mandatory)

> Fill in every column for every interaction point. **Write "not applicable + reason" where it does not apply; blanks are forbidden** — a blank = not specified, and test cannot judge red from it.
> Every state MUST be **reachable** in the HTML prototype (`?state=` or an in-page switcher).

| Interaction point | Default | Loading | Empty | Error | No permission | Disabled |
| --- | --- | --- | --- | --- | --- | --- |
| <page / action> | <what is shown> | <what is shown> | <what is shown> | <what is shown, is retry possible> | <what is shown> | <when disabled / not applicable + reason> |

---

## 4. Final user-visible copy (mandatory)

> Draft within the PRD's semantics and give the **final string** (for test to assert keywords). **Do not** smuggle new semantics in via copy or change criterion meaning. The prototype MUST use it verbatim.

| # | Position | Final copy | Source |
| --- | --- | --- | --- |
| `W-1` | <button / title / hint / error> | `<final verbatim>` | `UI-01` / `AC-01` |

---

## 5. Responsive / multi-app (as needed)

> Wherever `PROJECT.md` §1 declares mobile or responsive breakpoints, **the breakpoint behaviour MUST be written explicitly** and be verifiable in the prototype; unwritten = not specified.

| Breakpoint / app | Layout and behaviour change | `UI-NN` involved |
| --- | --- | --- |
| <e.g. `<768px` / mobile> | <change> | `UI-01` |

---

## 6. Deviations and unimplemented items

> Anything that diverges from the design notes, or cannot be implemented, **MUST be listed here with an explanation** — never silently skipped, never silently re-scoped by your own judgement.

| # | Corresponding source | Deviation / unimplemented content | Reason | Impact surface | Suggested disposition |
| --- | --- | --- | --- | --- | --- |
| `UD-1` | `R-NN` / `UI-NN` | <content> | <reason> | <impact surface> | <suggestion> |

---

## 7. New semantics flowing back to the PRD

> **New business semantics** you discovered while specifying (undecided in the plan but mandatory for implementation) — they always flow back to the PRD pending items for the human to rule; **never decide them yourself**.
> Write "none" if there are none.

| # | Triggered at | Semantics needing a human ruling | Why it cannot be decided here |
| --- | --- | --- | --- |
| `UQ-1` | `UI-NN` | <semantics> | <reason> |

---

## 8. HTML prototype · visual values · handoff (mandatory when `uiDesign: required`)

### 8.0 Technique and means

> **The delivery format is fixed as static HTML/CSS** (native, no build, no external network). Hand-written, an editor or a generator are all fine; the tool is not prescribed, but **HTML/CSS as the delivery carrier is a hard requirement**.
> **Produce no PNG / PSD / screenshot files**: they cannot replace an openable HTML and are not a handoff source for dev. The physical artifact of Gate1 is `index.html`.

| Item | Value |
| --- | --- |
| Prototype entry | `prototypes/<ID>/index.html` (openable directly; mandatory) |
| Style source | `prototypes/<ID>/styles.css` or inline; token source: project tokens `<path>` ／ generic defaults `docs/process/ui/tokens.md` |
| State switching | `?state=default\|loading\|empty\|error\|disabled`, or a visible in-page switcher (state the exact way) |
| Browser check | `<browser + version + viewport>` ／ `not checked (reason: …)` |
| Test hooks | `<data-ui / data-testid convention>` |

### 8.1 HTML prototype (main deliverable)

> **Main deliverable = `index.html` + `styles.css` + `handoff.md`.** Write target `prototypes/<ID>/`; openable by double-click or a static server, no build, no external CDN, no real interface.

| File | Content | Mandatory |
| --- | --- | --- |
| `index.html` | **HTML prototype entry**; contains the doctype, viewport, and the `data-ui` of every `UI-NN` | **Mandatory** |
| `styles.css` | Prototype styles; colours / spacing / font sizes / radii as literal values or project token variables | **Mandatory** (if inline, explain in §8.0) |
| `handoff.md` | **dev handoff table**: `UI-NN → selector → component decision → state → token → copy → test hook` | **Mandatory** |
| `app.js` | Optional, state switching / static interaction only; **must not** call real APIs or contain business logic | As needed |

> **HTML hard requirements**: every `UI-NN` has `data-ui="UI-NN"` (a `data-testid="ui-nn"` alongside is recommended); every state of the state matrix is reachable in the prototype; copy is verbatim; responsive breakpoints are verifiable; no external network; every local `href/src` target really exists.
> **Multiple screens**: a package usually has more than one screen; use several HTML files or a screen switcher within the same entry, and list them all in `handoff.md`. **"One package, one screenshot" is not the norm.**

### 8.2 Visual values (**dev takes them directly; do not eyeball the image**)

> Token priority: **the project's own tokens > the generic defaults** (`docs/process/ui/tokens.md`).
> Write a **literal value** for every item below; descriptive words such as "dark grey" or "slightly larger" = **unqualified**.
> Values MUST be **consistent** with `styles.css` / the HTML.

| Category | Token / position | Literal value | Where used |
| --- | --- | --- | --- |
| Colour | `bg` | `#0d1117` | Page background |
| Colour | `surface` / `border` / `text` / `muted` / `accent` / `success` / `warn` / `danger` | `<#rrggbb>` | <…> |
| Spacing | Card padding / block spacing / content-area margin | `<N>px` | <…> |
| Font size | Title / body / label / secondary | `<N>px` | <…> |
| Tracking | Given per font size (CJK tracking mapping table in `tokens.md`) | `<N>` (1/1000 em) | <…> |
| Radius / control height | Card / button / pill / input | `<N>px` | <…> |

> **If generic default tokens are used this MUST be stated here** (e.g. "this round uses the default tokens of `docs/process/ui/tokens.md`, no project-specific tokens were used") — so people know this is not the project's existing visual language.
> **Unit discipline**: HTML/CSS always uses `px`.

### 8.3 dev handoff table (mandatory structure of `handoff.md`)

> **The handoff table is the bridge between the HTML and the production implementation.** Without it, dev still has to guess selectors, states and the changeable scope.

```markdown
# <ID> UI handoff

## Entry and states
- Entry: prototypes/<ID>/index.html
- States: ?state=default / loading / empty / error / disabled
- Browser check: <browser+version+viewport / not checked+reason>

## UI-NN handoff table
| UI-NN | Selector | Component decision | State | Token | Copy | Test hook |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | `[data-ui="UI-01"]` | reuse: <component> | default / disabled | `--accent` #xxxxxx | `<verbatim copy>` | `ui-01` |

## dev MUST keep / may freely replace
- MUST keep: <copy / visual hierarchy / state semantics / tappable area>
- May replace: <DOM structure / framework components / data source / animation implementation>
- Deviation register: <if dev changes visual semantics it MUST write back into this table and report to the orchestrator>
```

### 8.4 UI restoration check (after dev implements, before UAT)

> Executed by ui-designer after dev has finished implementing and the L2 package verification has passed; the report lands in `reports/ui-review/<ID>.md` with the conclusion `pass` / `conditional` / `fail`. **A non-pass sends the package back to dev; only a pass proceeds to UAT.** The exact method is in the "UI restoration check" part of `skills/ui-designer/SKILL.md`.
