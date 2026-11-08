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
        Round Down(
(25)        Round Down(
(26)            defensiveNPRate
(27)            * enemyServerMod
(28)            * (1 + npChargeRateMod)
(29)            * (1 + defensiveChargeRateMod)
            )
            * overkillModifier
        )
```

**Corrected 2026-11-06** against the maintained `atlasacademy/fgo-docs` `deeper/battle/np.md`: the defending formula floors twice and multiplies by `overkillModifier` (`NiceConstant.OVER_KILL_NP_RATE` = 1.5 on an Overkill hit, 1 otherwise) between the floors — the same outer-step shape as the attacking formula. The earlier single-floor, no-Overkill version came from the archived 2021 `fgo-game-data-docs` copy. Implemented in `calculateDefendingNpGain` (`src/engine/npGain.ts`, new `isOverkill` input).

| Term | Meaning | Source |
|---|---|---|
| `defensiveNPRate` | `NiceServant.npGain.defence` (**note**: this lives at the *servant* level, not per-NP — see §4) | live servant data |
| `enemyServerMod` | The attacker's `tdAttackRate` stat, sent by the server — **a different variable from the attacking formula's `enemyServerMod`** (`tdRate`); officially confirmed as *usually but not always* identical | `fgo-docs` site, "`enemyServerMod` in the NP gain formula" section |
| `npChargeRateMod` | `defSvt.dropNp` (defender's own "NP gain up" buff, if any — e.g. a self-buff that also boosts gauge gained from being hit) | buff action `dropNp` |
| `defensiveChargeRateMod` | `defSvt.dropNpDamage` — a distinct buff action specifically for damage-taken-based NP gain | buff action `dropNpDamage` |

**Resolves file 00/02's open question** ("does class advantage affect NP gauge gain — confirm for the defending formula too"): **no** — like the attacking formula, the defending formula has **no `triangleModifier`/`classAtkBonus`-equivalent term at all**. Class advantage/disadvantage affects only the damage formula, never NP gain, on either the attacking or defending side. This is now confirmed for both directions, closing file 02 §6's remaining half of this question.

---

## 3. Which NP-gain-affecting buff action applies where

Both formulas are documented on the `fgo-docs` site with an explicit lower/upper-bound table (default 100%, cap 500%) for the `cardMod` terms (`commandNpAtk`/`commandNpDef`) and `npChargeRateMod` (`dropNp`) — i.e. these buff actions are individually capped at 500%, same clamp mechanism as the damage formula's buff actions (file 02 §3). The floor is **not** universal: `commandNpDef` has no lower bound (its ActionList `limit` is `upper`; corrected 2026-11-06). ~~No official upper bound is listed for `defensiveChargeRateMod` (`dropNpDamage`)~~ — **resolved 2026-11-06**: `dropNpDamage` uses `limit: normal` and the same per-buff `maxRate` mechanism as `dropNp` (ActionList `maxRate` [5000, 50000]); Avenger EX's `upDamagedropnp` buff carries `maxRate` 5000, so its effective cap is 500%.

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

**Follow-up pass: the 100% boundary specifically has a confirmed, asymmetric special-case rounding rule (community-sourced, but heavily cross-corroborated across independent English and Japanese player communities — GameFAQs, Reddit, and a Japanese FGO-news blog aggregating a Twitter discussion thread, no primary/decompiled-code source found).** This is a narrower, better-evidenced claim than the general "5-stage boundary" question above, and specific to crossing into the *first* full bar only:

- A gauge value that would land at exactly 99.xx% (i.e. below 100% by less than 1 whole percentage point, with a non-zero hidden decimal remainder) when **increasing** — from an attack, skill, or passive gain — gets rounded **up** to 100%, making the NP immediately usable. This is why players rarely see "99%" displayed despite the gauge internally tracking sub-percent precision (`FULL_TD_POINT` units, §5.1, are far finer-grained than the displayed whole-percent).
- This rounding does **not** apply when the gauge is **decreasing** into 99% (e.g. from an NP-gauge-down debuff) — a decrease that lands at 99% stays at 99%, confirmed independently by multiple Japanese-community replies distinguishing increase-into-99 from decrease-into-99.
- This rounding is specific to the **100% boundary only** — it does **not** apply at the 200%/300%/400% Overcharge-stage boundaries (§5.2 above): 199%/299% are commonly observed and displayed as-is, unlike 99%, per multiple independent community reports. This means the 5-stage OC bucketing model above should **not** assume the same "round up near the boundary" behavior repeats at every stage transition — it is a special case unique to first reaching 100% (plausibly a deliberate UX decision — a boss lever explicitly reasoned that shipping this rounding was "a wise decision" to avoid player frustration at being stuck at 99%, per the Japanese thread — rather than a general floating-point artifact that would equally affect every bracket).
- **Engine implication**: if the simulator models NP-gain accumulation with sub-percent precision (consistent with `FULL_TD_POINT = 10000` internal units, §5.1), it should apply a special-cased "round up to `FULL_TD_POINT` if the accumulated total lands in `[9900, 10000)` as a result of a gain operation" rule specifically at the first 100% crossing, and explicitly **not** replicate that rule at the 20000/30000/40000-unit (200%/300%/400%) boundaries.

### 5.2a Gauge fully resets to 0 on cast, and its accumulation cap scales with NP level (resolved by the project owner's direct gameplay knowledge)

Two related, previously-undocumented mechanics, both confirmed by the project owner's direct gameplay knowledge:

- **Casting an NP always fully resets that servant's gauge to exactly 0** — regardless of how far past 100% (or any other bracket) it was sitting at the moment of cast. E.g. a servant sitting at 140% who casts their NP ends at 0%, not a leftover 40%; there is no "keep the remainder" carryover into the next cycle of accumulation. This is a distinct rule from §5.2's OC-stage bucketing (which decides *which stage that cast resolved at*, from the gauge value *before* the reset) — the bucketing reads the pre-cast value, then the reset always zeroes it afterward regardless of which stage was read.
- **The gauge's own accumulation ceiling (how high it can passively climb through normal attacking/skill charge, before any cast) scales with the servant's NP level**: NP level 1 caps at 100% (1 bar), NP levels 2–4 cap at 200% (2 bars), NP level 5 caps at 300% (3 bars). This is **conceptually distinct from §5.3's `gaugeCount`** (the *minimum* gauge required to be *able* to cast at all, almost universally 1 bar) — this is instead the *maximum* the gauge can passively hold before any further gain is simply wasted/capped, and that maximum increases as the servant's NP is leveled up (a real reward for NP-leveling beyond the per-stage `svals` value bump: a higher-NP-level servant can reach a higher Overcharge stage from ordinary attacking alone, without needing an NP Chain or Overcharge-up skill).
- **Reaching OC stage 4/5 (400–500%) is never achieved through passive gauge accumulation alone, at any NP level** — it is only ever an ephemeral, moment-of-cast addition from an NP Chain (§5.5) or an Overcharge-up skill/buff, added on top of whatever the level-capped gauge itself provides at that instant. If neither is active at the moment of cast, the effective Overcharge is exactly what the (level-capped) gauge value gives — up to OC1/OC2/OC3 for NP level 1/2-4/5 respectively — never higher. This confirms the engine should **not** model Overcharge as something that "accumulates" in a persistent sense beyond the gauge's own bracket; the NP Chain bonus (§5.5) already models this correctly as a per-cast addition to the OC stage, not a persistent gauge increase — this generalizes that same "ephemeral, cast-time-only" treatment to Overcharge-up skills as well.
- **Engine implication**: `ServantInstance` (research/09 §1) needs its NP level as static data to look up the correct accumulation cap (`{1: 100%, 2: 200%, 3: 200%, 4: 200%, 5: 300%}` in `FULL_TD_POINT` units), and `resolveAction`'s `castNp` case (research/09 §1's turn-resolution reducer) must reset the casting servant's `currentNpGauge` to exactly 0 after resolving the cast, regardless of any gauge gained from that same NP's own hits.

### 5.2b An NP must be at 100% when the attack chain is chosen (owner-confirmed, 2026-11-08)

An NP card can only be selected for the turn's chain if its servant's gauge is already at least 100% at card selection — after that turn's skills, Mystic Code skills and Order Change, before any card resolves. Gauge gained from face cards or from another servant's NP earlier in the same chain cannot make an NP castable that turn; it only counts from the next turn. The official NA guide only states that a Servant can use its Noble Phantasm "when [its] NP Gauge reaches 100%" (fate-go.us How to Play PDF); the selection-time rule is confirmed by the project owner's gameplay knowledge.

**Engine implication**: the gauge check at NP resolution alone let a servant at 99.99% play a face card in slot 1 and then NP in slot 2 (reproduced 2026-11-08). `BattleState.npReadyAtChainSelection` now records NP-ready servants as the turn's first card or NP resolves, `castNp` requires membership, and `endTurn` clears it.

### 5.3 `gaugeCount` is the per-NP-level bar count (gauge cap), not a cast cost — corrected 2026-11-06

The raw `MstTreasureDeviceLv` table carries a `gaugeCount` integer field per NP-level record (it is not exposed on `NiceTd`). An earlier pass read it as the number of bars an NP costs to cast and assumed it is almost always 1. Live raw data contradicts that: for both Mash (`/raw/JP/servant/1`) and Space Ishtar (`/raw/JP/servant/1100900`), `gaugeCount` runs **1, 2, 2, 2, 3** across NP levels 1–5. That matches the owner-sourced gauge cap in §5.2a (100% at NP1, 200% at NP2–4, 300% at NP5), so `gaugeCount` is the number of gauge bars the servant can hold at that NP level. This gives §5.2a's cap a primary-data source. The cast-and-reset-to-0 behavior is unchanged (§5.2a).

### 5.4 An unresolved, out-of-scope-for-now constant

`NiceConstant.json` also defines `NP_DOUBLE_BURST = 1000` and `NP_TRIPLE_BURST = 1500`. No primary-source documentation (`fgo-docs`, `fgo-game-data-docs`, or the datamining blogs checked) explains their exact use, and no obviously-relevant UI/battle mechanic was confirmed for them in this pass. Flagged as an unresolved minor item — likely related to some "double/triple NP chain" UI/eligibility threshold, but not confirmed, and not chased further since it doesn't block file 04's core deliverables. **A follow-up pass found the mechanic these constants most plausibly name (§5.6) but could not cleanly map the specific numeric values (1000/1500) onto it** — the mechanic's own rule is a flat +100% OC per prior NP in the chain (so a 3rd chained NP should get +200%, not +150% as `NP_TRIPLE_BURST`'s value would suggest under a naive reading) — so this connection remains a plausible guess, not a confirmed mapping; the constant names could equally represent a different, still-unconfirmed threshold (e.g. UI eligibility for showing a "chain bonus" announcement) rather than the OC bonus amount itself.

### 5.5 NP Chain Bonus — Overcharge from casting multiple NPs consecutively in one turn (not previously documented in this project)

This is a distinct **path to reach a higher OC stage** than gauge-percentage alone (§5.2) — orthogonal to, not a replacement for, the gauge→stage bucketing already established. Sourcing tier: community, but heavily cross-corroborated (GamePress Q&A "About NP Chain," the Fandom wiki's own `Noble_Phantasm` page, GameWith's NP guide, and independent GameFAQs threads all state the same rule with no discrepancy) — no primary/schema source found for this specific mechanic in this pass.

- When two or more NPs are played **directly consecutively** within the same turn (no regular command card in between — a "regular card between two NPs" breaks the chain and both resolve independently at their own gauge-derived OC), each NP after the first gets an additional **+100% Overcharge for every NP that precedes it in that same NP chain**, on top of whatever OC its own gauge % would already give it (gauge rounded **down** to the nearest 100% first, per GamePress' stated formula: `OC = floor(ownGauge / 100%) * 100% + 100% * (number of NPs earlier in this chain)`).
- Worked example (from the cross-corroborating sources): three servants each at exactly 100% gauge, chained NP→NP→NP in one turn — 1st NP resolves at OC1 (100%), 2nd at OC2 (200%), 3rd at OC3 (300%), with **no extra gauge required** beyond each servant's own 100% — purely from chain position.
- The maximum reachable OC via any combination of gauge + chain position is **500% (OC stage 5)** — consistent with (and a further confirmation of) file 04 §5.2's already-established "exactly 5 discrete OC stages, no more" finding from the schema (`svals`–`svals5`).
- **This chain-derived OC is still subject to §4's "OC usually only affects an NP's secondary effect, not its base damage multiplier" rule** (file 02 §4) — chaining NPs to push Overcharge higher is a real, common farming/burst technique specifically *because* many NPs have OC-scaled secondary effects (bonus debuffs, extra buff potency, etc.), not because it inherently increases raw damage output.
- **Engine implication**: the turn-resolution pipeline (file 09 §2) must track, for each NP cast within a turn, how many NPs were cast immediately before it in an unbroken NP-only sequence, and add `100% × that count` to the OC stage computed from that servant's own gauge — this is a new required piece of per-turn state (a running "consecutive NP chain counter," reset by any non-NP card play) that wasn't previously identified as needed by file 09's `BattleState`/turn pipeline.

### 5.5 Passive skills are a real, per-servant source of NP gain — not just the 3 active skills

The NP-gain formulas in §1–2 above cover the *per-hit/per-turn calculation*, but the inputs that feed `npChargeRateMod`/`defensiveChargeRateMod` (both `dropNp`-family buff actions) aren't only granted by the 3 chosen active skills or CEs — a servant's **always-on innate passive skills** can grant them too, and this is a real, live-confirmed mechanic, not a hypothetical:

Space Ishtar's own `classPassive` list (live data, `nice/JP/servant/1100900`) includes two skills that are pure NP-gain passives, always active with no player action required:
- **"Avenger EX"** → grants herself an always-on **NP Gain Up When Damaged** buff (i.e. she gains bonus NP gauge from the *defending* formula, §2, whenever hit).
- **"Self-Restoration (Magical Energy) B"** → grants **NP Gain Each Turn** (a flat per-turn gauge tick, independent of attacking or defending). **Corrected 2026-11-06** (the earlier text guessed a `gainNp` function on a turn-start trigger): live data shows an `addStateShort` granting a `regainNp` buff (`Value` 350), which maps to buff action `turnendNp` — it fires at **turn end**.

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

The official `fgo-docs` doc site (not a separate `.md` file, but the rendered site's own README content — see "What affects whether a card procs critical hit") independently corroborates the *existence* of a star-based crit-chance mechanism without giving its exact numeric formula: ~~it describes stars-on-hand as being allocated per-card via a per-hit RNG roll during hit-star generation, with the allocated stars then determining "your position in the stargen bracket,"~~ (**misread, corrected 2026-11-06**: the README's brackets — [1-100], [101-200], [201-300] — describe per-hit star *generation* and how far the RNG advances, not star allocation to cards) and separately confirms that critical-hit RNG uses the same underlying dice-roll/RNG-advancement system as skill effects and star generation. It does not, however, state the per-star percentage itself — that number comes only from the `CRITICAL_RATE_PER_STAR` constant above and the community mechanism write-up in §6.2.

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

### 6.4 §6.2's weighted lottery — implemented

`src/battle/critStarLottery.ts`'s `allocateCritStars` implements the §6.2 mechanism directly: the shuffled +50/+20/+20/0/0 slot-bonus pool (reusing `shuffleCards`, `./cardBag.js`, so the bag/shuffle mechanic and the lottery's own shuffle share one implementation) plus each hand slot's owning servant's `criticalWeight` (now a real `ServantInstance` field, `src/battle/battleState.ts`, sourced from `NiceServant.starAbsorb` per §6.3 above) — every one of `starsCarried` stars is an independent weighted pick across the 5 hand slots' combined weight, not a without-replacement draw. `critChanceForStars` then converts a slot's allocated star count to its crit-chance contribution via `CRITICAL_RATE_PER_STAR` (`src/engine/constants.ts`, now a real constant), capped at 100%; `rollIsCrit` is the thin Bernoulli step that turns that probability into the `HitResolutionContext.isCrit` boolean.

**Wired into `resolveAction` (follow-up pass, `src/battle/turnLoop.ts`)**: `resolveEndTurn` now calls `allocateCritStars` once per turn against the freshly-drawn hand and `BattleState.starsCarried`, storing the result in a new parallel `BattleState.handCardStars` field; `resolvePlayCard` reads the played slot's entry and rolls `isCrit` via `critChanceForStars`/`rollIsCrit` itself — a caller building a `playCard` `Action` no longer supplies `isCrit` at all (its `context` type, `DerivedHitContext`, omits the field). `castNp` hardcodes `isCrit: false` instead, since an NP card can never critically hit (~~research/03 §1.4's all-zero NP position stub~~ — **2026-11-06**: that stub is card id 5 = `BLANK`, not the NP card, so this behavior is now community-knowledge only, not primary-sourced; research/03 §7).

**Deliberately not modeled**: the "Star Focus"/`upStarweight` buff multiplier on `criticalWeight` (§6.2 point 1) — ~~no confirmed `BUFF_ACTION_KEYS` entry exists yet for it~~ (**2026-11-06**: the live ActionList maps `upStarweight` to action key `starweight`, so the key is now confirmed; the engine still does not read it), so a servant carrying that buff is simply under-weighted for now rather than the engine guessing at an unconfirmed key. Star *generation* itself — rolling each hit's `starDropChance` into an actual count and feeding it into next turn's `starsCarried` — is also still not wired; `endTurn` allocates whatever `starsCarried` already holds but never updates it.

---

## 7. Open items carried forward

- Exact OC-stage boundary rounding rule at exact bracket edges (§5.2) — narrowed from "does interpolation exist" (no) to "which side of an exact 100%-multiple boundary" (unconfirmed) for the 200/300/400% boundaries specifically. **The 100% boundary is now resolved** (§5.2 follow-up): increases landing at 99.xx% round up to 100%; decreases do not; the 200/300/400% boundaries do not share this behavior.
- `NP_DOUBLE_BURST`/`NP_TRIPLE_BURST` constants' actual meaning (§5.4) — unconfirmed, low priority.
- **Crit-star lottery: per-card 10-star cap (new, 2026-11-06, community conflict)**: Japanese write-ups (atwiki, quoted on a hatena blog, plus a Qiita implementation) say a card that reaches 10 stars is removed from the weighted draw. §6.4's implementation makes independent picks with no removal, under which §6.3's "50 stars = 100% crit on all 5 cards" cannot hold. Needs resolving before trusting crit-rate output.
- **`upCriticalrate` ("Critical Hit Rate Up", e.g. Okita's skill 2) is not in the crit-chance model (new, 2026-11-06)**: §6 models crit chance from stars only.
- ~~Stars-carried-over cap and per-servant `criticalWeight` schema location~~ — **resolved (§6.3, follow-up pass)**: no carryover cap needed (mis-framed question); `criticalWeight` = `NiceServant.starAbsorb`.
- ~~Evade vs. Invincible NP-gain/star-gain consequence~~ (§6.3) — **resolved (file 05 §6.4, follow-up pass)**: confirmed via direct in-game observation that both an Evaded and an Invincible-blocked hit still generate NP gauge and crit stars normally for the attacker — only the damage-formula output itself is zeroed by either buff.
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
- 99%→100% NP-gauge rounding (§5.2 follow-up, community-sourced, cross-corroborated): gamefaqs.gamespot.com "NP charge 1% round up" thread; reddit.com/r/grandorder "It turns out, 99% NP can actually happen"; thedigitalcrowns.com "How Does NP Generation Work in Fate/Grand Order?"; fgo.news/blog-entry-71718.html (Japanese blog aggregating a 2022-11-06 Twitter/X discussion thread with multiple independent players confirming the increase-only, 100%-boundary-only behavior)
- NP Chain Bonus / consecutive-NP Overcharge (§5.5, community-sourced, cross-corroborated): fgo.gamepress.gg/q-a/abaout-np-chain (states the `floor(gauge/100%) + 100%×priorNPsInChain` formula explicitly); fategrandorder.fandom.com/wiki/Noble_Phantasm ("Overcharge" section — worked multi-servant examples, 500% hard cap); gamewith.net/fate-grand-order/75816 ("Chain Noble Phantasms" section); gamepress.gg/grandorder/combat-mechanics ("NP Chain" section)
