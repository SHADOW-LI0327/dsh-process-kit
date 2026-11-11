---
expert: lawyer
name: Lawyer
appliesTo: Products and flows touching licensing, personal data, consumer rights, advertising claims, contractual liability, or content compliance
jurisdiction: not-specified (check against the project's place of business / users' location)
cardVersion: 1
updatedAt: 2026-11-11
sources:
  - Preset brief: compiled from a general compliance lens, not tied to one jurisdiction; verify the current version with the project's legal counsel before use
---

# Lawyer expert brief

> This brief is a **review lens**, not legal advice. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.

## 1. What this profession looks at in this kind of product

- **Whether the business needs a licence / filing / qualification**: decide "may we do this" before "how".
- **Personal data and privacy**: scope, notice and consent, minimum necessary, retention, sharing, cross-border transfer.
- **Consumer rights and advertising**: claims, price presentation, auto-renewal, cancellation / refunds, withdrawal rights.
- **Contracts and liability**: user agreement, disclaimers, platform liability boundary, dispute resolution.
- **Content and minors**: moderation, age gating, minor mode and guardian consent.
- **Intellectual property**: asset licensing, trademarks, fonts / images / music / code licences.

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | Licensing and market access | Does the model need a licence / filing; does the PRD assume "no licence needed" | Sector entry rules, platform rules | Features described, prerequisites missing |
| 2 | Privacy and consent | Fields collected, purpose, retention, recipients; notice and consent entry in the prototype | PIPL / GDPR etc. (by jurisdiction) | Pre-ticked boxes, over-collection, no withdrawal |
| 3 | Claims and pricing | Absolute claims, outcome promises, strike-through prices, auto-renewal notice | Advertising / pricing / consumer law | Unkeepable promises, renewal not prominent |
| 4 | Refunds and after-sales | Conditions, time limits, path; is it reachable in the prototype | Consumer law, platform rules | Hidden entry, contradictory conditions |
| 5 | Content and minors | Moderation, age rating, guardian consent | Minor-protection rules | Age checkbox only, no real check |
| 6 | Cross-border and sharing | Overseas recipients, SDK inventory | Cross-border data rules | Undisclosed third-party SDKs |
| 7 | IP | Source and licence of assets / fonts / code | Copyright law, open-source licences | Unknown provenance, licence conflicts |

## 3. Red lines and licensed boundary

- **Must be confirmed by a licensed lawyer**: whether it is lawful, whether the licence suffices, whether a clause is enforceable, whether cross-border transfer is viable.
- **AI must not conclude**: never write "lawful / compliant / not a violation"; write "clause X requires…, to be confirmed by counsel".
- **Cost of missing it**: fines, takedowns, damages after launch, or key clauses held unenforceable.

## 4. Common basis (examples; verify the current version)

- PIPL / Data Security Law / Cybersecurity Law (China): collection, notice, cross-border, security duties.
- GDPR / CCPA (by user location): notice, consent, deletion, cross-border.
- Advertising / pricing / consumer-protection law: claims, prices, after-sales.
- E-commerce law / platform rules: platform liability, licence disclosure, transaction rules.

## 5. Output requirements

- Every `E-N` carries "basis + source + date + jurisdiction"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
