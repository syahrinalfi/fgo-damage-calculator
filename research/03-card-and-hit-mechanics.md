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

**What this file adds**: the community-standard understanding of what each chain type does (Buster Chain = a flat damage bonus applied via damage formula term 17's `busterChainMod`, confirmed in file 02 §2; Arts Chain = an NP-gauge bonus, not a damage bonus; Quick Chain = a bonus to critical star generation; Brave Chain = 3 cards from the **same servant** regardless of color, distinct from a "color chain" of 3 same-type cards from different servants) is **widely and consistently reported across independent community sources**, but **this research pass did not locate a primary-source (`fgo-game-data-docs` or live API) confirmation of the exact numeric effect of `CHAINBONUS_ARTS_RATE`/`CHAINBONUS_QUICK`** the way `CHAINBONUS_BUSTER_RATE` was confirmed to feed `busterChainMod` directly by name in `damage.md`. **This is flagged as a genuine sourcing gap, not silently assumed** — per the project's citation standard (file 00's intro: "every claim about actual FGO formulas/numbers will be sourced and cited"), the Buster-chain damage effect is the only one of the four chain types confirmed via primary source in this research pass; Arts/Quick/Brave chain's precise numeric formulas should be re-verified directly (e.g. by pulling a buff tagged with `ARTS_CHAIN_INDIVIDUALITY` as a `ckOpIndv`/`ckSelfIndv` condition and reading its actual function) before the engine hardcodes them — carried forward as an open item (§6).

## 4. Mighty Chain

`MIGHTY_CHAIN_INDIVIDUALITY` (trait 4107) confirms Mighty Chain (a chain using only 5★-rarity-equivalent cards, i.e. all 3 played cards individually hit the maximum per-card multiplier tier regardless of actual card rarity — a specific FGO UI/mechanic feature) is modeled through the same trait-tagging system as the other chain types, not a separate bespoke mechanic — consistent with file 00's "generic engine" decision. Exact numeric distinctions from a normal chain not confirmed in this pass (same sourcing-gap caveat as §3).

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

## 6. Open items carried forward

- Exact numeric effect of Arts Chain (NP gauge bonus), Quick Chain (star bonus), and Brave Chain (reported to also affect NP gauge/stars) — constants identified (§3) but not confirmed via primary source; only Buster Chain's damage effect is confirmed. Needs a live pull of a buff/function gated by the relevant `*_CHAIN_INDIVIDUALITY` trait to confirm.
- Mighty Chain's exact numeric distinction from a normal chain — not confirmed.
- Crit-chance-from-stars-on-hand formula and the stars-carried-over cap — not found in primary sources in this pass (§5.2); currently only community-sourced, flagged as needing either a deeper primary-source search or explicit "unverified" labeling before the engine hardcodes a number.
- Purpose of the `101`–`104` duplicate block in `NiceCard.json` (byte-identical to `1`–`4`) — not confirmed; doesn't affect any formula conclusion since values match, but worth understanding before assuming it's always safe to ignore.
- Extra Attack's two position keys (`1` vs `4`) and which applies when — not confirmed.
- `NiceServant.cardDetails` field's exact contents/purpose (distinct from `hitsDistribution`) — not decoded in this pass.
- Whether NP cards can critically hit — inferred "no" from the all-zero `NiceCard.json` stub for card type 5, not confirmed by an explicit primary-source statement.

## 7. Sources

- https://api.atlasacademy.io/export/JP/NiceCard.json (live-fetched, full table quoted in §1)
- https://github.com/atlasacademy/fgo-game-data-docs/blob/master/battle/critstars.md (star drop formula, §5.1)
- https://api.atlasacademy.io/export/JP/NiceConstant.json (live-fetched, chain/overkill constants, §3/§5.1)
- https://api.atlasacademy.io/nice/JP/servant/1100900 (Space Ishtar, live-fetched — source for hitsDistribution/npDistribution/starAbsorb/starGen example values, §2/§5.2)
- https://blogs.nrvnqsr.com/entry.php/3307-How-many-crit-stars-do-I-get-in-combat (original datamining source credited by critstars.md)
