# 06 — Traits, Class Mechanics, and Attribute Affinity

This file documents the trait/individuality system (including temporary trait grants), the per-class base attack-rate table, the full class-advantage triangle matrix, and the attribute affinity triangle — closing file 00's "class/attribute system" domain concept and file 02's deferred `NiceClassAttackRate.json`/`NiceClassRelation.json`/`NiceAttributeRelation.json` value-cataloguing task.

Sources: the Atlas Academy OpenAPI schema (primary, official — `Trait`/`NiceTrait`/`Attribute` enums and field descriptions), and the **live static export files** `NiceClassAttackRate.json`, `NiceClassRelation.json`, `NiceAttributeRelation.json`, `NiceTrait`-backed `Trait` enum, fetched fresh this session (JP region, since these are region-invariant game-balance tables, not per-servant data).

---

## 1. Traits (individualities) — a fixed, named enum, not free-form tags

Every servant, enemy, card, and buff-condition trait check is drawn from one shared, closed enum called `Trait` in the OpenAPI schema (**375 distinct named values** as of this session's pull), wrapped per-instance by `NiceTrait { id, name, negative }` (the `negative` flag inverts the check — "does NOT have this trait" — used by conditions like Command Codes' "vs non-Servant"). Examples spanning the categories relevant to this project: `genderMale`/`genderFemale`, `classSaber`...`classGrandRuler` (one trait per class, redundant with but separate from the servant's own `classId`), `attributeEarth` etc. (ditto for attribute), `divine`, `undead`, `dragon`, `king`, `humanoid`, `servant`, `livingHuman`, plus a large block of **field traits** (`fieldForest`, `fieldCity`, `fieldBurning`, `fieldSunlight`, `fieldShore`, `fieldDarkness`, `fieldHeaven`, `fieldHell`, `fieldAir`, ...) and several **servant-specific narrative traits** used as hooks for that servant's own kit (`kingproteaGrowth`, `kingproteaProliferation`, `kingproteaInfiniteProliferation`, `kingproteaProliferationNPDefense`, `curse`, `cursedBook`, `marking`).

This directly confirms two things file 00 only assumed:
1. **Field/terrain buffs are literally implemented as traits** on the battlefield (§4 below), not a separate subsystem — "ATK up in Sky-attribute fields" is a plain `ckOpIndv`/`ckSelfIndv`-style trait check (file 05 §4) against a field trait like `fieldHeaven`, evaluated the same way as any unit trait check.
2. **Some traits exist purely as a servant's own private state-machine hook** (the `kingprotea*` family) — these aren't shared taxonomy traits like `divine`/`dragon`, they're a mechanism for one servant's kit to track its own escalating internal state (e.g. Kingprotea's stacking self-buff "Proliferation" count) using the same trait-add/trait-check machinery as everything else, rather than a bespoke counter field. **This is a reusable engine pattern**: any servant with a "stacks"/"counter" mechanic in their kit can, in principle, be implemented as "grant N copies of a private trait, then have other functions check `ckSelfCountIndividuality`/`ckIndvCountAbove` (file 05 §4) against it" — worth checking against a live example when such a servant's kit is modeled in detail (deferred, not urgent).

## 2. Temporary trait grants — mechanism confirmed, live example not found this session

`NiceBuffType` (file 05 §1) includes `addIndividuality` and `subIndividuality` as dedicated buff types, and `NiceFuncType` includes matching function types of the same name — i.e., a skill/NP can grant (or strip) a trait on a target for a buff's duration, using the exact same `addState`/`Turn`/`Count` duration model as every other buff (file 05 §7). This is the primary-source confirmation of the mechanism file 00 §4 asked about ("some skills add temporary traits to self or enemies... King Proteus, Bazett's Black Keys equip").

**Not yet found**: a live servant/CE function actually using `addIndividuality`/`subIndividuality` (several servants were sampled this session — Kingprotea, Space Ishtar, and a handful of others — without hitting one; these functions appear to be rarer in practice than their schema presence suggested). This doesn't cast doubt on the mechanism (it's a named, real funcType/buffType pair, not inferred), only on which specific servant's kit demonstrates it — flagged **open**, worth a targeted look (rather than random sampling) when a specific known example is identified, e.g. via a future file/mgrep pass.

## 3. Class-based attack rate — a flat per-class table, not matchup-dependent

Source: live `NiceClassAttackRate.json` (JP export). This is the `classAtkBonus` term (file 02's damage-formula term 04) — a **flat, single-value-per-class multiplier**, independent of the target's class (that's the separate triangle table, §4):

| Class | Rate | Class | Rate |
|---|---|---|---|
| Saber | 1000 (1.0×) | Berserker | 1100 (1.1×) |
| Archer | 950 (0.95×) | Ruler | 1100 (1.1×) |
| Lancer | 1050 (1.05×) | Avenger | 1100 (1.1×) |
| Rider | 1000 (1.0×) | Shielder | 1000 (1.0×) |
| Caster | 900 (0.9×) | AlterEgo | 1000 (1.0×) |
| Assassin | 900 (0.9×) | MoonCancer | 1000 (1.0×) |

(Values are per-mille, matching the project's established 1000=100% convention.) Nearly every "Extra"/Beast/collab class defaults to 1000 (neutral); a handful of one-off event classes carry non-default values (e.g. `agarthaPenth`/`111` at 1100) — the engine should look these up from the live table by class id/name rather than hardcode only the 8 base classes, since new classes are added over time and some carry non-1000 rates.

## 4. Class advantage triangle — full matchup matrix, not a simple 3-way cycle

Source: live `NiceClassRelation.json` (JP export) — a full `{ attackerClass: { targetClass: rate } }` matrix (**not** a simple symmetric 3-class cycle; every class has an entry for every other class). This is `triangleModifier` (damage-formula term 05, file 02).

Confirmed matchups relevant to the classic triangle: Saber → Lancer = 2000 (2.0×, advantage), Saber → Archer = 500 (0.5×, disadvantage) — i.e. the well-known Saber-beats-Lancer-beats-Archer-beats-Saber cycle is exactly this table's diagonal-ish structure for the three base classes, expressed as real per-mille values rather than a hardcoded "±100%" assumption.

**Berserker and Ruler are special-cased across the whole matrix, confirmed by checking every base class's row**:
- **Every class deals 2000 (2.0×) to Berserker**, *except* Berserker itself (1500, 1.5×) and **Shielder** (1000, 1.0× — Shielder is the one class that does **not** get bonus damage against Berserker, a genuine exception worth flagging since "everyone beats Berserker" is the common simplification).
- **The three base "knight" classes (Saber/Archer/Lancer) deal only 500 (0.5×) to Ruler**, consistent with Ruler's known design intent of resisting the base triangle — but most Extra/special classes (Caster/Assassin here included, alongside AlterEgo/Foreigner/Pretender) deal only 1000 (neutral) to Ruler, not the 0.5× the three knight classes get, and **Avenger deals 2000 (2.0×) to Ruler** — a genuine asymmetric outlier, not a "same rule for all non-triangle classes" pattern.

**Engine implication**: the class-triangle multiplier must be read as a full **N×N lookup table keyed by (attacker class, target class)**, never computed from a simplified "3-way cycle + flat modifier for special classes" rule — the real table has per-class exceptions that a hardcoded simplification would get wrong (the Shielder-vs-Berserker case above is a concrete, checkable example of exactly this kind of trap).

A related buff-type family exists for **overriding** this table mid-battle: `overwriteBattleclass`, `overwriteClassrelatioAtk`, `overwriteClassrelatioDef`, `overwriteClassRelation` (all confirmed present in `NiceBuffType`, file 05 §1) — these let a specific skill/NP effect make a unit "count as" a different class for triangle-calculation purposes, or override the attack-side/defense-side relation value directly. No live example found this session (flagged **open**, same status as §2's temporary-trait-grant gap) — but the mechanism's existence is schema-confirmed, so the engine's class-triangle lookup should be a function of "effective class for this calculation" (which can be overridden per-buff), not a hardcoded read of the unit's own `classId`.

## 5. Attribute affinity triangle

Source: live `NiceAttributeRelation.json` (JP export) — a full 5×5 matrix over `human` (= "Man" in community terminology), `sky`, `earth`, `star`, `beast`:

| Attacker ↓ / Target → | Human | Sky | Earth | Star | Beast |
|---|---|---|---|---|---|
| **Human** | 1000 | **1100** | 900 | 1000 | 1000 |
| **Sky** | 900 | 1000 | **1100** | 1000 | 1000 |
| **Earth** | **1100** | 900 | 1000 | 1000 | 1000 |
| **Star** | 1000 | 1000 | 1000 | 1000 | **1100** |
| **Beast** | 1000 | 1000 | 1000 | **1100** | 1000 |

This confirms two distinct sub-structures within the one affinity system, not one uniform rule:
- **Human → Sky → Earth → Human** is a genuine 3-way advantage cycle (each beats the next at 1.1×, loses to the one before at 0.9×) — the classic "Man/Sky/Earth" triangle.
- **Star ↔ Beast is a mutual, non-cyclical pair**: Star deals 1.1× to Beast *and* Beast deals 1.1× to Star — both directions favor the attacker, unlike the human/sky/earth cycle where one direction is a penalty. This is a genuinely different relationship shape (both-attack-bonus rather than win/lose), not an oversight in reading the table — worth calling out since it's easy to mis-model by assuming every attribute pair follows the same win/lose cycle logic as human/sky/earth.
- Every other combination (e.g. human ↔ star, sky ↔ beast) is neutral (1000, 1.0×) — attribute affinity only ever applies within these two defined groups, not universally across all five.

**`void` and `none`/`default` attributes are not represented in this table at all** (the `Attribute` enum has 8 values — `none`, `default`, `human`, `sky`, `earth`, `star`, `beast`, `void` — but the relation table only has entries for the 5 "real" ones). The engine should treat any matchup involving `void`/`none`/`default` as neutral (1000, 1.0×) by omission, not as a data gap to fill in — no primary source states this explicitly, so it's an **inference from the table's shape**, not a confirmed fact; flagged accordingly.

## 6. What is *not* covered by these tables (scope note)

The `NiceClassBoard`/`class-board` endpoint family (also surfaced while searching the schema for "class"-related paths) is the separate **"Class Score"** meta-progression system (a skill-tree-like structure unlocked per class via a different currency), unrelated to per-battle damage calculation — explicitly out of scope for this file and flagged here only so a future pass doesn't confuse it with the combat-relevant class tables above.

## 7. Command card chain mechanics — Buster/Arts/Quick chains, Brave Chain, Mighty Chain (follow-up pass, resolves file 03 §3/§4's open item)

File 03 §3 flagged Arts/Quick/Brave chain's exact numeric effects as a genuine sourcing gap (only `busterChainMod`/Buster Chain had a primary-source citation, via `fgo-game-data-docs`' `damage.md`). A prior research pass (file 00, file 09 §7) additionally searched the live API's `function/search`/`buff/search` across the `BUSTER_CHAIN_INDIVIDUALITY`...`MIGHTY_CHAIN_INDIVIDUALITY` trait IDs (4104–4108, file 03 §3) and grepped every `fgo-game-data-docs` battle-formula markdown file, finding nothing beyond Buster's — and concluded this was a dead end. **That conclusion is now understood to have the right symptom but the wrong diagnosis**: these mechanics are not missing from the docs because no one has sourced them, they're missing because **they are not implemented as buff/function instances at all** — they're **hardcoded terms directly in the client's own damage/NP-gain/star-drop formulas**, evaluated from the chain's card composition at calculation time, not from a `NiceBuff`/`NiceFunction` the trait IDs would gate. This is exactly the same shape as the already-documented `firstCardBonus`/`cardMod`/`extraCardModifier` terms (file 02) — a formula input derived from "what cards are in this chain," not a buff lookup. That's why searching `function/search`/`buff/search` for the trait IDs turned up nothing: the trait IDs exist (confirmed present in `NiceConstant`/schema, file 03 §3) but the actual bonus math lives in the client's damage-calculation code, not behind a function keyed to them.

**Sourcing tier for this section**: two distinct tiers, stated explicitly per claim below —
- **Official/primary**: the *existence and high-level effect* of Mighty Chain comes from Fate/Grand Order's own official FAQ site (`faq.fate-go.jp`, JP) and was covered by Anime News Network's report on the game's 7th Anniversary battle-system overhaul (2022-07-31 JP) — this is the game producer's own announcement, not a community reverse-engineering effort.
- **Community, but cross-corroborated across independent authors**: the exact numeric tables (per-position card modifiers, first-card-bonus values, same-type-chain bonus values, Brave Chain's extra-attack multipliers) come from three independent write-ups that state identical numbers with no discrepancy — GamePress' `Combat Mechanics` page, the Fate/Grand Order Fandom wiki's `Battle/Damage Calculation` page (which spells out the full card-damage formula symbolically), and an independently-authored fan technical doc (`zippy37.github.io/FCC-technical-documentation`) that also spells out the full formula and matches the Fandom wiki term-for-term — further cross-checked against a Korean-language wiki (NamuWiki) citing the same figures. Treated as reliable given this level of independent agreement, but explicitly **not** an Atlas Academy/primary-source citation the way the rest of this project's formulas are — flagged per this project's sourcing standard (file 00's intro).

### 7.1 Card base modifiers by position (context for the chain bonuses below)

| Card type | 1st position | 2nd position | 3rd position |
|---|---|---|---|
| Buster (damage%) | 150% | 180% | 210% |
| Arts (NP-gain%) | 300% | 450% | 600% |
| Quick (star-drop%) | 80% | 96% (dmg) / 130% (star) | 112% (dmg) / 180% (star) |

(NPs are always treated as the 1st-position value of their own color; Extra Attack — the 4th card, only reachable via Brave/Mighty Chain, see §7.3 — uses a flat 100% card modifier regardless of position, with its own separate multiplier applied on top, §7.3.) Buster's NP-gain is always 0% at any position; Arts' star-drop is always 0% at any position — each card type only contributes to its own "specialty" stat at any real magnitude, consistent with file 00's original three-way Buster=damage/Arts=NP/Quick=star framing, now with exact per-position numbers.

### 7.2 First-card bonus and same-type ("color") chains

**First-card bonus** — whichever color leads the chain grants a bonus to *every* card in that chain (not just itself):
- Buster leads → **+50%** flat addition to the damage-modifier term (additive to the card-modifier term itself, not a separate multiplier — matches `damage.md`'s `busterChainMod`-adjacent structure already confirmed in file 02).
- Arts leads → **+100%** flat addition to the NP-gain modifier (e.g. Arts 300%→400%, Buster 0%→100%, Quick 100%→200%).
- Quick leads → **+20% critical-star generation rate**, plus (as of the 7th Anniversary update, §7.4) **+20% critical chance for all 5 hand cards** — this specific Quick first-card addition did not exist pre-2022-07-31 and should not be assumed present if the engine ever needs to model pre-update balance.

**Same-type ("color") chain** — 3 cards of the same type in one turn (servants may differ), on top of whichever first-card bonus already applies:
- **Buster chain**: each non-NP Buster card gains **+20% of the attacking servant's ATK as flat additive bonus damage** — unaffected by ATK/DEF buffs or class advantage (this is the one chain effect already primary-source-confirmed pre-this-pass, via `damage.md`'s `busterChainMod`, file 02 §2 — now cross-confirmed by every community source checked here too, so no discrepancy).
- **Arts chain**: **+20% NP gauge** to every servant whose card is in the chain (not just the chain's own servant(s) — all 3, even across different servants).
- **Quick chain**: **+20 critical stars** for the next turn (pre-2022-07-31: +10 — see §7.4 for the version boundary), plus the standing +20% star-generation-rate and +20% crit-chance-for-all-cards from the first-card bonus if Quick also led.

### 7.3 Brave Chain — 3 cards from the same servant (any colors), unlocks a 4th "Extra Attack"

A **Brave Chain** is 3 cards played from the **same servant**, regardless of color (distinct from a same-type/"color" chain, which requires same color but allows different servants — file 03 §3 already drew this distinction correctly). Playing a Brave Chain unlocks a 4th card played automatically as an **Extra Attack**, using a flat 100% card modifier (§7.1) multiplied by an **extra-attack multiplier** that depends on whether the 3 cards were also same-colored:

| Brave Chain composition | Extra Attack multiplier |
|---|---|
| Same servant, mixed colors (e.g. QAB from one servant) | **200% (2.0×)** |
| Same servant, same color (e.g. BBB from one servant — a same-type chain **and** a Brave Chain at once) | **350% (3.5×)** |

**Sourcing upgrade (follow-up pass)**: these two multipliers are no longer purely community-cross-corroborated — Atlas Academy's own official `damage.md` (the same primary source already cited for the master damage formula, file 02) names them directly: `NiceConstant.EXTRA_ATTACK_RATE_SINGLE = 2` (the 2.0× mixed-color case) and `NiceConstant.EXTRA_ATTACK_RATE_GRAND = 3.5` (the 3.5× same-color case), both feeding the damage formula's `extraCardModifier` term. This is now a primary-source-confirmed pair of constants, not just a cross-corroborated community figure.

The Extra Attack does **not** receive first-card bonus in the normal sense — instead, whichever first-card-bonus corresponds to the chain's actual lead card applies once to the Extra Attack too (mismatched-color case), or **all three** first-card-bonus effects apply simultaneously if all 3 cards (and hence the chain) are the same color. NPs cannot occupy the Extra Attack slot and do not benefit from Brave Chain's flat-ATK Buster-chain bonus even when the Brave Chain is all-Buster.

### 7.4 Mighty Chain — official mechanic added 2022-07-31 (7th Anniversary), resolves `MIGHTY_CHAIN_INDIVIDUALITY` (trait 4107)

**This section corrects file 03 §4**, which described Mighty Chain (based on the trait's mere existence, without a confirmed definition at the time) as "a chain using only 5★-rarity-equivalent cards" — that description is **wrong** and should be discarded; the real mechanic, confirmed via Fate/Grand Order's own official FAQ site and covered by Anime News Network's 7th-Anniversary battle-system-overhaul report (2022-07-31 JP), is:

**Mighty Chain**: triggered by playing **one card of each type — Quick, Arts, Buster ("QAB")** — in a single turn. **Order does not matter, and the three cards may belong to different servants** (unlike Brave Chain, which requires one servant). All three played cards (not the Extra Attack, unless the Mighty-Brave case below applies) gain:
- ATK **+50%**
- NP Gain Up
- Critical Star Drop Rate Up
- Critical Chance **+20%** (for all cards, same shape as the post-update Quick first-card-bonus, §7.2 — these can stack if the chain also happens to start with Quick)

**Mighty Brave Chain** — if the QAB chain also happens to use 3 cards from the **same servant** (i.e. Brave Chain + Mighty Chain conditions both met simultaneously — every servant has at least one card of each type, so this is always physically possible for any single servant), all of the above Mighty Chain effects **also apply to the Extra Attack**, with one explicit exception: **the +20% critical-chance bonus does not extend to the Extra Attack** (confirmed specifically by the Japanese-language announcement coverage — `inside-games.jp` — not stated in any English-language source checked, so flagged as the one detail sourced from a single outlet rather than cross-corroborated like §7.1–7.3).

**Same-source community numeric tables give worked totals for specific QAB orderings** (GamePress): QAB order totals 560% combined damage/NP/star value (highest among mixed-color combos, second only to BBB overall), ABQ totals 542% (highest star generation among mixed combos, second only to QQQ), BQA totals 536% (highest NP gain among mixed combos, second only to AAA) — these differences arise because Mighty Chain's own flat bonuses are order-independent, but each card's own position-based modifier (§7.1) still depends on which slot (1st/2nd/3rd) it occupies, so ordering still matters for the base card values even though it doesn't matter for whether Mighty Chain triggers at all.

**Version-boundary flag**: everything in this §7.4, plus the Quick first-card +20%-crit-chance addition and the Quick-chain 10→20 star increase (§7.2), all originate from the **same single patch** (2022-07-31 JP, "7th Anniversary battle system overhaul") — if the engine ever needs to model pre-update balance (e.g. for historical/JP-vs-NA version parity, since NA received this update later on its own timeline), all three of these should be treated as one bundled toggle, not three independent unconfirmed constants.

### 7.5 Open items from this pass

- The exact percentage value of Mighty Chain's "NP Gain Up" and "Critical Star Drop Rate Up" (only "+50% ATK" and "+20% crit chance" have confirmed numbers in the sources checked this pass) — flagged for a future targeted look, ideally at a primary source now that the mechanic's *existence* is official-confirmed (ideal next step: search `NiceConstant` again now that "Mighty Chain"/"QAB" is a known search term, rather than the previous pass's trait-ID-only search).
- Whether NA's release timeline received this 7th-Anniversary battle overhaul simultaneously with JP or on its own delayed schedule — relevant if the engine needs a region toggle (file 01 already established region is a first-class dimension for data freshness; this may be another instance of that same need).
- The Mighty-Brave-Chain "+20% crit chance doesn't apply to Extra Attack" detail (§7.4) is sourced from a single Japanese-language outlet, not cross-corroborated the way the rest of this section is — worth a second source before treating it as certain.

## 8. Open items carried forward

- A live example of a servant/CE actually using `addIndividuality`/`subIndividuality` (temporary trait grant) was not found this session despite sampling several servants — the mechanism is schema-confirmed, but the concrete "how it looks in real data" confirmation file 04/05 achieved for other mechanics is still missing here.
- A live example of `overwriteBattleclass`/`overwriteClassrelatioAtk`/`overwriteClassrelatioDef`/`overwriteClassRelation` in use — same status.
- AND vs. OR semantics for multi-trait conditions (carried forward from file 05 §4, since it's the same trait-check machinery).
- Whether `void`/`none`/`default` attribute matchups are genuinely always-neutral by design, or simply undocumented in the exported table — inference only, not confirmed.
- Items carried forward from §7.5 (chain mechanics): exact % for Mighty Chain's NP-gain/star-drop-rate bonuses; NA-vs-JP timing of the 7th-Anniversary battle overhaul; second-source confirmation of the Mighty-Brave-Chain crit-chance exception.

## 9. Sources

- Atlas Academy OpenAPI schema (`Trait` enum — 375 values; `Attribute` enum; `NiceTrait`; `NiceBuffType`/`NiceFuncType` — `addIndividuality`/`subIndividuality`/`overwriteBattleclass`/`overwriteClassrelatioAtk`/`overwriteClassrelatioDef`/`overwriteClassRelation`)
- https://api.atlasacademy.io/export/JP/NiceClassAttackRate.json (live pull, this session)
- https://api.atlasacademy.io/export/JP/NiceClassRelation.json (live pull, this session)
- https://api.atlasacademy.io/export/JP/NiceAttributeRelation.json (live pull, this session)
- `02-damage-formula.md` (original identification of these three files as the damage-formula's class/attribute terms)
- `05-buffs-and-debuffs.md` (trait-check machinery — `ckSelfIndv`/`ckOpIndv`/`BuffScript` conditional fields — reused here for field/temporary-trait mechanics)
- `03-card-and-hit-mechanics.md` §3/§4 (originating open item this section's §7 resolves; also the source of the now-corrected Mighty Chain description)
- https://faq.fate-go.jp/faq/show/1246?site_domain=default (official FGO JP FAQ, "Quick card / Quick Chain overhaul" notice, 2023-02-23 archive of the 2022-07-31 change — official/primary for Mighty Chain's existence and the Quick-card changes, §7.4)
- https://www.animenewsnetwork.com/interest/2022-08-02/fate-grand-order-announces-big-gameplay-changes-for-its-7th-anniversary/.188239 (English-language report on the same official 2022-07-31 battle-system overhaul, §7.4)
- https://www.inside-games.jp/article/2022/07/31/139540.html (Japanese games-news coverage of the same patch — sole source for the Mighty-Brave-Chain "+20% crit doesn't apply to Extra Attack" detail, §7.4)
- https://gamepress.gg/grandorder/combat-mechanics and https://fgo.gamepress.gg/combat-mechanics (community, cross-corroborated — per-position card modifier tables, first-card-bonus values, same-type-chain bonus values, Mighty Chain ordering examples, §7.1–7.4)
- https://fategrandorder.fandom.com/wiki/Battle/Damage_Calculation (community, cross-corroborated — full symbolic damage formula including Extra Attack/Brave Chain multiplier table, §7.1/§7.3)
- https://zippy37.github.io/FCC-technical-documentation/ (community, cross-corroborated — independently-authored full damage-formula writeup matching the Fandom wiki term-for-term, §7.3)
- https://en.namu.wiki/w/Fate/Grand%20Order/%EA%B3%84%EC%82%B0%EC%8B%9D (Korean-language community wiki, cross-checked for the same Extra Attack multiplier figures, §7.3)
- https://github.com/atlasacademy/fgo-game-data-docs/blob/master/battle/damage.md (official, live-fetched follow-up pass — `NiceConstant.EXTRA_ATTACK_RATE_SINGLE`/`EXTRA_ATTACK_RATE_GRAND` named directly, upgrading §7.3's sourcing tier from community-only to primary-confirmed)
