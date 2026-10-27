<!--
  Requirement check template (Gate0 artifact skeleton).
  ★ How to use: copy it to `input/<ID>-check.md`, then fill in section by section; once produced, stop and wait for the human to sign `gate0: approved`.
  ★ Owner = orchestrator; this file is the only gate between "raw material from the human → PRD" and is **not a PRD**.
  ★ Raw material from the human MUST NOT go straight into a PRD: while this file is unsigned, no PRD / design notes / contract may be produced.
-->

---
id: <ID>
kind: requirement-check
title: <one-line title>
status: pending # pending / confirmed
gate0: pending # pending / approved / rejected —— set approved after the human signs; only then may a PRD be produced
flow: full # full (full flow) / fast (fast path) —— fast builds no PRD, produces no Gate1/Gate2, runs no prior-art research, and dispatches dev directly + existing regression
uiDesign: not-needed # required / not-needed —— only required dispatches ui-designer to produce the HTML prototype (prototypes/<ID>/index.html + handoff.md) and the UI spec (prd/<ID>-ui-spec.md), reviewed together with Gate1
author: <author role, usually orchestrator>
createdAt: <YYYY-MM-DD>
---

# <ID> requirement check

> This file is the gate between **raw material from the human → PRD**. It is **not** a PRD.
> **The orchestrator MUST NOT decide business parameters on the human's behalf** (thresholds / amounts / time limits / scope trade-offs) — they all go into the §4 pending items, and the orchestrator only offers **annotated suggestions**.
> **The fast path runs no prior-art research**: it builds no PRD and passes no Gate1, so it cannot carry the "candidate → ruling" chain; if the expression is vague, do not choose fast.

## Current status at a glance

> Readable in one screen, stating only "what the status is now", no history; updated in place with each delivery.

- Human rulings: `R-01` ~ `R-NN`, N in total (restate each one; no distortion / omission).
- Pending items: `Q-1` ~ `Q-N`, and whether they are **ruled and converged** (not converged ⇒ Gate0 signing must not happen).
- App coverage: <app list, stating for each **involved / not involved + reason**>.
- UI design: <the frontmatter `uiDesign` value + a one-line reason> (`required` ⇒ this package must produce an **openable HTML prototype + handoff table** and the UI spec, reviewed together with Gate1; PNG/PSD are not produced).
- Nature of this file: <full-flow package / fast path / lightweight item> (grading criteria in the master doctrine).
- Last updated round: <rN>

## 1. One-line requirement

<One sentence in plain language; state "whose what pain this solves", no solution.>

## 2. Human rulings restated one by one (`R-NN`)

> Each item = ① the human's **verbatim words** (or source) ② the orchestrator's restatement ③ write target / impact surface.
> **A restatement is a statement of fact, not a new ruling**: never tighten or loosen the original text under the guise of restating it; only when the expansion reveals ambiguity in the original does it escalate into a pending item.
> Self-check: every time this file says "same semantics as X / refer to X", the semantics of X MUST be expanded in this section; if not found, the file is **incomplete**.

| # | Human's words / source | Orchestrator's restatement | Write target and impact |
| --- | --- | --- | --- |
| `R-01` | <verbatim / source> | <restatement> | <impact surface> |
| `R-02` | <verbatim / source> | <restatement> | <impact surface> |

### 2.1 Expanding the reference semantics of referential rulings (mandatory; write "none" if there are none)

> Whenever a ruling says "**same semantics as X**", "refer to X", "consistent with X" or "handle it like X" — wording that points at **existing behaviour of another module** ⇒ the orchestrator **MUST first read the source and pin down X's actual semantics**, and write them as **assertable criteria** + `file:symbol` evidence + a **current-state matrix** (which entry points already comply, which do not).
> The expanded content MUST be marked "**verified by the orchestrator, executing roles must not read it from source themselves**".

| Referential wording | Reference X | X's actual semantics (assertable) | Current-state matrix (compliant / non-compliant) | Evidence |
| --- | --- | --- | --- | --- |
| <"same semantics as X"> | `<module/entry>` | <semantics statement> | <list entry point by entry point> | `<file>:<symbol>` |

## 3. App coverage and write targets

### 3.1 App coverage table

> Declare for each app **involved / not involved + reason**; every involved app MUST give a write target, every uninvolved app MUST give a reason (this prevents "everything outside the backend being silently cut").
> **This table does not answer "do we need UI design"** — that is the frontmatter `uiDesign`'s job (it decides whether to dispatch `ui-designer`). The two are independent: an app being "involved" does not imply UI design is needed, and vice versa.

| App | Involved | Reason | Write target |
| --- | --- | --- | --- |
| `<app-a>` | yes / no | <reason> | `<file>:<symbol>` |
| `<app-b>` | yes / no | <reason> | `<file>:<symbol>` |
| `<app-c>` | yes / no | <reason> | `<file>:<symbol>` |

### 3.2 Write-target table (`file:symbol`)

> Current-state evidence **rests on symbols only, not on line numbers**; line numbers are an `as-of` annotation only (they drift).

| Surface (endpoint / tool / page / field) | Write target | Current state (a re-checkable fact) |
| --- | --- | --- |
| <surface> | `<file>:<symbol>` | <current-state fact> |

### 3.3 Gap table (what should have been done but was not)

| Surface | What the current state exposes | What the underlying layer actually supports | Gap judgement |
| --- | --- | --- | --- |
| <surface> | <what is exposed> | <what is actually supported> | <classification> |

> Classification: ① fixable purely in the frontend (the underlying layer already supports it, it is merely not exposed) ② needs a backend parameter / interface change ③ needs a criteria / shape change.
> The classification MUST **check the signature of every parameter one by one** (including traps such as "this parameter is actually the caller's identity, not a filter option").

### 3.4 Capacity / magnitude evidence (mandatory for data-type conclusions)

> For every magnitude you cite, state clearly: **measured vs estimated**, **the path of the harness that produced it**, **the environment** (local / production).
> For extreme values you MUST check whether **bulk dirty data** is included — mistaking dirty data for the norm directly distorts the whole plan.

## 4. Requirement understanding

<The orchestrator's understanding of the requirement (including boundaries, how it differs from adjacent requirements, and what this round does not do).>

### 4.1 External prior art and candidate requirements (optional)

> Fill in only if prior-art research was done before Gate0; **the fast path leaves it empty**.
> **Even if no research was done you MUST write one line "not done + reason"** (the expression is already assertable / the human explicitly declined / the tooling was unavailable); never leave it silently blank.
> Research files: `input/<ID>-research-brief.md` (orchestrator) / `input/<ID>-prior-art.md` (pm) / `input/<ID>-tech-scan.md` (architect).
> **A candidate is not a ruling**: `C-NN` / `K-NN` take effect only when folded into a `Q` of §5 or an `N` of §6, and **MUST NOT enter an AC directly**.
> If there was no convergence, one research file is missing, or `C-NN` was not annotated one by one by architect ⇒ this file MUST NOT enter Gate0.

| Candidate | Plain language | Source (C/K) | Target | Suggested disposition (Q / not doing) | Reason for rejecting |
| --- | --- | --- | --- | --- | --- |
| `C-01` | <how a user would put it> | `C-01` (pm) | <target> | into `Q-3` | — |
| `K-01` | <a requirement question reverse-derived from a technical constraint> | `K-01` (architect) | <target> | into `Q-4` | — |

**Research counts**: candidates <n> / adopted as Q <m> / rejected <k>; unverified <x>.

## 5. Pending items (★ the orchestrator only suggests, the human rules)

> Each item states: question / impact surface / orchestrator suggestion (≥ 2 options) / source.
> **Convergence requirement**: the total number of `Q` **MUST decrease or stay flat** (on Gate0's first round, `Q` newly added because of prior-art research is exempt from the decreasing constraint; after the human rules they MUST converge); items the human has already ruled **MUST NOT** reappear as Q.
> Mark the source as "triggered by a new ruling / introduced by a new app / `C-NN` / `K-NN`" etc.; a `Q` that came from research MUST be traceable to a candidate in §4.1; the orchestrator's suggestion MUST be marked as a **suggestion, not a conclusion**.

| # | Question | Impact surface | Orchestrator suggestion | Source | Status |
| --- | --- | --- | --- | --- | --- |
| `Q-1` | <question> | <impact surface> | **A (suggested)**… **B**… **C**… | <source> | pending |

## 6. Explicitly out of scope

<List each item explicitly excluded from this round + the reason (so that later readers do not think it was "missed").>

| # | Out-of-scope item | Reason |
| --- | --- | --- |
| `N-1` | <out-of-scope item> | <reason> |

## 7. Risks

> Each item states: risk / trigger condition / mitigation.
> Environment prerequisites (data environment / devices / build prerequisites) are registered in this section too, stating "who gets it ready".

| # | Type | Content | Trigger condition | Mitigation |
| --- | --- | --- | --- | --- |
| `RSK-01` | Risk | <risk> | <trigger condition> | <mitigation> |
| `E-01` | Environment | <environment prerequisite> | — | <who gets it ready> |

## 8. Gate0 signature (★ this file takes effect only after the human signs)

| Item | Content |
| --- | --- |
| Reviewer | <human / account> |
| Ruling basis | <the human's words or key points> |
| Ruling per `Q` | <one by one: accept the suggestion / choose X / give a number> |
| Conclusion | □ Approved (`gate0: approved`) □ Rejected (go back and redraft) |
| Date | <YYYY-MM-DD> |
