# UI layout recipes (measured, verified starting points)

> This is not "the only correct design", but a **starting point measured against the visual tokens**: the numbers can be copied directly, or changed per project.
> Its value is that it **saves the round of rework that laying out from zero costs** — starting from a skeleton already known not to overlap, overflow or have asymmetric margins is far steadier than starting from a blank canvas.
> Every number carries a note on "why this value", so **when you change it you know what you are moving**.

## Generic skeleton (1280×800 desktop)

```
┌──────────────────────────────────────────────────────────────┐
│  sidebar 240px  │          content area (band)                │
│                 │   ← 40px margin →              ← 40px →     │
│  0 ────── 240   │   280 ───────────────────────── 1240         │
└──────────────────────────────────────────────────────────────┘
```

| Region | Value | Why |
|---|---|---|
| Canvas | 1280×800 | The desktop baseline. **The document ppi must be 72** (otherwise font sizes double, see the unit discipline in `tokens.md`) |
| Sidebar width | **240px** | Holds 4-character navigation plus icons with room to spare; narrower wraps, wider wastes |
| Content band `band` | **left 240 / right 1280** | That is "the sidebar's right edge → the canvas's right edge" |
| Content left/right margin | **40px each** | So the content area is x = **280 → 1240**, width **960** |
| Card padding | **24px** | Content is not flush against the edge, and it does not look empty |

> **Symmetric margins are the most easily missed item**: you write only the left margin and let the content stretch the right edge, and the result is 100px of whitespace on the right and only 40px on the left. **Fix the content area's left and right boundaries first, then fill inward** — steadier than the other way round.

## Page header

| Element | Anchor | Font size / tracking | Note |
|---|---|---|---|
| Title | `(280, baseline 76)` | 26px / tracking 20 | Laid out from the content area's top-left corner |
| Subtitle | `(280, baseline 106)` | 13px / tracking 60 | **30px** baseline offset from the title (about 17px net gap) |
| Primary button | `[1064, 56, 176, 44]` | radius 12 / text 15px | **right edge = 1240**, aligned with the content area's right boundary |

> **Button text centring must be corrected by measurement, not placed by estimated width**: the bounding box a producer exports rounds outward (176→177, 81→83), so computing from an estimated width is always 1–2px off. **Place first, then measure, then correct with `layer.translate`** — one closed loop and you are at 0.0px.

## Stat card group

| Item | Value | Why |
|---|---|---|
| Card size | **304 × 132** | 3 cards + 2 gaps of 24px = 960, exactly filling the content area |
| Card positions | y = **148**; x = **280 / 608 / 936** | `x = 280 + i × (304 + 24)` |
| Card radius / stroke | radius **14** / stroke 1px `border` | A radius of 14 is softer than 8 and more restrained than 20 |
| Label baseline | y = card top + **40** | Top padding 24 + one font-size height |
| Value baseline | y = card top + **88** | 48px from the label → about 16px net gap |
| Delta baseline | y = card top + **118** | 30px from the value → about 11px net gap |
| Text x | card x + **24** | Consistent with the padding |

> **The baseline gaps of the three text tiers inside one card (40 / 48 / 30) are where the net gaps come from**; they are not arbitrary: change a font size and you must recompute, otherwise a 30px font size crushes the label — the measured 144 ppi incident happened exactly like that.

## Table card

| Item | Value |
|---|---|
| Card | `[280, 308, 960, 452]`, radius 14 |
| Table header baseline | card top + **41** |
| Table header separator | card top + **68**, across the whole card |
| First row baseline | card top + **109** |
| Row pitch | **52px** |
| Column positions | task name 308 · status pill `[780, width 68]` · duration 940 · start time right-aligned to **1212** |

- **Status pill** = `68 × 26`, radius 13 (= half the height); **background = the semantic "fill tier" + `alpha 0.18`**, **text = the semantic "text tier" solid colour** (see `tokens.md` §4 — **do not use one colour as both background and text**, on `accent` that is only 2.97:1)
- Pill text baseline **= the row baseline** (pill `y = row baseline − 17`, centres exactly)
- **Time column right-aligned**: `HH:MM` is fixed width, so right alignment makes the column tidy; left alignment shows raggedness

## Sidebar

| Item | Value |
|---|---|
| Nav item height | **42px**, pitch **48px** (first item y = 100) |
| Nav text | x = **64**, 14px / tracking 45 |
| Icon | x = 36, **16 × 16**, sharing the vertical centre with the text |
| Selected state | backplate `[12, y, 216, 42]` radius 10, **`accent` fill tier + alpha 0.18**; **the selected item's text switches to the `accent` text tier** (`#79c0ff`, not the fill tier — using `#1f6feb` directly as text is only 2.97:1 and gate ⑧ judges it red) |
| logo | baseline 46, 17px / tracking 30; separator below it at y = 74 |

## Mobile skeleton (390 × 844 @ 72ppi, single column)

```
0   44  ┌──────── status bar 44 ────────┐
44  88  │ top nav bar 44 (title centred) │
88      │                                │
        │   ← 16px left/right margin →   │
        │   card (padding 20)            │
        │   card                         │
        │                                │
760 809 │ bottom tab bar 49              │
809 843 │ Home Indicator safe area 34    │
```

| Region | Value | Why |
|---|---|---|
| Canvas | **390 × 844 @ 72 ppi** | See `tokens.md` §7; wrong ppi means wrong font sizes |
| Content left/right margin | **16px** | On a narrow screen the desktop 40px eats a fifth of the width |
| Card padding | **20px** | Slightly tighter than the desktop 24 |
| Card radius | **20px** (`radius-xl`) | Mobile cards must be rounder than desktop ones to avoid looking harsh |
| Card gap | **16px** | Between cards |
| Top navigation bar | status bar **44** + navigation **44** = **88**, title baseline **70** | Title 17px centred; right action centre y=66 |
| Bottom tab bar | bar height **49** + safe area **34** = **83**, top edge y=**760** (occupies 760–809) | Icon **20×20, top edge y=766**; label 12px baseline **802**. **Do not write 808** — 12px ink spans about 792–805 and 808 crosses into the 809 safe area. **The whole column, 97.5×49, is the tappable area**; do not fit two 44 targets into 49 |
| List row height | **56** (single line) / **72** (two lines) | Below 48 it looks cramped and is easy to mis-tap |
| Minimum tappable area | **44 × 44** | Hard floor; even visually smaller icons must be padded to it |

> **The first mobile principle is "one screen, one task"**: desktop sidebars, multi-column layouts and wide tables must never be crammed into 390px. To show multi-column data, switch to a card list.

## Complexity recipes (for screens that should feel "more like a real product")

| Component | Value | Key points |
|---|---|---|
| **Ring progress** | outer diameter **96**, stroke **8**, centre number **24px / tracking 0**, caption below **12px** | starts at 12 o'clock, **clockwise**; track = `border-strong` (α 0.10~0.14), progress arc = the semantic **fill tier** (α 0.35~0.45) or solid. **Do not use 34px for the centre number**: with outer diameter 96 and stroke 8 the inner diameter is only 80, and a 34px percentage hits the stroke. The centre text must be centred by measurement (gate ⑤ judges it) |
| **Bar chart** | 7 bars, bar width **20**, gap **16**, plot height **120**; bottom date labels **12–13px** | **Must have y-axis ticks or value labels** — with only a baseline the reader can see relative heights but cannot read numbers. The current item uses **solid colour**, the rest the **fill tier**; tick lines use `border-strong` |
| **Segmented control** | height **32**, radius `radius-full`, selected backplate **inset 2px** | backplate = fill tier @0.20, text uses the **text tier**; do not draw the selected state with a stroke. **Without separators between the three segments the unselected items "float"** — either add a 1px separator between segments (`border-strong`) or drop the unselected text one step to `muted` |
| **Side-by-side stat cards** | 3 cards, gap **8**, padding **16** (not 20) | With a content width of 358 each net width is only about 110, and **padding 20 leaves no room for 4 digits** (`0:28`). Values use **24px** (not 30), labels 12–13px `muted` above |
| **List row with avatar** | row height **72**; avatar **40×40** radius full, x=16; primary line 16px, secondary line 13px `muted` | Avatar and text vertically centred; put a pill or a chevron at the row end, **never both** |
| **Badge** | diameter **16**, number 11px, or a solid dot **8** | Attached to the icon's top-right, **outer edge aligned** with the icon's outer edge |
| **Skeleton screen** | height **identical** to the target element, radius **identical** | fill = `border-strong` halved again (about 0.07α); **the skeleton block's size must equal the real content**, otherwise the layout jumps when loading finishes |
| **Empty state** | icon **64×64** (`muted` @0.35), description 15px, primary button 44 high | icon-to-copy 16, copy-to-button 24; **no table header in an empty state**, otherwise it looks like there is data that failed to load |
| **Section heading** | 13px / `muted` / tracking 60, 16 above and below | Used to split long pages, lighter than adding a separator |
| **Bottom sheet** | width = canvas width, top corners `radius-2xl`, grabber **36×4** centred | The top grabber is a tappable area; pad it to 44 high; scrim = `#000` @0.5 |

## Modernisation checklist ("looks old" is usually these)

| Old | New |
|---|---|
| 1px **solid grey** borders everywhere | layer by **surface brightness difference** (`bg`→`base`→`elevated`), strokes as **low-opacity white** |
| Body text and title font sizes close (14 / 16) | open it to about **2×** (15 / 30) |
| Uniform 4–6px radii | give radii by size (controls 12 / cards 20) |
| One colour used as both background and text | **fill tier + text tier**, two tiers (`tokens.md` §4) |
| Small text without tracking | give tracking per `tokens.md` §3 |
| Full-screen pure black `#000` or pure grey | a dark colour with a hint of hue (the `#0d1117` family) |
| Shadows big and black | shadows must be **small and low-opacity**, or replaced by layering |

## How to change it (what to keep)

- **Keep**: fixing the content area's left/right boundaries first, the 8px spacing scale, the font-size→tracking mapping, consistent sizes for like elements, the **two-tier semantic colours**.
- **May change**: the concrete numbers, the colours (swap in project tokens), the number of card columns, whether a sidebar is needed, desktop or mobile skeleton.
- **Do not lose**: after changing anything you **MUST open the HTML prototype and check it** — `data-ui` coverage, switchable states, verbatim copy, no external links; whether it looks good is for the human to rule, not something to guess from numbers by eye.
- **Colour-related**: the "normalised float" trap in `tokens.md` (writing 0–255 as an array silently turns white) is the easiest to hit when changing colours.
