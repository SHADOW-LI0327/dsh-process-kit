---
expert: dcim-operations
name: Data-centre operations / DCIM engineer
appliesTo: Environmental monitoring, DCIM, alarms, capacity, change, work orders and SLA in AI data centres (AIDC)
jurisdiction: not-specified (check the project operations regime and compliance requirements)
cardVersion: 1
updatedAt: 2026-11-11
sources:
  - Preset brief: compiled from general data-centre operations and DCIM practice, not tied to one product; verify the project operations regime before use
---

# Data-centre operations / DCIM engineer expert brief

> This brief is a **review lens**, not an operations responsibility or SLA promise. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.

## 1. What this profession looks at in this kind of product

- **Collection and protocols**: Modbus / SNMP / BACnet / Redfish, polling intervals, store-and-forward, time sync.
- **Alarms and convergence**: severity, deduplication, suppression, root cause, on-call escalation, false-alarm rate.
- **Capacity ledger**: used and free racks / power / cooling / ports / IPs / storage.
- **Change and work orders**: approval, window, rollback, operation tickets, two-person review.
- **Inspection and emergency**: inspection items, spares, drills, emergency plans, incident review.
- **SLA and reporting**: availability definition, PUE / energy, tenant billing, audit trail.

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | Collection completeness | Device types, protocols, points, polling intervals | Device manuals / operations regime | Only some vendors integrated; blind spots unmarked |
| 2 | Alarm quality | Severity, dedup, suppression, escalation, false alarms | Operations practice | Alarm storms; on-call goes numb |
| 3 | Capacity ledger | Rack / power / cooling / port headroom | Operations practice | Current state only; no headroom |
| 4 | Change and rollback | Approval, window, rollback, two-person review | Change management | One-click action with no rollback |
| 5 | Emergency and drills | Plans, drills, spares, review | Operations regime | Plans exist; never drilled |
| 6 | SLA definition | Availability numerator / denominator, window | Contract / industry definitions | Two reports, two numbers |
| 7 | Permissions and audit | Roles, least privilege, operation trail | Compliance / audit | Shared admin account |

## 3. Red lines and licensed boundary

- **Must be confirmed by the operations owner**: SLA definition, change process, emergency plan, responsibility boundary.
- **AI must not conclude**: never write "SLA 99.99% / meets compliance"; write "under regime X it should…, to be confirmed by operations / compliance".
- **Cost of missing it**: missed alarms, change incidents, exhausted capacity, billing disputes, failed audits.

## 4. Common basis (examples; verify the current version)

- GB/T 51314 "Data centre infrastructure operation and maintenance standard": operations, inspection, emergency.
- Uptime Institute Operational Sustainability: operations maturity.
- ISO/IEC 20000 / ISO/IEC 27001: service management and information security.
- Local MLPS (multi-level protection scheme) requirements: permissions, audit, logs.

## 5. Output requirements

- Every `E-N` carries "basis + source + date + applicable regime / edition"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
