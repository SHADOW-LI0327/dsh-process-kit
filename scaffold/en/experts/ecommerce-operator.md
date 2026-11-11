---
expert: ecommerce-operator
name: E-commerce operator
appliesTo: Storefront / transaction / membership / marketing / fulfilment products, and any scenario with goods, prices, orders and after-sales
jurisdiction: not-specified (check platform rules and local consumer law)
cardVersion: 1
updatedAt: 2026-11-11
sources:
  - Preset brief: compiled from general e-commerce operations practice, not tied to one platform; verify the platform's current rules before use
---

# E-commerce operator expert brief

> This brief is a **review lens**, not a business commitment. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.

## 1. What this profession looks at in this kind of product

- **Goods and inventory**: SKU / variants / price / stock deduction / overselling / pre-sale and shipping time.
- **Pricing and promotions**: strike-through prices, discount stacking, threshold / coupon / flash sale, price protection, auto-renewal.
- **Conversion funnel**: impression → detail → add-to-cart → order → payment → repurchase; drop-off and event definitions at each step.
- **Fulfilment and after-sales**: shipping, logistics, delivery, returns, refunds, support tickets, disputes.
- **Payment and reconciliation**: channels, refunds to the original route, split settlement, statements, exception orders.
- **Risk and compliance**: fake orders / promo abuse / scalping, false claims, withdrawal rights, invoices.
- **Metric definitions**: GMV / AOV / conversion / refund rate / fulfilment time; numerator and denominator must be fixed.

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | Stock and overselling | Deduction timing, concurrency, rollback; out-of-stock / oversell handling in the prototype | Transaction consistency practice | Deduct on order only; concurrency oversells |
| 2 | Pricing and discounts | Stacking, priority, exclusivity, price protection; recomputable in the prototype | Platform rules / pricing law | Rules buried in copy, not recomputable |
| 3 | Funnel and events | Event definitions, deduplication, attribution window | Analytics practice | Inconsistent events, no reconciliation |
| 4 | Fulfilment time | Promised time, holidays, pre-sale, late compensation | Platform rules / consumer law | Unachievable promise, no fallback |
| 5 | Refunds and after-sales | Original-route refund, partial refund, shipping, dispute entry | Platform rules / consumer law | Deep entry, invisible status |
| 6 | Risk | Fake orders / promo abuse / scalping detection and handling | Risk practice | Purchase caps only, no device / behaviour signals |
| 7 | Metric definitions | Numerator / denominator / time window per metric | Operations analytics practice | Two reports, two numbers |

## 3. Red lines and licensed boundary

- **Must be confirmed by the operations owner / legal counsel**: whether a promotion is deliverable, whether platform rules allow it, whether claims comply.
- **AI must not conclude**: never promise GMV / conversion lift; never write "meets platform rules".
- **Cost of missing it**: oversell compensation, pricing incidents, platform penalties, unreconcilable statements, promotions drained by abuse.

## 4. Common basis (examples; verify the current version)

- E-commerce law / consumer-protection law: licence disclosure, withdrawal rights, after-sales liability.
- Advertising / pricing law: claims, strike-through prices, promotion presentation.
- Platform rules (Taobao / JD / Douyin / Pinduoduo etc.): shipping time, compensation, campaign entry.
- Invoicing and tax rules: invoices, returns and credit notes.

## 5. Output requirements

- Every `E-N` carries "basis + source + date + applicable platform / jurisdiction"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
