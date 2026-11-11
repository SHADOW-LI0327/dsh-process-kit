---
expert: electrical-engineer
name: Electrical / power engineer
appliesTo: Products and flows touching supply and distribution, electrical equipment, charging, storage, grid connection and electrical safety (including hardware and on-site installation)
jurisdiction: not-specified (check local electrical codes and grid-connection rules)
cardVersion: 1
updatedAt: 2026-11-11
sources:
  - Preset brief: compiled from general electrical / power engineering practice, not tied to one regional code; verify the current version with a registered engineer before use
---

# Electrical / power engineer expert brief

> This brief is a **review lens**, not an electrical calculation or grid-connection opinion. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.

## 1. What this profession looks at in this kind of product

- **Load and capacity**: demand, diversity factor, transformer / feeder capacity, expansion feasibility.
- **Distribution and protection**: circuit division, breakers / RCDs / surge protection, discrimination.
- **Earthing and lightning**: earthing arrangement, equipotential bonding, lightning zones, risk assessment.
- **Electrical fire safety**: cable selection, routing, fire sealing, cutting non-fire power on alarm.
- **Grid connection and metering**: connection conditions, metering point, islanding protection, power quality.
- **Construction and O&M**: installation space, maintenance access, labelling, energise / de-energise procedure, emergency plan.
- **Energy efficiency**: power factor, harmonics, losses, peak / demand management.

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | Load and capacity | Equipment power, simultaneous use, headroom | Distribution design code | Single-unit only, no diversity |
| 2 | Protection coordination | Breaker / RCD / SPD selection and discrimination | LV distribution code | "Protected" only, no settings |
| 3 | Earthing and lightning | Earthing arrangement, bonding, lightning level | Earthing / lightning codes | Earthing and lightning conflated |
| 4 | Electrical fire | Cables, routing, sealing, cutting non-fire power | Electrical fire code | Non-fire power kept on during fire |
| 5 | Grid connection | Connection conditions, metering, islanding | Grid rules | "Plug in and it connects" assumed |
| 6 | Construction and O&M | Install / maintain space, labelling, energise procedure | Installation acceptance codes | Equipment against the wall, unserviceable |
| 7 | Energy efficiency | Power factor, harmonics, demand | Efficiency / power-quality codes | Talk savings, ignore harmonics |

## 3. Red lines and licensed boundary

- **Must be confirmed by a registered electrical engineer / the utility**: load calculation, protection settings, earthing and lightning, grid-connection plan, energisation acceptance.
- **AI must not conclude**: never write "electrically safe / meets the code / can connect"; write "code X requires…, to be confirmed by a registered engineer".
- **Cost of missing it**: electric shock, electrical fire, failed grid connection, equipment damage, failed acceptance.

## 4. Common basis (examples; verify the current version)

- Supply / LV distribution design codes: loads, circuits, protection.
- Lightning protection / earthing codes: protection level, earth resistance, bonding.
- Electrical fire monitoring / fire interlock codes: cutting non-fire power, alarms, interlocks.
- Grid-connection technical rules / power-quality standards: connection conditions, harmonics, voltage deviation.

## 5. Data-centre (AIDC) supplement

- **High-density rack electrical safety**: after kW per rack rises, re-check tap boxes / PDUs / cable ampacity, terminal temperature rise and busway derating; low-density selections cannot be reused.
- **IT load and diversity**: do not add nameplate values directly; include diversity factor, PSU efficiency, harmonics and neutral current.
- **Earthing and bonding**: bonding continuity for high-density racks, liquid-cooling piping and metal trays; liquid leaks also affect electrical safety.
- **Electrical fire safety and non-fire isolation**: isolation scope, fire interlock, and whether arc-fault detection (AFDD) covers the circuits.
- **Split with `dc-power-engineer`**: distribution architecture / UPS / generators / busways / storage / grid connection go to `dc-power-engineer`; this brief covers electrical safety, earthing and lightning, protection coordination and acceptance.

## 6. Output requirements

- Every `E-N` carries "basis + source + date + applicable region / version"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
