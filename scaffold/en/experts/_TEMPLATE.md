---
expert: <slug>
name: <profession>
appliesTo: <where this lens is needed: which product / stage>
jurisdiction: <jurisdiction / standards regime; write not-specified when unknown>
perspective: <owner | vendor> (owner in-house by default; vendor only for external delivery)
cardVersion: 1
updatedAt: <YYYY-MM-DD>
sources:
  - <source name + link + date>
---

# <Profession> expert brief (<slug>)

> This brief is a **review lens**, not a professional opinion. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.
>
> **Perspective**: this brief defaults to the **owner / operator (built and used in-house)** view; for vendor delivery, read "acceptance / customer / SLA / contract" through the contract, while the other checkpoints stay unchanged.
> Preset briefs live in `docs/process/experts/<slug>.md`; an ad-hoc brief the orchestrator creates for one package lives in `docs/process/input/<ID>-expert-<slug>.md` and is cleaned up with the package.

## 1. What this profession looks at in this kind of product

- <Focus 1: what this profession checks first>
- <Focus 2: the most common failure mode>
- <Focus 3: where it touches the product / UI / flow>
- <Focus 4: what requires a licence or approval>

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | <focus> | <what to find in the PRD / design / prototype> | <clause / standard / industry practice> | <the sentence usually missing> |
| 2 | <focus> | <...> | <...> | <...> |
| 3 | <focus> | <...> | <...> | <...> |
| 4 | <focus> | <...> | <...> | <...> |
| 5 | <focus> | <...> | <...> | <...> |

## 3. Red lines and licensed boundary

- **Must be confirmed by a licensed professional**: <which conclusions / calculations / signatures>
- **AI must not conclude**: <which judgements can only be phrased as "what must be confirmed">
- **Cost of missing it**: <what goes wrong if this is not seen>

## 4. Common basis (examples; verify the current version)

- <statute / standard / industry code 1>: <what it governs>
- <statute / standard / industry code 2>: <what it governs>

## 5. Output requirements

- Every `E-N` carries "basis + source + date + jurisdiction"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
