---
expert: hvac-engineer
name: HVAC / cooling engineer (data centre)
appliesTo: Cooling sources, air and liquid cooling, airflow, PUE / WUE and thermal management in data centres / AI data centres
jurisdiction: not-specified (check the local HVAC codes and vendor requirements)
cardVersion: 1
updatedAt: 2026-11-11
sources:
  - Preset brief: compiled from general data-centre HVAC practice, not tied to one edition; verify the current codes and vendor requirements before use
---

# HVAC / cooling engineer expert brief

> This brief is a **review lens**, not a thermal calculation or plan-review opinion. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.
>
> **Perspective**: this brief defaults to the **owner / operator (built and used in-house)** view; for vendor delivery, read "acceptance / customer / SLA / contract" through the contract, while the other checkpoints stay unchanged.

## 1. What this profession looks at in this kind of product

- **Cooling source and redundancy**: chillers / cooling towers / heat exchangers / heat reuse, N+1 or 2N, thermal storage and emergency cooling.
- **Air vs liquid cooling**: direct-to-chip / immersion / spray, CDU, manifolds, quick disconnects, leak detection; which loads justify liquid cooling.
- **Temperature and water quality**: supply / return temperature, flow, differential pressure, water quality (conductivity / bacteria / particles), condensation and freeze protection.
- **Airflow**: hot / cold aisles, blanking, underfloor supply, local hot spots, rack inlet temperature.
- **Efficiency**: PUE / pPUE / WUE definitions, measurement boundary, design vs measured values.
- **Serviceability**: maintenance space for valves / filters / pumps / CDUs, bypass and switchover.

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | Cooling redundancy | Chiller / pump / tower redundancy and switchover | GB 50174 / design codes | "N+1" only; no switchover time or single point |
| 2 | Liquid-cooling fit | Which racks go liquid, CDU location, leak detection and drainage | Vendor requirements / industry practice | Everything liquid-cooled; retrofit cost ignored |
| 3 | Water quality and condensation | Water metrics, make-up, filtration, dew-point control | Liquid-cooling codes / vendor requirements | "Deionised water" only; no monitoring |
| 4 | Airflow | Aisles, blanking, supply / return, hot spots | ASHRAE / design codes | Average temperature only; hot spots missed |
| 5 | PUE definition | Measurement boundary, IT load definition, design vs measured | Industry definitions | Design PUE sold as a measured promise |
| 6 | Serviceability | Maintenance space, bypass, switchover, spares | Operations practice | Equipment against the wall; unserviceable |
| 7 | Fire interlock | Smoke exhaust, post-suppression ventilation, cutting non-fire power | Fire codes | Cannot exhaust or restart after suppression |

## 3. Red lines and licensed boundary

- **Must be confirmed by a registered HVAC / refrigeration engineer**: cooling scheme, hydraulic calculation, fire interlock, smoke exhaust, acceptance.
- **AI must not conclude**: never write "PUE reaches 1.2 / complies with the code"; write "under condition X it should…, to be confirmed by a registered engineer".
- **Cost of missing it**: local overheating and throttling, liquid leaks, missed PUE targets, rework at acceptance.

## 4. Common basis (examples; verify the current version)

- GB 50174 "Data centre design code": temperature / humidity, cooling, airflow.
- GB 50736 "Design code for heating, ventilation and air conditioning of civil buildings": sources, air systems.
- ASHRAE TC 9.9: data-centre thermal environment and liquid-cooling guidance.
- Liquid-cooling industry codes / vendor manuals (cold plate, immersion, CDU): water quality, interfaces, leaks.

## 5. Output requirements

- Every `E-N` carries "basis + source + date + applicable edition"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
