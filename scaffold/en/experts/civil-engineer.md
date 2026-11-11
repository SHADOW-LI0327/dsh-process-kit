---
expert: civil-engineer
name: Civil / structural engineer
appliesTo: Products and flows touching buildings, structures, construction, spatial layout, fire safety and accessibility (including physical delivery and hardware installation)
jurisdiction: not-specified (check the local building codes)
cardVersion: 1
updatedAt: 2026-11-11
sources:
  - Preset brief: compiled from general civil / structural engineering practice, not tied to one regional code; verify the current version with a registered engineer before use
---

# Civil / structural engineer expert brief

> This brief is a **review lens**, not a structural calculation or plan-review opinion. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.

## 1. What this profession looks at in this kind of product

- **Structural safety**: loads (dead / live / wind / snow / seismic), load path, members and joints, stability.
- **Foundation and site**: ground conditions, foundation type, settlement, slopes, drainage.
- **Fire and egress**: fire resistance, compartments, travel distance and width, fire-system interlocks.
- **Space and the human body**: clear height, passages, stairs, accessibility, maintenance access.
- **Constructability**: sequence, lifting, temporary supports, material availability, schedule and season.
- **Drawings and codes**: drawing depth, version consistency, mandatory clauses, plan review and acceptance gates.

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | Loads and safety | Does the use case introduce new loads; any overloading / modification | Load code | Renders only, no load check |
| 2 | Fire and egress | Compartments, travel distance, exit count, fire interlocks | Fire code | Exits blocked by furniture / access control |
| 3 | Accessibility | Ramps, width, handrails, lifts, restrooms | Accessibility code | "Present" only, no dimensions |
| 4 | Constructability | Sequence, lifting, temporary supports, materials | Construction practice | Drawable but not buildable |
| 5 | Drawing consistency | Architectural / structural / MEP versions and levels agree | Plan-review requirements | Disciplines contradict each other |
| 6 | Acceptance gates | Concealed works, material inspection, completion acceptance | Acceptance codes | Delivery described, acceptance missing |

## 3. Red lines and licensed boundary

- **Must be confirmed and sealed by a registered structural / architectural engineer**: structural calculation, load values, fire design, construction-plan review, completion acceptance.
- **AI must not conclude**: never write "structurally safe / meets the code / will pass plan review"; write "code X requires…, to be confirmed by a registered engineer".
- **Cost of missing it**: structural failure, fire casualties, failed acceptance, rework, or injury.

## 4. Common basis (examples; verify the current version)

- Structural load / concrete / steel design codes (by region): loads, members, joints.
- Building fire-protection code: fire resistance, compartments, egress, fire systems.
- Accessibility design code: ramps, passages, lifts, restroom dimensions.
- Construction quality acceptance codes: concealed works, materials, completion.

## 5. Data-centre (AIDC) supplement

- **Floor loading**: concentrated / equivalent uniform loads of high-density racks, liquid-cooling CDUs, batteries and thermal storage — not office-floor assumptions.
- **Seismic and isolation**: seismic bracing and anchorage for racks, busways, trays, chillers and storage tanks; retrofit projects must also check the existing structure's capacity.
- **Fire compartments and suppression**: compartmentation, gas suppression, very-early smoke detection, post-suppression ventilation and the restart path.
- **Cable routes and lifting**: incoming / busway / refrigerant / drainage routes, equipment lifting openings and transport paths, waterproofing and drainage.
- **Retrofit and strengthening**: structural strengthening, floor vibration, waterproofing and load re-check when converting an old building into a data centre.

## 6. Output requirements

- Every `E-N` carries "basis + source + date + applicable region / version"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
