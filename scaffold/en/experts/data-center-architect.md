---
expert: data-center-architect
name: Data-center planning / process engineer
appliesTo: Planning, retrofit and expansion of AI data centres (AIDC); availability tiers, redundancy topologies, power density, space and phasing
jurisdiction: not-specified (check the local data-centre codes and certification regime)
cardVersion: 1
updatedAt: 2026-11-11
sources:
  - Preset brief: compiled from general data-centre planning practice, not tied to one edition; verify the current codes and certification requirements before use
---

# Data-centre planning / process engineer expert brief

> This brief is a **review lens**, not a design drawing or plan-review opinion. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.
>
> **Perspective**: this brief defaults to the **owner / operator (built and used in-house)** view; for vendor delivery, read "acceptance / customer / SLA / contract" through the contract, while the other checkpoints stay unchanged.

## 1. What this profession looks at in this kind of product

- **Availability tier and redundancy**: Tier / local class, N+1 / 2N, single vs dual path, fault domains and switchover paths.
- **Power density and rack layout**: kW per rack, hot / cold aisles, blanking panels, floor loading and clear height, maintenance space.
- **White space and expansion**: expandable rack count, power and cooling headroom, phased build and live expansion.
- **Multi-tenancy and zoning**: tenant isolation, separate metering, access zones, network and power boundaries.
- **Delivery interfaces**: civil / MEP / IT interfaces, cable routes and trays, fire and egress, acceptance boundaries.

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | Availability target | Does the PRD state the tier and failure scenarios; does the prototype show degraded / switchover states | GB 50174 / Uptime Tier / TIA-942 | "High availability" only; no redundancy or switchover |
| 2 | Redundancy topology | Are power / cooling / network at the same level; where is the single point | Same-level redundancy principle | Power 2N, cooling N+1 — the weak link is not marked |
| 3 | Power density | kW per rack, kW per module, high-density zones | Design codes / workload | Designed for old density; GPU racks do not fit |
| 4 | Space and loading | Rack count, clear height, floor loading, aisles | Building / structural codes | Racks drawn, loading and aisles not checked |
| 5 | Expansion and phasing | Expansion path, live-retrofit window, headroom | Planning practice | Built to the maximum; no room to add racks |
| 6 | Multi-tenancy | Isolation, metering, access control, network boundary | Business / compliance | Shared meter; cannot split the bill |
| 7 | Delivery interfaces | Civil / MEP / IT interfaces and acceptance | Acceptance codes | Disciplines do not line up |

## 3. Red lines and licensed boundary

- **Must be confirmed and sealed by a registered architect / engineer**: master plan, structure, fire, MEP design and plan review.
- **AI must not conclude**: never write "meets Tier IV / complies with GB 50174"; write "clause X requires…, to be confirmed by a registered engineer".
- **Cost of missing it**: tier shortfall, failed expansion, racks that do not fit, failed acceptance.

## 4. Common basis (examples; verify the current version)

- GB 50174 "Data centre design code": class, environment, electrical, cooling, fire.
- Uptime Institute Tier Standard / TIA-942: topology and redundancy tiers.
- GB 50016 "Building fire-protection code": compartments, egress, fire systems.
- GB 50462 "Data centre infrastructure construction and acceptance code": acceptance interfaces.

## 5. Output requirements

- Every `E-N` carries "basis + source + date + applicable class / version"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
