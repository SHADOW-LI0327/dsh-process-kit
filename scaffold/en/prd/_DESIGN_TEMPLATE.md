---
id: <ID>
kind: design
title: <title> · Design notes
prd: docs/process/prd/<ID>.md
status: draft # draft / confirmed / terminated
gate1: pending
---

# <ID> <title> · Design notes

> **What this file is**: it translates the requirement **ruling by ruling (`R-NN`)** into a design — which entity / field / endpoint / page / interaction it lands on — and exists to stop "initial deviations" before Gate1.
> **What this file is not**: not a PRD (the criteria live in the PRD's `AC`), not a contract (fields and signatures live in `contracts/<ID>.md`); it **writes no implementation details, no technology choices, no SQL / DDL / migration plan**.
> **Authoritative source**: the ruling table of the requirement check (`R-NN`). **No new business semantics may be invented here** — when a new semantic is needed it flows back to the PRD pending items for the human to rule.
> `status` is design's own secondary status bit (`confirmed` = Gate1 has passed / this file is finalised), **not** a value of the PRD state machine; the authoritative status bit lives only in `prd/<ID>.md`.

## Current status at a glance

> Readable in one screen, stating only "what the status is now", no history; updated in place with each delivery.

- Alignment progress: `R-NN` implemented __ / deviation __ / not implemented __
- Conclusion of this round: <one line>
- Blocking items: <list if any / none>
- Last updated round: <rN>

---

## 1. Ruling alignment table (mandatory, checked item by item at Gate1)

> **Every single** `R-NN` of the requirement check MUST appear in this table, **none may be missing**.

| `R-NN` | Ruling (one line) | How the design implements it (entity / field / endpoint / page / interaction) | Status |
| --- | --- | --- | --- |
| `R-01` | <one line> | <implementation point> | implemented / deviation / not implemented |
| `R-02` | <one line> | <implementation point> | implemented / deviation / not implemented |

---

## 2. Deviations and unimplemented items

> **Anything you cannot implement, or that diverges from a ruling, MUST be listed here with an explanation** — never silently skipped, never silently re-scoped by your own judgement.
> When the semantics must change, the ruling MUST flow back to the PRD pending items for the human to rule; this table only records facts and suggestions.

| # | Corresponding `R-NN` | Deviation / unimplemented content | Reason | Impact surface | Suggested disposition |
| --- | --- | --- | --- | --- | --- |
| `D-1` | <R-NN> | <content> | <reason> | <impact surface> | <suggestion> |

---

## 3. Approach and trade-offs

> This section answers "**why it is designed this way**": among several workable designs, what was chosen, what was given up, and at what cost.
> Write only **design- and contract-layer** trade-offs (shape / boundaries / ownership / compatibility) — **no technology choices**, and no implementation steps.

| # | Topic | Candidate approaches | Chosen and why | Cost of the discarded options |
| --- | --- | --- | --- | --- |
| `T-1` | <design topic> | A / B / C | **chose X** — <reason> | <cost> |

### 3.1 End-to-end main flow

> Write "who → in what scenario → does what" step by step, as the expected reference for acceptance.

1. <step>
2. <step>

### 3.2 Frontend interaction

> The entry points, components, navigation, empty states and error states of each app (`<app-a>` / `<app-b>` / `<app-c>` / agent).

- `<app-a>`: <entry / interaction / empty state / error state>
- `<app-b>`: <…>
- `<app-c>`: <…>

---

## 4. Data / interface impact

> Describe only **contract-layer impact** and cross-reference the contract; **do not copy criterion wording, and write no SQL / DDL / index implementation / migration plan**.

### 4.1 Data model impact

| Entity | Field | Type | Constraint / values | Impact (new / modified / reused) |
| --- | --- | --- | --- | --- |
| <entity> | <field> | <type> | <constraint> | new / modified / reused |

> If the data layer is touched (schema change): state the **column changes / whether data compensation is needed / the rollback method** here, and explicitly ask the human to approve it in the Gate summary.

### 4.2 Interface shape impact

| Endpoint | Method | `alignment` | Impact note |
| --- | --- | --- | --- |
| `<path>` | `<METHOD>` | `keep` / `change` / `new` | <key points of inputs/outputs; reused fields MUST follow the current schema naming> |

### 4.3 Permissions and data scope

> State permission codes, authentication semantics and data visibility scope (organisation / region / individual) separately; reference the permission-code list of PRD §8.

- Permission codes: <item by item>
- Authentication semantics: <…>
- Data visibility scope: <…>

---

## 5. Non-goals

> Keep it consistent with the requirement check's "explicitly out of scope"; **items newly excluded by this file MUST state the reason**.

| # | Out-of-scope item | Source (requirement check / new in this file) | Reason |
| --- | --- | --- | --- |
| `N-1` | <out-of-scope item> | requirement check / this file | <reason> |

---

## 6. Risks and rollback

> Every risk MUST come with a **rollback method**: which known-good state to return to, who executes it, and how long it takes. A risk without a rollback is incomplete.

| # | Type | Content | Trigger condition | Rollback / mitigation |
| --- | --- | --- | --- | --- |
| `R-1` | Risk | <content> | <trigger condition> | <rollback method> |
| `D-1` | Dependency | <content> | — | <impact> |

---

## 7. Change log

| Version | Date | Author | Change | Status transition |
| --- | --- | --- | --- | --- |
| 1 | <YYYY-MM-DD> | <role> | First draft | — → draft |
