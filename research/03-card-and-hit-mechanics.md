# 03 — Card & Hit Mechanics

This file covers the per-card-type/position constants referenced (but not individually catalogued) by file 02's damage formula, the hit-count/hit-distribution data model, and the critical star **generation** formula (star drop chance per hit — critical **chance from stars-on-hand** is a related but distinct mechanic, see §5 for what could and couldn't be sourced).

## 1. `NiceCard.json` — the full per-card-type/position table

Source: live-fetched `https://api.atlasacademy.io/export/JP/NiceCard.json`. Structure: `{cardTypeId: {positionKey: {individuality, adjustAtk, adjustTdGauge, adjustCritical, addAtk, addTdGauge, addCritical}}}`. Field-to-formula mapping (per damage.md/np.md/critstars.md, files 02/§5 below):

| Field | Feeds | Formula term |
|---|---|---|
| `adjustAtk` | `cardDamageValue` | damage formula term 03 |
| `addAtk` | `firstCardBonus` (damage) | damage formula term 03 |
| `adjustTdGauge` | `cardNpValue` | NP-gain formula (file 02 §4 / file 04) |
| `addTdGauge` | `firstCardBonus` (NP gain) | NP-gain formula |
| `adjustCritical` | `cardStarValue` | crit-star-drop formula, §5 below |
| `addCritical` | `firstCardBonus` (star drop) | crit-star-drop formula, §5 below |

Card type IDs (confirmed via each entry's `individuality` trait tag): `1` = Arts (`cardArts`), `2` = Buster (`cardBuster`), `3` = Quick (`cardQuick`), `4` = Extra (`cardExtra`), `5` = NP card (all-zero stub, see §1.4), `10`/`21`/`22` = "Weak" enemy-attack card variants (`cardWeak`), `11` = "Strong" enemy-attack card variant (`cardStrong`), `60` = a rare Buster variant carrying an extra unnamed trait (id 4009, "unknown") not otherwise decoded in this pass, `101`–`104` = a byte-for-byte duplicate of `1`–`4`'s values (purpose not confirmed — see §6 open items, does not change any conclusion below since the numbers are identical).

The second-level key (`1`/`2`/`3` for player cards, or `4` for Extra) is the card's **position in the played 3-card chain** (1st/2nd/3rd card of the turn) — **not** an arbitrary index. This directly resolves file 00 §4's "chain order bonus (first/second/third card position multiplier)" concept with exact sourced numbers:

### 1.1 Arts (id 1)
| Position | `adjustAtk` | `addAtk` | `adjustTdGauge` | `addTdGauge` |
|---|---|---|---|---|
| 1st | 1000 (100%) | 0 | 3000 (30%) | **1000 (+10%)** |
| 2nd | 1200 (120%) | 0 | 4500 (45%) | 0 |
| 3rd | 1400 (140%) | 0 | 6000 (60%) | 0 |

Arts cards have **no flat damage bonus for being played first**, but do have a **+10% flat NP-gauge bonus specifically when played as the 1st card** (`addTdGauge` = 1000 only at position 1) — matching the well-known community rule "Arts gives extra NP gauge when played first," now backed by an exact number from primary data.

### 1.2 Buster (id 2)
| Position | `adjustAtk` | `addAtk` | `adjustCritical` |
|---|---|---|---|
| 1st | 1500 (150%) | **500 (+50%)** | 100 |
| 2nd | 1800 (180%) | 0 | 150 |
| 3rd | 2100 (210%) | 0 | 200 |

Buster's well-known "first card gets a flat damage bonus" is confirmed exactly: **+50% flat ATK bonus** (`addAtk` = 500) only at position 1, on top of the already-highest base multiplier of the three colors (150%/180%/210% vs. Arts' 100%/120%/140% and Quick's 80%/96%/112% below). Buster's `adjustCritical` also scales by position (100/150/200 = 10%/15%/20% flat crit-star-drop contribution — see §5) — i.e. Buster contributes more critical stars the later it's played too, not just more damage.

### 1.3 Quick (id 3)
| Position | `adjustAtk` | `addAtk` | `adjustCritical` | `addCritical` |
|---|---|---|---|---|
| 1st | 800 (80%) | 0 | 800 (80%) | **200 (+20%)** |
| 2nd | 960 (96%) | 0 | 1300 (130%) | 0 |
| 3rd | 1120 (112%) | 0 | 1800 (180%) | 0 |

Quick's well-known "first card gets bonus critical stars" is likewise confirmed exactly: **+20% flat star-drop-chance bonus** (`addCritical` = 200) only at position 1. Quick has the lowest base damage multiplier of the three colors but the highest `adjustCritical` baseline (star generation is Quick's specialty, consistent with community knowledge).

### 1.4 Extra (id 4) and NP (id 5)
Extra only has two populated position keys, `1` and `4`, both flat `adjustAtk`/`adjustTdGauge`/`adjustCritical` = 1000 (100%, no position scaling at all) — Extra Attack doesn't get a chain-position bonus the way the three colors do; its distinct bonus is instead the separate `extraCardModifier` term (damage formula term 11, file 02 §2/§5: ×2.0 normal, ×3.5 after a same-color "Grand"/rainbow-adjacent chain) applied multiplicatively on top. **Which of "1" vs "4" applies in which real scenario was not confirmed in this pass** — flagged as an open item (§6).

The NP card (id `5`, single position key `"0"`) is an **all-zero stub** — confirms NP cards do not go through this per-position table at all. An NP's damage is driven entirely by its own `npDamageMultiplier` (file 02 §4) and whatever `classAtkBonus`/`triangleModifier`/etc. terms apply normally; the card-position/chain-order bonus system in this file simply does not apply to NP cards. This also answers file 00 §6's open question "can NP cards critically hit, and if so how does that interact with the NP formula" **indirectly**: since NP cards carry no `adjustCritical`/`addCritical` entry at all in this table, they generate no critical-hit-eligible interaction through the normal card-crit pathway described in §5 — **consistent with the well-established community understanding that NP cards cannot critically hit**, though this file did not find an explicit primary-source statement saying so outright; it's inferred from the all-zero stub rather than confirmed by name.

## 2. Hit count & hit-distribution data model

Confirmed via a live example (`GET /nice/JP/servant/1100900`, Space Ishtar) that `NiceServant.hitsDistribution` is an object **keyed by the same card-type IDs as `NiceCard.json`** (`"1"`=Arts, `"2"`=Buster, `"3"`=Quick, `"4"`=Extra), each value an array of **percentages of the card's total damage dealt by each successive hit**, summing to 100:

| Card type | Hits | Distribution (% of total damage per hit, in order) |
|---|---|---|
| Arts (1) | 2 | `[33, 67]` |
| Buster (2) | 3 | `[16, 33, 51]` |
| Quick (3) | 4 | `[10, 20, 30, 40]` |
| Extra (4) | 5 | `[6, 13, 20, 26, 35]` |

(Values above are Space Ishtar's specific hit counts — **hit count is per-servant, per-card-type**, not a universal constant across all servants of a class or overall; file 00's "Hit count mechanics" domain concept is confirmed correct not to assume a generic hit count.) This directly satisfies file 00 §4's requirement: hit count and per-hit damage-distribution are both present, per-servant, per-card-type, sourced from `hitsDistribution` (and the analogous `NiceTd.npDistribution` for the NP itself — same live example's NP has `npDistribution: [16, 33, 51]`, a 3-hit NP with 16%/33%/51% distribution, matching its `card: 1` = Arts-classified NP). `NiceServant.cardDetails` (seen in file 01's field inventory) was not individually decoded in this pass — flagged as an open item (§6), likely carries hit-count-adjacent metadata (e.g. hit-count overrides at specific ascensions/costumes) rather than duplicating `hitsDistribution` itself.

**Engine implication (reinforcing file 00's existing note)**: NP refund, crit-star generation, and Overkill are all evaluated **per hit** using this array — a 5-hit Extra Attack generates 5 separate NP-gauge/star/overkill evaluations (one per array entry), each using that entry's share of the card's total damage to determine whether *that specific hit* met the Overkill threshold (i.e., dealt more damage than the target's remaining HP) — overkill is therefore possible on some hits of a multi-hit card/NP and not others within the same action, not an all-or-nothing property of the whole card.

## 3. Chain mechanics — confirmed constants, unconfirmed exact effects (carried from file 02)

File 02 §5 surfaced these `NiceConstant.json` values without fully resolving their exact application:

| Constant | Value | 
|---|---|
| `CHAINBONUS_BUSTER_RATE` | 200 |
| `CHAINBONUS_ARTS_RATE` | 200 |
| `CHAINBONUS_QUICK` | 20 |
| `BUSTER_CHAIN_INDIVIDUALITY` / `ARTS_CHAIN_INDIVIDUALITY` / `QUICK_CHAIN_INDIVIDUALITY` / `BRAVE_CHAIN_INDIVIDUALITY` / `MIGHTY_CHAIN_INDIVIDUALITY` | trait IDs 4104–4108 |

**What this file adds**: the community-standard understanding of what each chain type does (Buster Chain = a flat damage bonus applied via damage formula term 17's `busterChainMod`, confirmed in file 02 §2; Arts Chain = an NP-gauge bonus, not a damage bonus; Quick Chain = a bonus to critical star generation; Brave Chain = 3 cards from the **same servant** regardless of color, distinct from a "color chain" of 3 same-type cards from different servants) is **widely and consistently reported across independent community sources**, but at the time of this pass, this project had not located a primary-source (`fgo-game-data-docs` or live API) confirmation of the exact numeric effect of `CHAINBONUS_ARTS_RATE`/`CHAINBONUS_QUICK`, nor Brave/Mighty Chain's numeric effects.

**Resolved by a follow-up pass — see `06-traits-and-class-mechanics.md` §7 for the full writeup.** The reason primary-source confirmation wasn't found via `function/search`/`buff/search` against these trait IDs is now understood: Arts/Quick/Brave/Mighty chain bonuses are **not implemented as buff/function instances gated by these trait IDs at all** — they're hardcoded terms in the client's own damage/NP-gain/star-drop formulas, evaluated from chain composition directly (the same shape as the already-documented `firstCardBonus`/`cardMod`/`extraCardModifial` terms, file 02), which is exactly why searching for a function tagged with these traits turned up nothing. The trait IDs in the table above likely exist for UI/display purposes (e.g. showing the chain-type icon) rather than gating the actual bonus math. Numeric values (community-sourced, cross-corroborated across 3+ independent authors — see file 06 §7 for the exact sourcing tier per claim) are now documented in file 06 §7.1–7.4.

## 4. Mighty Chain

**This section's original description was wrong and is corrected in `06-traits-and-class-mechanics.md` §7.4** — Mighty Chain is not "a chain using only 5★-rarity-equivalent cards" (that description was an unconfirmed guess based on the trait's mere existence, not a sourced definition). It is an official mechanic added 2022-07-31 (FGO's 7th Anniversary): playing one card of each type (Quick+Arts+Buster, any order, any servant) in one turn. See file 06 §7.4 for the full effect list, sourcing (official FGO FAQ + Anime News Network's 7th-Anniversary coverage), and the "Mighty Brave Chain" variant (same-servant QAB).

## 5. Critical stars — generation (drop chance), confirmed; crit chance from stars-on-hand, not found in primary sources

### 5.1 Star drop chance per hit — confirmed formula
Source: [`fgo-game-data-docs/battle/critstars.md`](https://github.com/atlasacademy/fgo-game-data-docs/blob/master/battle/critstars.md).

```
dropChancePerHit =
    ( baseStarRate
      + firstCardBonus + (cardStarValue * max(1 + cardMod, 0))
      + serverRate
      + starDropMod
      - enemyStarDropMod
      + criticalModifier )
    * overkillModifier
    + overkillAdd
```

- `baseStarRate` = `NiceServant.starGen` (a flat per-servant baseline — Space Ishtar's is 60).
- `firstCardBonus`/`cardStarValue` = `addCritical`/`adjustCritical` from `NiceCard.json` (§1 above).
- `cardMod` = `atkSvt.commandStarAtk - defSvt.commandStarDef` (a buff-action pair, same buff-action pipeline as file 02 §3).
- `starDropMod`/`enemyStarDropMod` = `criticalPoint` buff action on attacker/defender respectively.
- `criticalModifier` = `NiceConstant.CRITICAL_STAR_RATE` = 0.2 (a flat +20 percentage-point bonus specifically **if this hit is a crit** — separate from the crit-chance mechanic itself, this only affects star *generation* on a hit that already landed as critical).
- `overkillModifier`/`overkillAdd` = `NiceConstant.OVER_KILL_STAR_RATE` = 1 (i.e. ×1, no change) and `OVER_KILL_STAR_ADD` = 0.3 (a flat +30 percentage-point star-drop bonus on an Overkill hit) — confirms file 00's "Overkill bonus modifier" applies to star generation as its own additive bonus, distinct from Overkill's ×1.5 NP-gain bonus (file 02 §4) and its damage-side interaction (file 00 §4, not yet separately confirmed for raw damage itself — the damage formula in file 02 has no explicit "isOverkill" term, meaning **Overkill does not directly multiply raw hit damage** — it only affects NP gain (×1.5) and star drop (+30pp), a useful clarification of file 00's "Overkill bonus modifier" wording, which had implied a possible damage effect too).

This is a **per-hit probability** (not a guaranteed count) — matching file 00's "critical hits/stars fully modeled including RNG" decision: star generation is genuinely probabilistic per hit, not a deterministic yield, and the engine's probability-of-clear modeling (file 00 §3's key decision on RNG) must treat this as a Bernoulli-per-hit process, not a fixed average.

### 5.2 Star absorption/weight and crit chance from stars — not resolved by primary sources in this pass
`NiceServant.starAbsorb` (confirmed to exist, e.g. Space Ishtar = 29) is the per-servant **star absorption weight** referenced by file 00 §4 ("star absorption/weight per servant — affects who 'owns' stars carried into next turn"), but **this research pass did not locate a primary-source (`fgo-game-data-docs`) formula for**: (a) how absorption weight converts into an actual share of stars carried over among 3 fielded servants, (b) the stars-carried-over cap (community sources consistently cite 9 or 10, but no primary-source citation was found for this specific number in this pass), or (c) the crit-chance-from-stars-on-hand formula itself (community sources consistently describe "~10% crit chance per star, allocated per card," but again no primary-source citation was located). **This is an honest gap, not a silent assumption** — flagged for a dedicated follow-up pass (either a deeper primary-source search, or an explicit decision to cite community sources with clear "community-derived, not primary-source-confirmed" labeling if no primary source exists). Given file 00's emphasis on probability-of-clear modeling depending on exactly this mechanic, this should be prioritized before file 09 (simulation design) is written.

## 6. Card manipulation mechanics — a distinct action category not previously covered, relevant to file 09 §7's card-draw-weighting gap

This section covers a family of servant skills that let the player **override** the normal RNG-driven card draw (§4.1 of file 00's domain concept list mentions this as a distinct RNG surface) rather than merely benefit from it. These are genuinely three **different** mechanisms that get colloquially lumped together as "card skills" — the engine must model them as three distinct action types, not one generic "manipulate cards" effect. Sourcing tier: community guide-tier (GameWith, GamePress servant reviews) — no primary/schema confirmation attempted for the exact numeric/duration details in this pass, but the buff-type/funcType names below **are** schema-confirmed.

### 6.1 Change Command Card Type

The servant's own 5 hand cards are all forced to become one specific type for the duration (typically 1 turn), regardless of what they actually are. Schema-confirmed as its own mechanism: `NiceBuffType.changeCommandCardType` and `NiceBuffType.overwriteSvtCardType` are both real, distinct buff types (live-verified present in the schema this pass). Examples: Altria Pendragon (Saber) forces all her own cards to Buster (1 turn); Durgā forces all hers to Arts (1 turn); Shizuki Soujuurou forces his to a chosen type, with a 1-turn delay before it takes effect. This directly guarantees a same-type ("color") chain (file 06 §7.2) using only that one servant's cards, without needing card RNG to cooperate at all.

### 6.2 Card manipulation (forcing which servant's cards appear in the draw)

Distinct from §6.1 — this doesn't change any card's *type*, it changes the *draw pool* itself, biasing or guaranteeing which servant's cards fill the 5-card hand:
- Ishtar (Archer): guarantees all 5 of her own cards are drawn, taking effect after 1 turn's delay.
- Altria Pendragon (**Ruler**) — not to be confused with Altria Pendragon (Saber)'s §6.1 mechanic, a common point of confusion since both are "Artoria": applies an "Unselectable" status to one chosen ally (excluding herself), then triggers a reshuffle — the unselectable ally's cards are excluded from the draw pool for that shuffle, so the remaining two servants' cards (typically herself plus one other) dominate the resulting hand.
- C.I.E.L. ("Idea Blood"): applies "Unselectable" to **all** other allies simultaneously, then reshuffles — this effectively forces a near-all-C.I.E.L. hand (or, since the buff persists through an Order Change swap, near-all-cards for whichever servant is swapped into her slot).

### 6.3 Card locking (freezing the current hand, no reshuffle at all)

A third, mechanically distinct effect: BB (Summer)'s "Faceless Moon" **locks the currently-dealt hand of 5 cards in place for 3 turns** — no reshuffle happens at all during that window (contrast with §6.2, which forces a *specific* reshuffle outcome; this skips shuffling entirely). The lock is broken by a party member's death, or by any other card-shuffle-triggering effect (Command Card Shuffle, Order Change). This is the only skill of its kind in the game per the community sources checked. Combined with §6.1/§6.2 (e.g. C.I.E.L. forces a favorable hand on turn 1, then BB (Summer) locks it for the following turns), this enables guaranteed repeated Brave/Mighty Chains across multiple turns — a real farming-strategy pattern documented in servant guides (see §6.4 sources) — which the simulation engine (file 09) needs to represent as a first-class planning primitive for the 3T Farm Optimizer, not just an edge case.

### 6.4 Engine implication and sources

The three mechanisms above are a deterministic override layer sitting on top of the base card-draw model — see §6.5 for that base model, now resolved. The simulator's `Action` model (file 09 §1) needs a dedicated action type for "apply a card-manipulation effect" distinct from "play a card," regardless of the base draw's own mechanics.

### 6.5 Base card-draw model: a "bag" system, not independent-per-turn random — resolved

File 09 §7's longest-standing gap ("Card-draw weighting/guarantee rule — no primary or Kyte-tier source found for exactly how the 5-of-15 non-NP card draw is weighted") is resolved by the project owner's own domain knowledge, corroborated by a follow-up research pass: **the 3 fielded servants' 15-card combined deck (5 cards each) is shuffled once and dealt down without replacement across a fixed 3-turn cycle — 5 of 15 on turn 1, 5 of the remaining 10 on turn 2, the remaining 5 on turn 3 — then the full 15-card pool reshuffles fresh for the next 3-turn cycle.** This is a classic "bag" (draw-without-replacement-until-exhausted) system, not independent uniform-random sampling each turn — every one of the 15 cards is guaranteed to be seen exactly once per 3-turn cycle, in a random order, rather than possibly repeating or being skipped within that window.

**Source tier: community-cross-corroborated** (multiple independent sources agree; no Atlas Academy/primary-schema-level source located, since this is client-side draw logic not exposed via the nice/raw API):
- GamePress combat-mechanics page: "the three Servants' decks are combined and shuffled, and then five cards are dealt each turn. After three turns, the now-empty card pool will be reset."
- Fandom Wiki's Command Cards page (most detailed): "you will be sequentially distributed 5 cards from each servant's respective deck for three turns... from Turns 1-3 you will have seen all Command Cards, after which the deck 'resets' and is then redistributed."
- BlueStacks guide: same reset-after-3-turns claim.
- Official fate-go.us PDF / Siliconera coverage: confirm the underlying "15-card deck, 5 dealt per turn" structure, consistent with (though not independently proving) the no-repeat-until-exhausted mechanic.

**Confirmed nuances**:
- This governs the **shown/dealt** 5-card hand each turn, independent of which 3 the player actually plays — the bag advances by "cards dealt," not "cards played."
- **Early reshuffle exception**: the Fandom source states the deck resets early if a party servant is defeated mid-cycle (their un-drawn cards presumably drop out of the bag) — not corroborated by a second source this pass, flagged **open, lower-priority nuance**.
- A manual reshuffle is also possible via "Command Shuffle"/Royal-Brand-style CEs, which presumably force an immediate fresh 15-card bag rather than waiting out the cycle — not further investigated this pass.
- NP cards are confirmed **not** part of this bag (consistent with existing project research, file 00/09) — they're additive whenever a servant's gauge is full, independent of the 15-card pool's state.
- ~~Whether the specific 5 cards shown within a single turn's draw carry any additional weighting~~ — **resolved (project owner's direct gameplay knowledge, follow-up pass)**: no, it's **purely random** which of the remaining un-drawn cards get selected each turn, with no guarantee-one-of-each-type-per-servant carried into the combined draw — confirmed by the project owner's direct observation that a single turn's hand can come from just **one** servant's deck entirely (all 5 cards from the same servant), which would be impossible under any "at least one of each type" or "spread across servants" weighting rule. GamePress's "at least one of each card type" note (§6.4) only describes a single servant's own 5-card deck *composition* (each servant's deck is built with a guaranteed spread of types), not any guarantee about which cards get drawn into a given turn's hand.

**Engine implication**: `BattleState` (file 09 §1) needs to track a persistent, per-battle **card-bag state** — the set of not-yet-dealt cards from the current 3-turn cycle — rather than re-rolling independently each turn. This changes the probability-of-clear/chain-probability math meaningfully: e.g. a Buster brave chain's probability on turn 2 is conditional on what was already dealt (and not drawn) on turn 1, not an independent draw from the full 15 each time. This is very likely why no source was found earlier when searching for a "weighting" formula — the mechanic isn't a weighting rule on an independent draw, it's a without-replacement depletion model, a structurally different kind of RNG than what was being searched for.

Sources (community guide-tier, not primary — the buff-type names in §6.1 are schema-confirmed, but exact numeric durations/interactions are not):
- https://gamewith.net/fate-grand-order/75739 ("Command Card and Chains Guide" — the "Card Manipulation" and "Card Type Change" servant tables, §6.1/§6.2)
- https://fgo.gamepress.gg/change-command-card-type-0 (servant list for §6.1)
- https://fgo.gamepress.gg/servant/bb-summer ("Faceless Moon" skill description, §6.3)
- https://fgo.gamepress.gg/rabbits-reviews-395-mysterious-executor-ciel-5-moon-cancer (C.I.E.L. "Idea Blood" mechanism and the C.I.E.L./BB(Summer)/Order-Change farming pattern, §6.2/§6.3/§6.4)
- `NiceBuffType` enum (live pull, this pass) — `changeCommandCardType`, `overwriteSvtCardType`, §6.1

## 7. Open items carried forward

- ~~Exact numeric effect of Arts Chain, Quick Chain, Brave Chain, Mighty Chain~~ — **resolved by a follow-up pass, see `06-traits-and-class-mechanics.md` §7** (community-sourced but cross-corroborated across 3+ independent authors, plus official-source confirmation of Mighty Chain's existence). The `*_CHAIN_INDIVIDUALITY` trait IDs turned out not to gate the actual bonus math (it's hardcoded client-side per chain composition, not a buff/function instance) — a live buff/function pull was never going to find it, which is why this was previously a dead end.
- Crit-chance-from-stars-on-hand formula and the stars-carried-over cap — not found in primary sources in this pass (§5.2); currently only community-sourced, flagged as needing either a deeper primary-source search or explicit "unverified" labeling before the engine hardcodes a number.
- ~~Card-draw base RNG model (bag vs. independent-per-turn)~~ — **resolved (§6.5, follow-up pass)**: it's a bag system, 15-card pool dealt down without replacement across a 3-turn cycle then reshuffled. Community-cross-corroborated (GamePress, Fandom Wiki, BlueStacks), sourced from the project owner's own domain knowledge. ~~Whether within-turn card selection has any additional weighting~~ — **also resolved**: purely random, no per-servant spread guarantee (confirmed by the project owner's observation that a single turn's hand can come entirely from one servant's deck). One smaller nuance remains open: the early-reshuffle-on-servant-death claim (single-sourced, Fandom only).
- Purpose of the `101`–`104` duplicate block in `NiceCard.json` (byte-identical to `1`–`4`) — not confirmed; doesn't affect any formula conclusion since values match, but worth understanding before assuming it's always safe to ignore.
- Extra Attack's two position keys (`1` vs `4`) and which applies when — not confirmed.
- `NiceServant.cardDetails` field's exact contents/purpose (distinct from `hitsDistribution`) — not decoded in this pass.
- Whether NP cards can critically hit — inferred "no" from the all-zero `NiceCard.json` stub for card type 5, not confirmed by an explicit primary-source statement.
- Card manipulation mechanics (§6): exact numeric durations/cooldowns and whether the community-sourced servant list is exhaustive — not primary-verified, only the buff-type existence is schema-confirmed.

## 8. Sources

- https://api.atlasacademy.io/export/JP/NiceCard.json (live-fetched, full table quoted in §1)
- https://github.com/atlasacademy/fgo-game-data-docs/blob/master/battle/critstars.md (star drop formula, §5.1)
- https://api.atlasacademy.io/export/JP/NiceConstant.json (live-fetched, chain/overkill constants, §3/§5.1)
- https://api.atlasacademy.io/nice/JP/servant/1100900 (Space Ishtar, live-fetched — source for hitsDistribution/npDistribution/starAbsorb/starGen example values, §2/§5.2)
- https://blogs.nrvnqsr.com/entry.php/3307-How-many-crit-stars-do-I-get-in-combat (original datamining source credited by critstars.md)
- Project owner's domain knowledge (session finding, not a written source) — the card-draw bag system description (15-card pool dealt without replacement across a 3-turn cycle, then reshuffled), §6.5
- https://fgo.gamepress.gg/combat-mechanics (community — bag-system corroboration, §6.5)
- https://fategrandorder.fandom.com/wiki/Command_Cards (community — most detailed bag-system corroboration, including the early-reshuffle-on-death nuance, §6.5)
