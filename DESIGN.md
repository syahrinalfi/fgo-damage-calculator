---
name: FGO Damage Calculator — Optimizer Results
description: A flat, dense operate-mode results table for scanning ranked optimizer lines and their per-turn damage breakdown.
colors:
  ground: "#101318"
  ground-raised: "#171b22"
  ground-inset: "#0a0c10"
  rule: "#2a2f3a"
  ink: "#e7ebf3"
  ink-dim: "#9aa4b6"
  arts: "#2f6fe0"
  arts-dim: "#1c3a75"
  buster: "#e2402f"
  buster-dim: "#6e241c"
  quick: "#2fbf6e"
  quick-dim: "#17603a"
  amber: "#ffcc33"
  focus: "#6fd7ff"
typography:
  headline:
    fontFamily: "system-ui, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "system-ui, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  numeric:
    fontFamily: "\"JetBrains Mono\", ui-monospace, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "2px"
  md: "6px"
  lg: "8px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  line-row:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  turn-section:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  card-pill-arts:
    backgroundColor: "{colors.arts-dim}"
    textColor: "{colors.arts}"
    rounded: "{rounded.sm}"
  card-pill-buster:
    backgroundColor: "{colors.buster-dim}"
    textColor: "{colors.buster}"
    rounded: "{rounded.sm}"
  card-pill-quick:
    backgroundColor: "{colors.quick-dim}"
    textColor: "{colors.quick}"
    rounded: "{rounded.sm}"
  np-pill:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.amber}"
    rounded: "{rounded.sm}"
---

# Status: Deprecated Prototype

The project owner rejected this surface as the future UI direction on 2026-09-16. This file documents the current prototype only; do not preserve or merely reskin it. The replacement must be designed from the product journeys in `PRODUCT.md` and `mem:product_direction` (Clear Quest, Max Burst, later Manual/Sandbox), followed by quest/roster/preferences input and mode-specific results.

# Design System: FGO Damage Calculator — Optimizer Results

## Overview

**Creative North Star: "The Operate-Mode Ledger"**

This surface replaced an earlier fan-card arcade design (Chakra Petch display type, overlapping dealt-hand cards, an amber "ignite" glow, a `deal` entrance animation) with a plain, dense, scannable list: one row per ranked candidate line, an accordion of per-turn detail beneath it. It reads like an operator's tool, not a marketing surface — there is no hero moment, no display face, no motion vocabulary beyond a native `<details>` disclosure triangle rotating on open. The build carries over exactly one thing from the old system: FGO's own arts/buster/quick card-type inks, because those three colors are the one piece of borrowed vocabulary a player already reads correctly. Everything else the old system invented (a bespoke display font, card-fan choreography, a reserved "ignition" color for a single hero number) was cut.

Density comes from real content, not decoration: stacked servant portraits (real Atlas Academy face icons, fetched live, with an initials fallback only when a record has no image), monospace numerals for every damage/percentage figure, and colored pill badges that carry the arts/buster/quick/NP/skill vocabulary from the collapsed row's summary straight into the expanded per-turn panel. The whole page is a single centered column; there is no fan, no cascade, no per-instance rotation or offset math anywhere in the current build.

**Key Characteristics:**
- Near-black flat ground with three saturated colors on loan from FGO's own card-type vocabulary (arts blue, buster red, quick green) plus one reserved amber for NP.
- No display font: headings, body, and labels all share one system-UI sans stack. JetBrains Mono is reserved for numerals only.
- A collapsed row (rank, stacked portraits, party names, total damage) expands via native `<details>`/`<summary>` into a per-turn breakdown panel — no custom disclosure animation, no card-fan choreography.
- Real fetched portraits everywhere a servant appears; a plain initials square is the only fallback, never a placeholder image.

## Colors

The palette is a near-black flat ground lit by three saturated card-type inks borrowed directly from FGO's own in-battle vocabulary, plus one reserved amber for the NP pill.

### Primary
- **Card-Type Inks — Arts Blue** (`#2f6fe0`), **Buster Red** (`#e2402f`), **Quick Green** (`#2fbf6e`): each paired with a low-chroma `-dim` variant (`#1c3a75`, `#6e241c`, `#17603a`) used as the pill background while the saturated tone is the pill text. Assignment is mechanical: a color is used only where the underlying data is that card type (a played card in the turn breakdown), never picked for categorical variety. Buster red doubles as the roster-load error-message color, its one use outside the card vocabulary.

### Secondary
- **Amber** (`#ffcc33`): reserved for the NP pill (background `--ground-raised`, text amber, amber ring). It marks exactly one thing — a Noble Phantasm was used that turn — and does not appear anywhere else in the current build.

### Neutral
- **Ground** (`#101318`): page background.
- **Ground Raised** (`#171b22`): row cards, turn-section panels, the demo-data disclosure banner, skill-pill backgrounds.
- **Ground Inset** (`#0a0c10`): the expanded accordion's own background, per-servant turn rows nested inside a turn section, and the portrait fallback tile background.
- **Ink** (`#e7ebf3`): primary text.
- **Ink Dim** (`#9aa4b6`): secondary/meta text — rank numbers, captions, "Showing top N of M", the skill pill's default (non-NP) text.
- **Rule** (`#2a2f3a`): borders and rings — row borders, panel borders, skill-pill rings, portrait rings.
- **Focus** (`#6fd7ff`): the sole non-thematic color, reserved for `:focus-visible` outlines only.

### Named Rules
**The Borrowed-Ink Rule.** Arts/buster/quick are FGO's own card-type inks, not a generic three-color chart palette. A color is used only where the underlying event actually is that card type. This rule is inherited from the prior fan-card build and still holds because the build still honors it.

**The Single-Pill Amber Rule.** Amber marks the NP pill and nothing else. There is no other "hero" or "ignite" use of amber in the current build — the prior system's reserved winning-score glow was removed along with the fan cards it lived on, and nothing replaced it.

## Typography

**Body Font:** system-ui, "Segoe UI", Roboto, sans-serif — used for the page H1, all body copy, captions, and labels. There is no separate display face.
**Numeric Font:** "JetBrains Mono" (with ui-monospace, Consolas, monospace fallback), loaded at weights 500/700/800 via Google Fonts, applied through the `.num` utility class (`font-variant-numeric: tabular-nums`).

**Character:** One plain UI sans stack carries every text role from the page H1 down to the smallest caption — there is no reserved display face in this build. The only typographic differentiation left to a second family is numerals: every damage figure, NP percentage, and gauge readout renders in tabular-lining monospace so figures line up column-to-column.

### Hierarchy
- **Headline** (700, `text-2xl`→`text-3xl` / 24–30px, system sans): the page H1 ("Optimizer Results") only.
- **Body** (400/500, `text-sm` / 14px): the H1 subhead, row party-name lists, per-turn servant names, the demo-data disclosure banner text.
- **Label/Caption** (400, `text-xs` / 12px, `--ink-dim`): rank numbers, "Showing top N of M", turn damage/HP captions, per-servant NP readout.
- **Numeric** (400/600, inherited size, tabular-nums, `.num` class): total damage, per-turn damage dealt, enemy HP current/max, NP gauge percent and gain — every quantity in the system renders this way, with no exception.

### Named Rules
**The All-Numerals-Monospace Rule.** Every score, percentage, and HP figure renders in tabular-nums JetBrains Mono via `.num`, with no exception — this is the one typographic distinction the system still makes.

**The One-Voice Rule.** There is no display font in this build. Headline, body, and label all share the system sans stack; a distinct display face (the prior build's Chakra Petch) is not part of the current system and should not be reintroduced without a deliberate decision to add one back.

## Layout

The page is a single centered column (`max-w-3xl`, `mx-auto`, `px-4 sm:px-8`, `py-8 sm:py-12`): a header block (H1, subhead, demo-data disclosure banner), then a flat vertical list of ranked candidate rows (`flex flex-col gap-2`). There is no horizontal fan, no card overlap, and no per-instance rotation/offset math anywhere in the current build — each row is full-width and stacks directly beneath the previous one at both desktop and mobile widths. Responsive change is limited to padding scale (`p-3`→`p-4`, `sm:p-4`→`sm:p-5`) and gap sizing; the row/accordion structure itself does not reflow between breakpoints.

Each row is a native `<details>` element; clicking its `<summary>` expands a `TurnBreakdownPanel` directly beneath it, in-flow, pushing subsequent rows down rather than overlaying them.

## Elevation & Depth

The system is flat by default. Depth comes from the three-step ground/raised/inset tonal ladder, not from shadows: `--ground` for the page, `--ground-raised` for row and panel surfaces, `--ground-inset` for the expanded accordion body and nested per-servant turn rows. The only observed shadow is a small ambient `shadow-sm` applied to a row via Tailwind's `open:shadow-sm` when its accordion is expanded — there is no shadow vocabulary beyond this single state.

### Named Rules
**The Tonal-Ladder Rule.** Depth is conveyed by the ground → ground-raised → ground-inset lightness steps. A new nested surface should move one step up or down this ladder rather than introducing a shadow.

## Shapes

Corners are small and consistent: `rounded-sm` (2px) on pills and the portrait fallback's ring context is `rounded-md`, `rounded-md` (6px) on servant portraits and per-servant turn rows, `rounded-lg` (8px) on row cards and turn-section panels — the two container types meant to read as distinct cards. Borders are thin (1px) `--rule` hairlines on rows, panels, and pill rings; the NP pill uses an amber ring instead. There is no border-radius variation tied to interaction state (no state-dependent corner change on hover/selected, unlike the prior fan-card build's amber-bordered selected state).

## Components

### Line Row (signature component)
A `<details>` element, `rounded-lg` (8px), `--rule` border, `--ground-raised` background, with a `<summary>` as its always-visible collapsed face: rank number (`#N`, ink-dim, monospace) at left, a stack of overlapping servant portraits (`-space-x-2`, 44px each) next, then a min-width-0 flex column with the truncated party-name list (body text) over the total-damage-plus-cleared-status caption (numeric, ink-dim), and a chevron icon at the right that rotates 180° on open (`group-open:rotate-180`, plain CSS transform, no custom keyframe). Opening it reveals the `TurnBreakdownPanel` directly beneath, in normal flow.
- **Corner style:** 8px (`rounded-lg`).
- **Background:** `--ground-raised`, unchanged by open/closed state.
- **Border:** 1px `--rule`, unchanged by state.
- **Open state:** adds a small ambient `shadow-sm`; no color, border, or scale change.

### Turn Breakdown Panel (signature component)
The expanded accordion content: `--ground-inset` background, top `--rule` border, containing one `turn-section` (`--ground-raised`, `rounded-md`, `--rule` border) per turn — currently always exactly one, "Turn 1", a real engine-scale limitation on multi-turn search rather than a design constraint. Each turn section header states damage dealt and enemy HP (current/max) in monospace; below it, one row per servant (`--ground-inset` background, `rounded-sm`) shows the portrait, name, a wrapped run of event pills, and a right-aligned NP gauge percent + gain readout.

### Card/Event Pills
Small (`rounded-sm`, `text-xs`, monospace, `px-1.5 py-0.5`) inline badges inside a turn row's event list:
- **Card pill**: `arts`/`buster`/`quick` tone — `-dim` background, saturated text, labeled "Arts"/"Buster"/"Quick". Tone is assigned strictly by which card type the underlying played card actually is.
- **NP pill**: `--ground-raised` background, amber text, amber ring, labeled "NP".
- **Skill pill**: `--ground-raised` background, `--ink-dim` text, `--rule` ring, labeled "Skill N".

### Servant Portrait
A 36–56px square (`rounded-md`), real fetched Atlas Academy face-icon image with `object-cover` and a `--rule` ring when a record has one; when it does not, a plain initials tile (`--ground-inset` background, `--ink-dim` text, `--rule` ring) — never a fabricated or placeholder image.

## Do's and Don'ts

### Do:
- **Do** render every damage figure, HP value, and NP percentage in tabular-nums monospace (`.num` / JetBrains Mono).
- **Do** assign card-type color (arts/buster/quick) strictly by what the underlying played card actually is, never for arbitrary categorical variety.
- **Do** use the ground/ground-raised/ground-inset tonal ladder for any new nested surface instead of introducing a shadow.
- **Do** use a real fetched portrait wherever a servant appears, falling back to a plain initials tile only when no image exists.

### Don't:
- **Don't** reintroduce a separate display font (e.g. the prior build's Chakra Petch) for headings; the current system runs entirely on the system sans stack.
- **Don't** use amber (`#ffcc33`) for anything other than the NP pill — it has no other reserved meaning in this build.
- **Don't** reintroduce card-fan choreography (per-instance rotation/offset, overlapping stacked cards, a `deal`-style entrance animation) — the current layout is a flat vertical list of full-width rows.
- **Don't** add drop shadows beyond the single `open:shadow-sm` state on an expanded row; nested panels and pills stay flat.
