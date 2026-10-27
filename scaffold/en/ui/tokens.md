# UI design tokens (generic defaults)

> **This is a fallback, not a claim.** Its only reason to exist: a generic role does not have this project's visual language, and without a fallback it **improvises a new one every time** — and an improvised design system looks amateur.
> **"Tidiness" comes from system, not from taste.** This table is how that "system" gets frozen.
> Every contrast value in the table is **computed**, not estimated — take them and use them.

## Priority (hard rule)

1. The file `PROJECT.md` §4 "**UI project tokens**" points at (the project's existing theme / design tokens / design system package)
2. The public `props` and style conventions of the project's existing component library
3. **This file**

**Found 1 or 2 ⇒ copy it, do not invent.** Neither exists ⇒ use this file, and **state "default tokens are used"** in the delivery.

**Mixing is forbidden**: inside one package you MUST NOT copy part of the project tokens and use defaults for the rest — that is worse than all-default and creates two coexisting languages.
**On conflict**: when the project tokens disagree with this file ⇒ **the project wins, and stop and report it** (it may mean this file should be updated).

> **⑩ verifies "did you copy the tokens" for you, but only down to the theme layer** — once "UI project tokens" is configured,
> gate ⑩ extracts a palette from the token source and requires **all primary on-screen colours** (those covering ≥0.5% of the canvas) to be derivable from it
> (two palette colours may be composited at any α). It catches hard failures like "a whole different palette was used" —
> in a measured case, pairing a screen of a dark default theme with a light project standard made ⑩ immediately name `#161b22` (56.7%) and other primary colours.
>
> **It does not cover**: colours below 0.5%, i.e. **the fine-grained colours of small text, strokes and icons**.
> So "⑩ is green" **does not mean** "every text colour is compliant" — that layer is backed by **⑧ contrast** (judged by measured rendering).
> The two divide the work, they do not replace each other: **⑩ covers "did you use your palette", ⑧ covers "is this colour legible".**

---

## 0. Four iron rules (read this before the rest)

1. **Units**: the font size unit is point, **scaled to pixels by the document's ppi**. To get `1pt = 1px`, the document resolution **must be 72 ppi**. Set to 144, 13pt renders as 26px and all text is doubled inside 1× spacing — the most common cause of "text crammed together".
2. **Fill colours are normalised floats**: batch fill interfaces want a `0.0–1.0` float array. Feeding `0–255` integers **reports no error and silently turns white** — a silent failure, and the most time-consuming kind.
3. **Two-tier semantic colours**: **one colour cannot serve as both background and text**. Use the "fill tier" (low transparency) for fills and the "text tier" (the brighter one) for text. Same colour on same colour gives only **2.97:1** on `accent` and **3.91:1** on `danger` — it will fail.
4. **Measure contrast, do not eyeball it**: once laid out, measure the real contrast with a browser / tool. **"Text you cannot read is text that does not exist"**, and this is quantifiable.

---

## 1. Spacing scale (8px grid, 4px smallest sub-step)

| Token | Value | Typical desktop use | Typical mobile use |
|---|---|---|---|
| `space-1` | 4px | Between icon and text | Between icon and text |
| `space-2` | 8px | Adjacent elements | Adjacent elements |
| `space-3` | 12px | Inline grouping | Inline grouping |
| `space-4` | 16px | Small spacing inside a card | **Page left/right margin (mobile first choice)** |
| `space-5` | 20px | — | Card padding |
| `space-6` | 24px | **Card padding (desktop first choice)** | Block spacing |
| `space-8` | 32px | Between blocks | — |
| `space-10` | 40px | **Content-area margin (desktop first choice)** | — |
| `space-12` | 48px | Large block separation | Large block separation |
| `space-16` | 64px | Page-level whitespace | — |

> **Do not copy desktop margins onto mobile**: the screen is only 390px wide, and a 40px margin eats a fifth of it. Use `space-4`(16) or `space-5`(20).
> Use only the values in the table. When you need an in-between value such as `20px`, look for a substitute in the table first; add one only when it truly does not fit, and state the reason.

## 2. Font-size scale

| Token | Value | Desktop use | Mobile use |
|---|---|---|---|
| `text-2xs` | 11px | — | Badges / tiny secondary text (**avoid it: 11px CJK text is hard to read**) |
| `text-xs` | 12px | Table headers, pills, secondary notes | Secondary notes / bottom-nav labels |
| `text-sm` | 13px | Card labels / secondary information | Secondary list rows |
| `text-base` | 14px | Table rows | — |
| `text-body` | 15px | Body text | — |
| `text-md` | 16px | Emphasised body text | Primary list rows |
| `text-lg` | 17px | Sub-headings | **Mobile body text (iOS baseline)** |
| `text-xl` | 20px | — | Section headings |
| `text-2xl` | 24px | Block headings | Page titles |
| `text-3xl` | 30px | Key figures | **Key figures / large titles (mobile first choice)** |
| `text-4xl` | 34px | — | Extra-large numbers (ring centres, amounts) |

> **Narrow screens must step down**: 30px does not fit on a mobile screen. In **side-by-side small cards** (3 cards / content width about 358px)
> each net width is only 70–110px, so key figures use **24px** (`text-2xl`); **ring centres** use **24px** (with an outer diameter of 96 and a stroke of 8
> the inner diameter is only 80, so 34px would hit the stroke). **30–34px is only for a full-row element.**
>
> **Modernity comes from "font-size contrast", not from the number of sizes**: body 15–17 against key figures 24–34 opens about a 1.5–2×
> gap, and only then does the hierarchy hold. Using 14–16 everywhere looks as flat as a spreadsheet.

## 3. CJK tracking mapping (**the most easily overlooked item, and the one that most affects the look**)

Half of the gap that font rendering cannot express is in letter-spacing. **CJK text needs positive tracking, Latin does not**; in mixed text, take the value for the CJK font size.

| Font size | tracking (1/1000 em) | Equals |
|---|---|---|
| 12px | **80** | 0.08em |
| 13px | **60** | 0.06em |
| 14px | **45** | 0.045em |
| 15px | **40** | 0.04em |
| 17px | **30** | 0.03em |
| 20px | 24 | 0.024em |
| 24px | 22 | 0.022em |
| 26px | **20** | 0.02em |
| ≥30px | 0 | the larger the size, the less it is needed |

> **The smaller the text, the more tracking it needs**. 12px CJK without tracking smears into a blur — exactly the most common cause of "text crammed together".
> For a font size missing from the table, take the **next smaller step** (better more than less).

## 4. Semantic colours: **two tiers per colour** (this is the easiest trap)

The **fill tier** is for backgrounds (pills / labels / selected-state backplates), the **text tier** is for text. Both tiers are in the table and their **contrast has been computed**.

| Semantic | Fill tier (background) | Text tier (text colour) | Text tier on pill background | Text tier on surface |
|---|---|---|---|---|
| `accent` | `#1f6feb` | `#79c0ff` | **7.21:1** | 8.89:1 |
| `success` | `#3fb950` | `#7ee787` | **7.97:1** | 11.26:1 |
| `warn` | `#d29922` | `#e3b341` | **6.32:1** | 8.89:1 |
| `danger` | `#f85149` | `#ff7b72` | **5.38:1** | 6.86:1 |
| `muted` | `#6e7681` | `#9ba7b4` | — | **7.07:1** |

**The standard recipe for pills / labels** (follow it and you will not fail):

```
background = fill tier @ alpha 0.18 ~ 0.20, composited on surface
text = text tier (solid colour, no transparency)
```

> **⚠ Counter-example (measured)**: background `success` @0.22 and text also `success` — nominally it computes to 4.63:1,
> which looks just enough, but **12px CJK strokes are only 1px wide and antialiasing washes out even the connected pixels**; the measured
> brightest pixel was only `#3aa84b` and the real contrast dropped to **3.9:1**. Colour pairs of this kind are always ❌ at gate ⑧.
> **Conclusion: small text must keep a contrast margin**, do not ride along at 4.5 — every value in the table keeps a margin of 1.5× or more.
>
> **⚠ Digits fare worse than CJK**: **12px digits / Latin** strokes are thinner than CJK, and the measured brightest pixel at ⑧ was only **4.61:1**
> (riding along at 4.5). **Digit-type small text should be at least 13px**, or use the brighter tier directly. **Do not reserve the margin for CJK only.**

### ⚠ Small text needs "one step darker" — meeting the nominal value ≠ meeting it when rendered

**For the same colour, the smaller the font size, the lower the contrast ⑧ measures.** This is not the gate being too strict, it is real physics:
at small sizes the antialiased pixels are a larger share of the strokes, more background colour is mixed into the sampled effective pixels, and so **the rendered contrast is lower than the value computed from the nominal colour**.

Measured (same real project standard, same machine):

| Text colour | Background | Nominal computed | **Measured at 12–13px rendering** |
|---|---|---|---|
| `#5A6B85` (the muted tier in the standard) | `#FFFFFF` | **5.42:1** ✅ | **≈4.13:1** ❌ |
| `#5A6B85` | `#F7FBFF` | 5.21:1 ✅ | ≈4.0:1 ❌ |

**Compliant nominally, non-compliant when rendered — a gap of about 1.3.** This is exactly the root cause of "the standard clearly specifies a compliant colour, yet ⑧ judges the drawn result red".

**Rules**:

1. **Do not use the muted / secondary tier for 12–13px text**; use the primary text tier (`text`) directly. Save the secondary tier for **≥14px**.
2. Judge always by **⑧'s measured rendering**, **do not compare nominal colour values against 4.5**: nominal values are for coarse screening only, and ⑧ must still run after screening.
3. Conversely, this also explains why text on `-soft` pale backgrounds almost always fails: the pale background itself already eats part of the margin (see "the Tag/Callout colours a standard provides may themselves fail" below).

> **If the project's own design standard provides this colour set** (L0) and it fails on small text: **copy the standard + declare the deviation explicitly**,
> do not secretly change the colours and do not fall back to the generic defaults. The right move is "semantic colours for backgrounds/dots/graphics only, text switches to the primary text tier",
> and state in the delivery notes which clause was deviated from and why.

### ⚠ The project's Tag / Callout colours **may themselves fail AA**

Real project design standards often pair "dark text + a pale tint of the same hue". **That pair frequently fails**; measured against one real standard:

| Colour pair from the standard | Contrast |
|---|---|
| `semantic-d` on `semantic-soft` (teal) | **2.62:1** |
| `semantic-d` on `semantic-soft` (orange) | **2.62:1** |
| `semantic` on `semantic-soft` (red) | **3.13:1** |
| `semantic-d` on `semantic-soft` (amber) | **3.30:1** |
| `primary` on `primary-050` | **4.43:1** |

**This is not you copying it wrong; it is a problem in the standard itself.** Handle it as above: **copy the standard for backgrounds/dots/graphics, switch text to the primary text tier**,
and declare it in the delivery notes. **Do not switch the artifact to the generic default colours just because ⑧ went red** — that loses project-token consistency at the same time (⑩ would catch it).

### Fill-tier α reference table (**consolidated into one table; stop writing your own**)

This is the thing that most easily falls apart between recipe and implementation — 0.18 / 0.20 / 0.35 written casually here and there, until nobody can say why.

| Use | α | Why this value |
|---|---|---|
| **Text background** (pills / labels / selected-state backplate) | **0.18 ~ 0.20** | The background must be weak enough not to compete with the text; any darker starts to eat contrast |
| **Graphic fill** (bar charts / progress arcs / area charts) | **0.35 ~ 0.45** | Graphics have no glyphs to lean on, and too pale is **invisible**; that this tier is clearly darker than the text background is **deliberate** |
| **Emphasis graphic** (current item / highest value / selected icon) | **1.0 (solid)** | **Emphasise only one thing** per screen; emphasising everywhere means emphasising nothing |
| **Track / baseline / separator** (`border-strong`) | **0.10 ~ 0.14** | Reference only, does not participate in reading |
| **Skeleton screens** | **0.06 ~ 0.08** | Half as pale again as a stroke, so it is not confused with real content |

### Neutral colours and surfaces

| Semantic | Value | Use |
|---|---|---|
| `bg` | `#0d1117` | Page background (the very bottom) |
| `base` | `#161b22` | Regular panels / cards |
| `elevated` | `#1c2129` | Raised surfaces (popovers / floating cards) |
| `overlay` | `#22272e` | Highest layer (modals / menus) |
| `border` | `rgba(255,255,255,0.08)` | Regular strokes |
| `border-strong` | `rgba(255,255,255,0.14)` | Emphasised strokes / separators |
| `text` | `#e6edf3` | Primary text (14.64:1 on base) |
| `muted` | `#9ba7b4` | Secondary text (7.07:1 on base) |

> **Most of "modern" is "fewer strokes, more layering"**: the 2020 approach drew 1px solid borders everywhere; today's approach
> separates layers by **surface brightness difference** (bg → base → elevated), uses strokes only where **grouping** is needed, and uses **low-opacity white** rather than solid grey.
> Solid grey strokes look dirty and harsh on a dark background.

## 5. Radii

| Token | Value | Use |
|---|---|---|
| `radius-xs` | 4px | Badges |
| `radius-sm` | 8px | Small controls, labels |
| `radius-md` | 12px | Inputs, secondary buttons |
| `radius-lg` | 16px | Cards / panels |
| `radius-xl` | 20px | Large cards / popovers (**mobile card first choice**) |
| `radius-2xl` | 24px | Top corners of bottom sheets |
| `radius-full` | half the height | Pills, avatars |

> **Radius must be proportional to size**: a 16px radius on a 40px-tall control is "too round"; on a 300px-wide card it is just right. Mobile is generally rounder than desktop.

## 6. Control heights and touch sizes

| Token | Value | Use |
|---|---|---|
| `control-sm` | 32px | Compact controls |
| `control-md` | 36px | Regular inputs |
| `control-lg` | 44px | Primary buttons |
| `control-xl` | 52px | Mobile primary buttons |
| **`touch-target`** | **44×44px** | **The minimum size of any tappable element (hard floor, including the tappable area of an icon)** |

> **Touch size is a hard floor, not aesthetics**: an icon may look 20×20, but **the tappable area must be ≥44×44**, otherwise it cannot be hit on a real device.

## 7. Mobile baseline (the generic recipe only covered desktop; this adds it)

| Item | Value | Note |
|---|---|---|
| Canvas | **390 × 844 @ 72 ppi** | Typical iPhone logical points; Android commonly 360×800 |
| Safe areas (top / bottom) | **44 / 34** | Notch and Home Indicator; content must not be pushed into them |
| Page left/right margin | **16px** (`space-4`) | A narrow screen cannot use the desktop 40px |
| Card padding | **20px** (`space-5`) | Slightly tighter than the desktop 24 |
| Minimum tappable area | **44 × 44** | See §6 |
| Bottom tab bar height | **49 + 34 = 83**, top edge y=**760** | The bar occupies 760–809; 809–843 below it is the Home Indicator safe area |
| Top navigation bar height | **44 + 44 = 88** | Status bar 44 + navigation 44 (navigation area 44–88, vertical centre **66**) |
| List row height | **56** (single line) / **72** (two lines) | Below 48 it looks cramped and is easy to mis-tap |

**Baselines / centres of bar elements** (the desktop recipe gave a page-header baseline; mobile was empty before — now filled in):

| Element | Value | Note |
|---|---|---|
| Status-bar text baseline | **30** | 15px, starting at x=23 from the left; the icon group's right edge at x=367 |
| Navigation-bar title baseline | **70** | 17px centred (navigation area 44–88, centre 66) |
| Navigation-bar right action | icon 24×24, centre y=**66** | tappable area padded to **44×44** (right edge aligned at x=374) |
| Tab-bar icon | **20×20, top edge y=766** (centre 776) | 24×24 would burst the tappable column; 20 is enough for a mobile tab icon |
| Tab-bar text baseline | **802** (12px / tracking 80) | **Do not write 808** — 12px ink spans about 792–805, and 808 makes the ink cross the 809 safe-area boundary |
| Tab item tappable area | **the whole column ≈97.5 × 49 is the tappable area** | **Do not try to fit two 44-high targets into 49** (one icon, one label) — the vertical height simply is not enough; treat the whole column as one target, both directions ≥44 |
| Breakpoints | not applicable (single column) | A mobile page needs no breakpoints itself; declare them only when adapting tablets |

> **Single column first**: a mobile screen does one thing. Cramming a desktop multi-column / sidebar layout into 390px always breaks.

## 8. Order of use (not a rule, an order)

1. Fix **spacing and font size** first (they decide half the look), then colours.
2. Give every text layer its tracking per §3.
3. **Take colours from the two tiers of §4; never use one colour as both background and text**.
4. After laying out you **MUST open the HTML prototype and check it**: every `UI-NN` has `data-ui`, states are switchable, copy is verbatim, no external links; `check-ui-prototype` only guards handoff completeness, and whether it looks good is decided by the human.
5. Reversing the order (colours first, layout second) causes repeated rework.
