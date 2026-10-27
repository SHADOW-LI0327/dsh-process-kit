---
id: <ID>                 # e.g. FEAT-001; globally unique
title: <title>
status: draft            # draft / frozen / red / implementing / uat / done / terminated
gate1: pending           # pending / approved / rejected
gate2: pending
gate4: pending
prdVersion: 1
---

# <ID> <title>

## Current status at a glance

> Readable in one screen, stating only "what the status is now", no history; updated in place with each delivery.
> When it conflicts with the body, **the top wins**.

- Delivery status: <current stage + next step>
- Expected red/green: <N green / M red; triage of the reds>
- Open items: <`Q-N` list / none>
- Last updated round: <rN>

---

## 1. Source and ruling traceability

> Every criterion of this PRD MUST be traceable to a ruling in the requirement check; **no new business semantics may be invented here** — when a new semantic is needed it always goes into the §7 pending items for the human to rule.

| Item | Content |
| --- | --- |
| Source | `docs/process/input/<ID>-check.md` (Gate0 artifact; **the rulings `R-NN` are the authoritative source**) |
| Ruling traceability | `R-01` ~ `R-NN` one by one: which AC / boundary of this PRD carries it (see the table below) |
| Contract | `docs/process/contracts/<ID>.md` |
| Design notes | `docs/process/prd/<ID>-design.md` (aligned with `R-NN` item by item) |

| `R-NN` | Ruling in one line | Carried by (AC / E number) |
| --- | --- | --- |
| `R-01` | <one line> | <AC-1 / E-1> |
| `R-02` | <one line> | <AC-2> |

---

## 2. Scope and non-goals

| Item | Content |
| --- | --- |
| Input positioning | <where this requirement sits in the business; whether it belongs to the platform-capability layer or the business-application layer> |
| Scope of this round | <what to do> |
| Non-goals (explicitly out of scope) | <list what is not done, one item per line, to avoid scope creep; keep it consistent with §6 of the requirement check> |

> Existing (already implemented) behaviour is **kept and asserted against its own semantics**, never trimmed because of a new requirement — if such assertions turn red, they are a real gap of "the current state does not match the new semantics" and the most valuable output of this package. The new area holds only new entities / endpoints / behaviours that are not implemented yet.

---

## 3. App coverage table

> Mandatory for full-stack requirements; it prevents everything outside the backend from being silently cut. An app that is involved but not covered by this PRD **MUST be registered in the dependency column of this section** (who does it, in which PRD, and whether it blocks this PRD's acceptance).

| App | Involved | Ownership | Dependency / blocking note |
| --- | --- | --- | --- |
| `<app-a>` (backend API) | yes / no | this PRD / a separate PRD (state the ID) / not applicable | <does it block this PRD's acceptance> |
| `<app-b>` | yes / no | same as above | <…> |
| `<app-c>` | yes / no | same as above | <…> |
| Agent card / tool | yes / no | same as above | <…> |

---

## 4. Acceptance criteria (`AC-N`, Given / When / Then)

> **Heading format (mandatory)**: `### AC-N <short name (6–12 characters)> | <one-line conclusion>`. The short name is taken from the backbone of the conclusion sentence and is **fixed in one place**; downstream consumers (ledger / contract / uat checklist / tests / reports / evidence file names) copy it verbatim and MUST NOT invent an alias.
> Every AC MUST be **automatable**: give **concrete expected values** (status code, `code` field value, field name, type, count, order, copy keywords). Avoid unassertable wording such as "correct", "normal" or "reasonable".
> For UI / mobile / card ACs, write **user-observable behaviour** in the **Then** (element appears / copy keyword / page navigation / card pops up and its fields); mark the assertion method when it can be automated, and route the rest to the §6 product acceptance checklist.
> The "corresponding test case" column is filled in by the test role, named like `TC-<ID>-01`.

### AC-1 <short name> | <one-line conclusion>

- **Given** <precondition, including concrete data>
- **When** <trigger action, including the request method and inputs>
- **Then** <assertable expected result>
- **Verifiability elements** <see the checklist below, give a value for each item>
- **Corresponding test case**: `TC-<ID>-01`

### AC-2 <short name> | <one-line conclusion>

- **Given** <precondition>
- **When** <trigger action>
- **Then** <assertable result>
- **Verifiability elements** <…>
- **Corresponding test case**: `TC-<ID>-02`

### AC verifiability elements (missing one item judges the AC unqualified; test has the right to reject it)

1. **Boundary four elements** (for anything involving a threshold / time window / quantity limit): one point inside (should pass), one point outside (should be rejected), one point at each end (closed interval), one second / one unit outside each end (should be rejected).
2. **Explicit decision granularity**: state "minute-level / second-level / millisecond-level"; never write only "inclusive of the endpoints".
3. **Platform-difference declaration**: any AC that depends on runtime behaviour (JSON library, filesystem, time zone, encoding, native API, memory model) MUST state "whether desktop / unit-test and device behaviour agree"; where they disagree it MUST give a criterion that catches it in the desktop environment.
4. **Numeric semantics**: for estimates / conversions, state whether the value is a **measured value** or an **estimated fallback value**.
5. **Threshold criteria carry their own resolvability**: any AC with a **threshold + statistic** (median / ratio / percentile) MUST state at least one of — ① minimum sample size / minimum repetition count; ② a proof that "measurement step < decision margin"; ③ if neither can be given ⇒ it MUST NOT serve as a stop-point criterion and may be an observation item only.

---

## 5. Boundaries and exceptions (`E-N`)

| # | Scenario | Expected behaviour | Assertable point | Corresponding test case |
| --- | --- | --- | --- | --- |
| `E-1` <short name> | <empty data / overlong / duplicate / privilege escalation / network interruption / concurrency> | <expected behaviour> | status code / `code` / `data` | `TC-<ID>-E01` |
| `E-2` <short name> | <…> | <…> | <…> | `TC-<ID>-E02` |

> **Every boundary also needs a 6–12-character short name**, reused by the uat checklist and the evidence file names.
> Every multi-statement write operation MUST exhibit **atomicity** (a failure produces no partially written intermediate state) — this is an assertable business constraint.
> Error-code discrimination: `403` = no permission to access this resource; `409` = has permission but this operation is not allowed for any authorised subject; `400` is reserved for invalid inputs.
> **ID namespace**: `E-N` = boundaries / exceptions (the only namespace that may be referenced by the ledger and test case names); errata always use `ER-N` and MUST NOT be mixed with `E-N`.

---

## 6. Product acceptance checklist

> Business language, which product can follow click by click. Each item corresponds to an AC number above; the "corresponding AC" column writes `short name (AC-N)`.
> This checklist is the input of uat acceptance; the uat checklist itself is produced separately by pm before acceptance starts and merges the criteria of this table.

| # | Steps (product view) | Expected observation | Corresponding AC |
| --- | --- | --- | --- |
| 1 | <step> | <observable result> | <short name> (AC-1) |
| 2 | <step> | <observable result> | <short name> (AC-2) |

---

## 7. Pending items ([pending human confirmation])

> Holds only ambiguities **newly arisen** after the requirement check (triggered by a new ruling / introduced by a new app), each annotated with its source. `R-NN` items the human already ruled on in the check **MUST NOT** reappear as Q.
> **Convergence requirement**: the total number of `Q` **MUST decrease or stay flat**. **No fabrication**: when the semantics are unclear, always list it here and wait for the human's ruling.
> For an `R-NN` judged "deviation / not implemented" in the design notes, if the semantics must change, its ruling MUST flow back into this table; never decide it on your own.

| # | Pending question | Impact scope | Suggested options | Source | Status |
| --- | --- | --- | --- | --- | --- |
| `Q-1` | <question> | <impact> | **A**… **B**… | <source> | pending |

> **Unfrozen criteria MUST NOT enter tests**: undecided wording in this PRD such as "pending Q-x ruling" / "or HTTP" MUST be reduced to zero before it enters tests.

---

## 8. Contract pointers

| Item | Content |
| --- | --- |
| Contract file | `docs/process/contracts/<ID>.md` |
| Endpoint / entity list | <list item by item; mark every endpoint with `alignment`: `keep` (keep the current state) / `change` (current → target, differences mandatory) / `new` (newly added)> |
| Permission codes | <list **all** permission codes used by this PRD in one place for Gate1 to check; format `{module}:{resource}:{operation}`> |
| Data contract | <entity / field / type / constraint / relation; describe the contract layer only, no SQL / DDL / index implementation / migration plan> |
| Testability clauses | <for any clause such as "a process-callable entry point MUST be exported", an import path reachable from the test side MUST be given right next to it> |

---

## 9. Design-notes pointers

| Item | Content |
| --- | --- |
| Design-notes file | `docs/process/prd/<ID>-design.md` |
| `R-NN` alignment conclusion | <implemented N / deviation M / not implemented K; item by item in that file's alignment table> |
| Deviations and unimplemented items | <list them with the reason and suggested disposition, if any; write "none" otherwise> |

> Gate1 reviews three artifacts at once: PRD + contract + design notes. **If the design notes fail to match `R-NN` item by item, it MUST NOT be released.**

---

## 10. Dependencies and risks

| # | Type | Content | Impact |
| --- | --- | --- | --- |
| `D-1` | Dependency | <dependency> | <impact> |
| `R-1` | Risk | <risk> | <impact> |

---

## 11. Change log

> **Gate field values are never altered** (they record the historical fact "it really passed at the time").
> "A single AC is voided" = the delivery scope only shrinks ⇒ do not roll back the status; follow the process retro-trace (mark removal / supersede + sync the ledger + delete or change the tests), and **it MUST leave a trace**.
> "AC semantic change" (a new requirement nobody has reviewed appeared) ⇒ `status` falls back to `frozen`, rebuild the criteria, re-judge the gates, and **the currently unjudged object goes into the note, not into the value**.

| Version | Date | Author | Change | Status transition |
| --- | --- | --- | --- | --- |
| 1 | <YYYY-MM-DD> | <role> | First draft | — → draft |
