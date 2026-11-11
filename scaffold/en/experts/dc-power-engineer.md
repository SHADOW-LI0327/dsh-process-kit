---
expert: dc-power-engineer
name: Data-centre power-distribution engineer
appliesTo: Loads, distribution topology, UPS, generators, busways / PDUs, storage and grid connection in AI data centres (AIDC)
jurisdiction: not-specified (check the local distribution codes and utility requirements)
cardVersion: 1
updatedAt: 2026-11-11
sources:
  - Preset brief: compiled from general data-centre power practice, not tied to one edition; verify the current codes and utility requirements before use
---

# Data-centre power-distribution engineer expert brief

> This brief is a **review lens**, not a load calculation or grid-connection opinion. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.

## 1. What this profession looks at in this kind of product

- **Load and diversity**: IT load, cooling, lighting, losses; kW per rack / module / site; expansion headroom.
- **Distribution topology**: medium-voltage incoming, transformers, LV panels, UPS (N+1 / 2N / 2N+1), STS, busways, PDUs.
- **Generators and transfer**: generator capacity, paralleling, ATS / STS transfer time, fuel storage and exhaust.
- **Storage and grid connection**: storage type, connection conditions, islanding protection, demand management, peak-valley arbitrage.
- **Power quality**: harmonics, power factor, neutral current, voltage deviation, phase imbalance.
- **Metering and expansion**: sub-metering, tenant metering, expansion path, live-retrofit windows.

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | Load and diversity | kW per rack, diversity factor, losses, headroom | GB 50052 / design codes | IT load only; cooling and losses ignored |
| 2 | Redundancy topology | UPS / generator / transformer redundancy and single points | GB 50174 / Uptime Tier | "2N" written, but one utility feed shared |
| 3 | Transfer time | ATS / STS / UPS transfer and business impact | Vendor manuals / SLA | "Automatic transfer" only; no ms / s figure |
| 4 | Generators | Capacity, paralleling, fuel, exhaust, start time | Distribution codes | Generator cannot carry cooling |
| 5 | Storage and grid | Connection conditions, islanding, metering, fire | Grid rules / storage codes | "Plug in and it connects" assumed |
| 6 | Power quality | Harmonics, power factor, neutral, imbalance | Power-quality codes | Talk savings, ignore harmonics and neutral |
| 7 | Metering and expansion | Sub / tenant metering, expansion path, retrofit window | Operations practice | One master meter; cannot split the bill |

## 3. Red lines and licensed boundary

- **Must be confirmed by a registered electrical engineer and the utility**: load calculation, protection settings, generator paralleling, grid-connection plan, energisation acceptance.
- **AI must not conclude**: never write "2N is available / can connect / complies with the code"; write "under condition X it should…, to be confirmed by a registered engineer".
- **Cost of missing it**: overload trips, failed transfer, rejected grid connection, metering disputes, no expansion path.

## 4. Common basis (examples; verify the current version)

- GB 50052 "Code for design of power supply and distribution systems" / GB 50054 "Code for design of low-voltage distribution": loads, protection, distribution.
- GB 50174 "Data centre design code": power, UPS, generators, redundancy.
- GB/T 7260 (UPS) / GB/T 2820 (generators): equipment and paralleling requirements.
- Storage and grid-connection rules (by region): connection conditions, islanding protection, fire.

## 5. Output requirements

- Every `E-N` carries "basis + source + date + applicable edition"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
