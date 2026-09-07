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

## 7. Open items carried forward

- A live example of a servant/CE actually using `addIndividuality`/`subIndividuality` (temporary trait grant) was not found this session despite sampling several servants — the mechanism is schema-confirmed, but the concrete "how it looks in real data" confirmation file 04/05 achieved for other mechanics is still missing here.
- A live example of `overwriteBattleclass`/`overwriteClassrelatioAtk`/`overwriteClassrelatioDef`/`overwriteClassRelation` in use — same status.
- AND vs. OR semantics for multi-trait conditions (carried forward from file 05 §4, since it's the same trait-check machinery).
- Whether `void`/`none`/`default` attribute matchups are genuinely always-neutral by design, or simply undocumented in the exported table — inference only, not confirmed.

## 8. Sources

- Atlas Academy OpenAPI schema (`Trait` enum — 375 values; `Attribute` enum; `NiceTrait`; `NiceBuffType`/`NiceFuncType` — `addIndividuality`/`subIndividuality`/`overwriteBattleclass`/`overwriteClassrelatioAtk`/`overwriteClassrelatioDef`/`overwriteClassRelation`)
- https://api.atlasacademy.io/export/JP/NiceClassAttackRate.json (live pull, this session)
- https://api.atlasacademy.io/export/JP/NiceClassRelation.json (live pull, this session)
- https://api.atlasacademy.io/export/JP/NiceAttributeRelation.json (live pull, this session)
- `02-damage-formula.md` (original identification of these three files as the damage-formula's class/attribute terms)
- `05-buffs-and-debuffs.md` (trait-check machinery — `ckSelfIndv`/`ckOpIndv`/`BuffScript` conditional fields — reused here for field/temporary-trait mechanics)
