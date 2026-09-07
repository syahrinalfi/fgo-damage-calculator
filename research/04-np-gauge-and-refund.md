# 04 — NP Gauge, Refund, and Overcharge

This file documents how NP gauge is gained (attacking and defending), how Overcharge is derived from gauge, and — per explicit priority for this file — closes as much as possible of the crit-chance-from-stars-on-hand gap flagged as unresolved in `03-card-and-hit-mechanics.md` §5.2.

Sources are the same tier used throughout this project: Atlas Academy's own `fgo-game-data-docs`/`fgo-docs` repo (primary, official), the Atlas Academy OpenAPI schema (primary, official), live Atlas Academy API data (primary, official), and — only where no official doc exists — the `blogs.nrvnqsr.com` ("Kyte"/"Beast's Lair") datamining posts that `fgo-game-data-docs` itself already cites as the origin of the `np.md`/`critstars.md` formulas. Where a claim rests on that last tier, it is explicitly labeled as such, per this project's citation standard.

**Repo note**: `atlasacademy/fgo-game-data-docs` has moved to `atlasacademy/fgo-docs`; the `battle/*.md` formula files are unchanged in content (mirrored under `deeper/battle/`), plus the doc site (`https://atlasacademy.github.io/fgo-docs/`) has an additional rendered page with sections not present as separate `.md` files (notably "What affects whether a card procs critical hit").

---

## 1. NP Gain — Attacking formula

Source: [`battle/np.md`](https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/np.md), `#Attacking NP`.

```
NP% per hit =
(17)    Round Down(
(18)        Round Down(
(19)            offensiveNPRate
(20)            * (firstCardBonus + (cardNpValue * max(1 + cardMod, 0)))
(21)            * enemyServerMod
(22)            * (1 + npChargeRateMod)
(23)            * criticalModifier
            )
(24)        * overkillModifier
        )
```

| Term | Meaning | Source |
|---|---|---|
| `offensiveNPRate` | The attacking servant's own base NP-gain rate for **this NP** | `NiceTd.npGain` — see §4 below; **per-NP/per-servant, not a class table** |
| `firstCardBonus`, `cardNpValue` | Flat NP-gauge bonus / scaling multiplier for the card's type+position | `NiceCard.json`: `card.order.addTdGauge` (flat) and `card.order.adjustTdGauge` (scaling), keyed by card type → position |
| `cardMod` | `atkSvt.commandNpAtk - target.commandNpDef` (buff-action driven) | buff actions `commandNpAtk`/`commandNpDef` |
| `enemyServerMod` | Target's `tdRate` stat, sent by the server (not client-computable from static data alone) | live battle state |
| `npChargeRateMod` | `atkSvt.dropNp` — the "NP gain up" buff action | buff action `dropNp` |
| `criticalModifier` | `NiceConstant.CRITICAL_TD_POINT_RATE` = 2000 → **2.0×** on a crit hit, 1.0× otherwise | `NiceConstant.json` |
| `overkillModifier` | `NiceConstant.OVER_KILL_NP_RATE` = 1500 → **1.5×**, applied only to overkilling hits | `NiceConstant.json` |

**Rounding**: the inner product (terms 19–23) is floored to an integer *first*; the Overkill multiplier is applied to that already-floored integer, and the result is floored again. This directly confirms/finalizes what file 02 only previewed: **Overkill is the outermost step, multiplying the already-rounded per-hit gain**, not an input folded in earlier — resolves file 00 §6's "does NP gain up apply before or after Overkill's bonus" question (NP-gain-up is `npChargeRateMod`, applied *before* the first floor; Overkill is applied *after*).

### Worked numeric sanity-check (Space Ishtar, 1st-position Arts card, non-crit, no Overkill)

Using live data already pulled in file 03 (`space_ishtar.json`) and `NiceCard.json`:

- `offensiveNPRate` (her NP's `npGain.arts[0]`) = 69
- 1st-position Arts card: `addTdGauge` = 1000 → `firstCardBonus` = 1000/1000 = 1.0; `adjustTdGauge` = 3000 → `cardNpValue` = 3000/1000 = 3.0
- `cardMod` = 0 (no buffs) → `max(1+0,0)` = 1
- `enemyServerMod` ≈ 1, `npChargeRateMod` = 0 → `(1+0)` = 1, `criticalModifier` = 1 (non-crit)

`69 * (1.0 + 3.0*1) * 1 * 1 * 1 = 69 * 4.0 = 276` (raw internal unit)

Cross-referencing against `FULL_TD_POINT = 10000` (§5 below, i.e. 10000 raw units = 100% gauge), 276/10000 = **2.76% gauge from that one hit** — consistent with the commonly-observed real-game magnitude for an average-NP-gain servant's first Arts card, which is a reasonable sanity check that the term mapping above is being read correctly (this is a consistency check against known in-game feel, not an independent primary-source proof of the arithmetic — the formula and constants themselves are the actual citations).

---

## 2. NP Gain — Defending formula

Source: same file, `#Defending NP`.

```
NP% per hit =
(25)    Round Down(
(26)        defensiveNPRate
(27)        * enemyServerMod
(28)        * (1 + npChargeRateMod)
(29)        * (1 + defensiveChargeRateMod)
        )
```

| Term | Meaning | Source |
|---|---|---|
| `defensiveNPRate` | `NiceServant.npGain.defence` (**note**: this lives at the *servant* level, not per-NP — see §4) | live servant data |
| `enemyServerMod` | The attacker's `tdAttackRate` stat, sent by the server — **a different variable from the attacking formula's `enemyServerMod`** (`tdRate`); officially confirmed as *usually but not always* identical | `fgo-docs` site, "`enemyServerMod` in the NP gain formula" section |
| `npChargeRateMod` | `defSvt.dropNp` (defender's own "NP gain up" buff, if any — e.g. a self-buff that also boosts gauge gained from being hit) | buff action `dropNp` |
| `defensiveChargeRateMod` | `defSvt.dropNpDamage` — a distinct buff action specifically for damage-taken-based NP gain | buff action `dropNpDamage` |

**Resolves file 00/02's open question** ("does class advantage affect NP gauge gain — confirm for the defending formula too"): **no** — like the attacking formula, the defending formula has **no `triangleModifier`/`classAtkBonus`-equivalent term at all**. Class advantage/disadvantage affects only the damage formula, never NP gain, on either the attacking or defending side. This is now confirmed for both directions, closing file 02 §6's remaining half of this question.

---

## 3. Which NP-gain-affecting buff action applies where

Both formulas are documented on the `fgo-docs` site with an explicit lower/upper-bound table (default 100%, cap 500%, floor 0) for the `cardMod` terms (`commandNpAtk`/`commandNpDef`) and `npChargeRateMod` (`dropNp`) — i.e. these buff actions are individually capped at 500%, same clamp mechanism as the damage formula's buff actions (file 02 §3). No official upper bound is listed for `defensiveChargeRateMod` (`dropNpDamage`) in that table, meaning either it wasn't included in that particular table or it uses `NiceBuff.maxRate` per-buff like the general system (file 01/02) — no evidence found for a `dropNpDamage`-specific hardcoded cap distinct from the general per-buff `maxRate` mechanism.

---

## 4. NP gain rate is per-NP (functionally per-servant), not a shared per-class table

File 02 §6 tentatively concluded this from the attacking-formula field mapping alone (`NiceServant.noblePhantasms.npGain`) and flagged it for confirmation here. **Confirmed via the schema directly**: `npGain` is a field on `NiceTd` itself (`NiceTd.npGain` → `NpGain` object with `buster`/`arts`/`quick`/`extra`/`np`/`defence` arrays, one value per NP level 1–5), not a field on `NiceServant` at the class or top level. Live-verified: Space Ishtar's NP entity (id `1100901`) carries its own `npGain` object directly:

```json
{"buster":[69,69,69,69,69],"arts":[69,69,69,69,69],"quick":[69,69,69,69,69],"extra":[69,69,69,69,69],"defence":[500,500,500,500,500],"np":[69,69,69,69,69]}
```

The underlying raw table (`MstTreasureDeviceLv`) mirrors this exactly with `tdPoint`/`tdPointQ`/`tdPointA`/`tdPointB`/`tdPointEx`/`tdPointDef` fields **on the per-NP, per-level record** — there is no separate class-keyed NP-gain table anywhere in the schema. **This fully corrects file 00's original "per-class NP-gen-rate table" assumption**: NP gain rate is authored per-NP (in practice, per-servant, since almost all servants have exactly one NP), full stop. Any apparent "class pattern" (e.g. Riders/Archers "feeling" like they gain NP faster) is a side effect of individual servant/NP design choices, not a documented class mechanic — no primary source states or implies a class-level NP-gain baseline.

---

## 5. Overcharge: gauge representation, discrete stages, and the fractional-interpolation question

This directly follows up on file 02 §4/§6's open item.

### 5.1 Internal gauge unit

`NiceConstant.FULL_TD_POINT = 10000` — confirms the game's internal gauge representation treats **10000 raw units = 100% gauge** (i.e. "one full bar"). This is the unit the NP-gain formula's output (§1 above) accumulates into.

### 5.2 Overcharge is quantized into exactly 5 discrete stages — not a continuous/interpolated value

This resolves the main open question from file 02 §6 ("does OC interpolate fractionally between brackets, e.g. at 150%?"):

- `NiceFunction` (and `MstTreasureDeviceLv`) only ever define **five** value arrays: `svals` (implicitly OC stage 1), `svals2`, `svals3`, `svals4`, `svals5` — described in the official OpenAPI schema as "Parameter values for NP Overcharge level 2/3/4/5 by NP level" respectively. There is no `svals6+`, and no schema field anywhere for a fractional/interpolated value between two stages.
- The schema additionally exposes a `Vals.CheckOverChargeStageRange` field (an array of strings) used to gate a function's activation to a **specific OC stage range** — further confirming OC is modeled as a small set of discrete integer stages (1–5, corresponding to the gauge brackets 100–199%, 200–299%, 300–399%, 400–499%, and exactly 500%), not a continuous float that formulas interpolate against.

**Conclusion**: there is no fractional-OC interpolation rule to find, because the game does not interpolate — a cast NP always resolves at exactly one of the 5 discrete stage buckets, selected by which bracket the actual gauge % fell into at cast time. This narrows (and effectively closes, for the engine's purposes) file 02's open item: the engine should bucket a computed gauge value into stage `1 + min(4, floor((gauge% - 1) / 100))` for gauge in `(0%, 500%]`, reading whichever `svals`/`svals2..5` array corresponds.

**Still genuinely open** (not found in any primary source in this pass): the *exact* rounding/boundary rule at a bracket edge (e.g., does gauge = exactly 200.0% count as stage 2 or the top of stage 1's continuous range; is the bracket boundary inclusive-low or inclusive-high). No `fgo-docs`/`fgo-game-data-docs` file states this explicitly — the bucket formula above is the only self-consistent reading of "5 discrete stages spanning 100–500%" and is presented as the engine's working assumption, not as an independently-cited fact. Flagged for a future live-data edge-case test (e.g. observing a servant's NP at exactly 200.0% gauge) if precision at the boundary ever matters for the optimizer.

### 5.3 Gauge cost per NP (usually 1 bar, but not hardcoded)

The raw `MstTreasureDeviceLv` table carries a `gaugeCount` integer field per NP-level record — the number of "full bars" (100%-gauge units) that NP costs to cast. This confirms the engine should read gauge cost per-NP from data rather than hardcoding "NP always costs exactly 100%" — although in practice almost every servant NP has `gaugeCount = 1`; no live example with a different value was pulled in this pass, so this is a structural confirmation (the field exists and is meaningful) rather than a demonstrated example of a non-1 value.

### 5.4 An unresolved, out-of-scope-for-now constant

`NiceConstant.json` also defines `NP_DOUBLE_BURST = 1000` and `NP_TRIPLE_BURST = 1500`. No primary-source documentation (`fgo-docs`, `fgo-game-data-docs`, or the datamining blogs checked) explains their exact use, and no obviously-relevant UI/battle mechanic was confirmed for them in this pass. Flagged as an unresolved minor item — likely related to some "double/triple NP chain" UI/eligibility threshold, but not confirmed, and not chased further since it doesn't block file 04's core deliverables.

### 5.5 Passive skills are a real, per-servant source of NP gain — not just the 3 active skills

The NP-gain formulas in §1–2 above cover the *per-hit/per-turn calculation*, but the inputs that feed `npChargeRateMod`/`defensiveChargeRateMod` (both `dropNp`-family buff actions) aren't only granted by the 3 chosen active skills or CEs — a servant's **always-on innate passive skills** can grant them too, and this is a real, live-confirmed mechanic, not a hypothetical:

Space Ishtar's own `classPassive` list (live data, `nice/JP/servant/1100900`) includes two skills that are pure NP-gain passives, always active with no player action required:
- **"Avenger EX"** → grants herself an always-on **NP Gain Up When Damaged** buff (i.e. she gains bonus NP gauge from the *defending* formula, §2, whenever hit).
- **"Self-Restoration (Magical Energy) B"** → grants **NP Gain Each Turn** (a flat per-turn gauge tick, independent of attacking or defending — likely modeled as a `gainNp`-type function firing on a turn-start trigger rather than through either formula in §1–2 at all).

Mechanically these passives are structured identically to active skills/NPs — an ordered `functions` array producing buffs via the same buff-action pipeline documented in §1–3 — so **the engine's default NP-gauge simulation must scan a servant's full `classPassive` list for NP-gain-related functions every turn, not just their 3 selected active skills**, or it will systematically under-count gauge for servants whose kit includes this (a real, non-rare pattern — not every servant has one, but enough do that it can't be treated as an edge case). See the corresponding domain-concept update in `00-project-overview.md` §4 for the fuller three-way passive-category breakdown (`classPassive` vs. `extraPassive` vs. `appendPassive`) this finding is drawn from.

---

## 6. Crit chance from stars-on-hand — the priority gap from file 03 §5.2

File 03 found the star-**drop** (generation) formula from primary source, but explicitly flagged the separate mechanic of "how many stars-on-hand translate into % chance for a given card to actually critical-hit" as **not found** in `fgo-game-data-docs`'s battle files. This is genuinely a different mechanic (stars-on-hand → crit chance) from crit stars generated by a landed hit (file 03 §5.1) — both use the word "critical stars" colloquially but are separate systems.

### 6.1 What is now confirmed by primary source

`NiceConstant.json` (an official Atlas Academy static export, same tier of source as every other constant used in files 02–04) defines:

```
CRITICAL_RATE_PER_STAR = 100
```

Given this project's already-established scale convention (buff/constant raw values are divided by 1000 when used as a rate — e.g. `CRITICAL_STAR_RATE = 200` → 0.2, `CRITICAL_TD_POINT_RATE = 2000` → 2.0, both confirmed in `critstars.md`/`np.md`), `CRITICAL_RATE_PER_STAR = 100` → **10% crit-chance contribution per star allocated to a card**. This is the same figure the community has long cited, but until this pass it had not been traced to an actual named constant in Atlas Academy's own data — it now has a genuine primary-source citation (`NiceConstant.CRITICAL_RATE_PER_STAR`) rather than being purely community folklore.

The official `fgo-docs` doc site (not a separate `.md` file, but the rendered site's own README content — see "What affects whether a card procs critical hit") independently corroborates the *existence* of a star-based crit-chance mechanism without giving its exact numeric formula: it describes stars-on-hand as being allocated per-card via a per-hit RNG roll during hit-star generation, with the allocated stars then determining "your position in the stargen bracket," and separately confirms that critical-hit RNG uses the same underlying dice-roll/RNG-advancement system as skill effects and star generation. It does not, however, state the per-star percentage itself — that number comes only from the `CRITICAL_RATE_PER_STAR` constant above and the community mechanism write-up in §6.2.

### 6.2 The mechanism itself (community-sourced, but from the same datamining source `fgo-game-data-docs` already cites for `np.md`/`critstars.md`)

Atlas Academy's own `np.md` and `critstars.md` cite `blogs.nrvnqsr.com` ("Kyte") posts as the origin of their formulas. That same author/blog has a **dedicated post specifically on this mechanic**, "[How are critical stars distributed?](https://blogs.nrvnqsr.com/entry.php/3305-How-are-critical-stars-distributed)" (accessed via the Wayback Machine snapshot, since the live site is now behind a Cloudflare interstitial that blocks automated fetches — content verified unchanged/consistent with what other sources paraphrase). Per that post (from direct combat-code inspection, same methodology/credibility tier as the already-cited `np.md`/`critstars.md`/`misc.md` posts):

1. **Star-to-card allocation is a weighted lottery, not a flat split.** Each of the 5 hand cards gets a "critical weight" — a base weight (three of the five card slots get a flat +50/+20/+20 bonus weight, shuffled) **plus** that card's servant's own personal `criticalWeight` stat, multiplied by any "Star Focus"/"critical focus factor" buff (e.g. Gilgamesh's Collector EX) on that servant. The weighting is **per-servant, not per-card-type** — all of one servant's cards in hand share the same `criticalWeight`-derived bonus; Buster/Arts/Quick does not itself change a card's weight, only its (separately random) slot assignment does. **`criticalWeight`'s exact field location, previously flagged as needing its own confirmation pass, is now fully resolved** (see §6.3 below): it is `NiceServant.starAbsorb`, live-verified identical in value to `mstSvtLimit.criticalWeight` (Mash: both 99) — the two are the same underlying stat, not separate fields. **The dynamic "Star Focus" multiplier is also now identified as a real buff type**, not just a blog-described concept: `NiceBuffType.upStarweight` ("C. Star Gather Up"), live-verified on Okita Souji's skill 2 ("Zettou"/"Weak Constitution") via the Atlas Academy API this pass.
2. **Every star generated by a landed hit is allocated one-by-one** via a weighted random roll across the current hand's 5 cards (proportional to each card's total weight from step 1) — so a card's chance of *receiving* stars scales with its owning servant's `criticalWeight` and any active Star Focus buff, not just card position.
3. **Each star allocated to a card adds a flat +X% chance for that card to critically hit** when played. The blog's original 2015 write-up measured X ≈ 11% at that time; the current, more precisely citable value from live game data (§6.1) is `CRITICAL_RATE_PER_STAR` = 10% — the discrepancy is consistent with the constant simply having been tuned since 2015, not a contradiction (this project treats the live-data constant as authoritative over a decade-old blog's measured snapshot).
4. **Crit chance is capped per-card** (widely observed as 100% — a card cannot go *past* certain critical, though the exact hard-cap mechanism/field was not independently re-derived here; the blog's own comment thread notes the developers introduced a cap after players observed multiple simultaneous 100%-crit cards).
5. A secondary, currently-dormant mechanic exists in the game's own code ("cards get bonus crit rate for every N stars," per the blog) but its controlling parameters are set to 0 — i.e., defined in the game's engine but not currently active in live balance. Documented here for completeness/future-proofing (a future balance patch could reactivate it), but the engine should treat it as inert unless/until observed otherwise.

### 6.3 Follow-up pass (re-resolved)

- **"Stars-carried-over-to-next-turn cap" — the question itself was mis-framed, per direct correction from the project owner (domain knowledge, not a new primary source) and consistent with every mechanism source cited above.** Stars do **not** accumulate indefinitely across multiple turns: the stars generated during a turn's attack phase are allocated (via the §6.2 weighted lottery) to determine the *following* turn's per-card crit chance, and whatever isn't "spent" toward that is simply gone — not banked for a third turn. There is therefore no persistent pool that needs a cap in the sense originally searched for. The commonly-cited "9 or 10" figure is very likely a conflation of two *different*, well-confirmed numbers that describe the *single-turn* allocation, not a carryover cap: `CRITICAL_RATE_PER_STAR` = 10% per star **per card** (§6.1, so 10 stars on one card = 100% crit on that card), and the separately-confirmed "50 stars guarantees 100% crit on all 5 hand cards" community figure (5 cards × 10 stars each). Both describe stars-on-hand *this turn*, not a cross-turn accumulation limit. **This closes the item — do not model a carryover cap; a single turn's leftover stars are simply discarded once the next turn's crit chances are rolled.**
- **The exact per-servant `criticalWeight` values and where they live in Atlas Academy's schema — resolved.** `criticalWeight` (raw `mstSvtLimit.criticalWeight`, file 09 §6) and `NiceServant.starAbsorb` (the `/nice/` endpoint's field, e.g. Space Ishtar = 29, Mash = 99, Okita Souji = 98) are **the same underlying stat** — live-verified identical for Mash (`starAbsorb` (nice) = 99 = `criticalWeight` (raw), both ascension-stage 0). This corrects file 09 §6's claim that the `/nice/` endpoint does not surface this field — it does, under the `starAbsorb` name. The engine can read it directly off `NiceServant.starAbsorb` without needing the `/raw/` endpoint.
- **Evaded vs. Invincible-blocked attacks' effect on NP gauge/star gain** (flagged in file 00 §6, deferred here) — no primary-source text was found in this pass either confirming or refuting the working assumption ("Evade yields nothing, Invincible still yields gauge/stars since the hit still connects"). Remains an assumption, not a cited fact; deferred again, ideally to file 05 (buffs) or 08 (enemy mechanics) where Evade/Invincible buff semantics are covered in more depth.

---

## 7. Open items carried forward

- Exact OC-stage boundary rounding rule at exact bracket edges (§5.2) — narrowed from "does interpolation exist" (no) to "which side of an exact 100%-multiple boundary" (unconfirmed).
- `NP_DOUBLE_BURST`/`NP_TRIPLE_BURST` constants' actual meaning (§5.4) — unconfirmed, low priority.
- ~~Stars-carried-over cap and per-servant `criticalWeight` schema location~~ — **resolved (§6.3, follow-up pass)**: no carryover cap needed (mis-framed question); `criticalWeight` = `NiceServant.starAbsorb`.
- Evade vs. Invincible NP-gain/star-gain consequence (§6.3) — still open, deferred to file 05/08.
- Precise Enemy Rank (Bronze/Silver/Gold) effect on NP refund (file 00 §6, not addressed in this pass — no primary source located; deferred to file 08, since it is more naturally an enemy-data-model question than an NP-gain-formula one).

## 8. Sources

- https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/np.md (NP gain formula, attacking & defending)
- https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/critstars.md (star drop/generation formula, cross-referenced)
- https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/misc.md (floating-point handling notes)
- https://atlasacademy.github.io/fgo-docs/ (rendered doc site — "`enemyServerMod` in the NP gain formula," "Unstackable buffs," "What affects whether a card procs critical hit" sections)
- https://api.atlasacademy.io/openapi.json (schema field descriptions: `NiceFunction.svals`–`svals5`, `NiceTd.npGain`, `MstTreasureDeviceLv.gaugeCount`/`tdPoint*`, `Vals.CheckOverChargeStageRange`)
- https://api.atlasacademy.io/export/JP/NiceConstant.json (`FULL_TD_POINT`, `CRITICAL_RATE_PER_STAR`, `OVER_KILL_NP_RATE`, `CRITICAL_TD_POINT_RATE`, `NP_DOUBLE_BURST`/`NP_TRIPLE_BURST`)
- https://api.atlasacademy.io/export/JP/NiceCard.json (`addTdGauge`/`adjustTdGauge` per card type/position)
- https://api.atlasacademy.io/nice/JP/servant/1100900 (Space Ishtar live data, used for the worked NP-gain example and to confirm `npGain` lives on the NP entity)
- https://api.atlasacademy.io/nice/JP/servant/1?lang=en and https://api.atlasacademy.io/raw/JP/servant/1 (live pulls, follow-up pass — confirmed `starAbsorb` (nice) = `criticalWeight` (raw) for Mash, both 99)
- https://api.atlasacademy.io/nice/JP/servant/102700?lang=en (Okita Souji live data, follow-up pass — confirmed skill 2 uses `NiceBuffType.upStarweight` ("C. Star Gather Up"), the real buff type behind the "Star Focus" mechanism described in §6.2)
- Community sourcing consulted this pass (web search, not primary — used only to identify the likely 9/10-figure conflation, not as a formula source): gamewith.net "Critical Hit and Stars Guide" (10 stars/card, 50 stars/all cards), samurai-gamers.com "Guide to Critical Stars", gamefaqs.gamespot.com "How Much Does This Do?" board thread
- https://blogs.nrvnqsr.com/entry.php/3305-How-are-critical-stars-distributed (accessed via Wayback Machine snapshot `20250530073851`, since the live site currently blocks automated access) — star-weight-distribution and crit-chance-per-star mechanism; same author/blog network already cited by `fgo-docs`' own `np.md`/`critstars.md`
