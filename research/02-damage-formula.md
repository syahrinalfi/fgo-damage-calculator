# 02 — The Damage Formula

This file documents the single-hit damage formula that underlies every card/NP hit in the simulation engine, sourced from Atlas Academy's own formula documentation (not reverse-engineered or approximated). It resolves several of file 00's open questions about multiplier order, buff stacking, and Overcharge scaling.

## 1. The formula, verbatim

Source: [`fgo-game-data-docs/battle/damage.md`](https://github.com/atlasacademy/fgo-game-data-docs/blob/master/battle/damage.md), which itself credits the original datamining write-up at [blogs.nrvnqsr.com](https://blogs.nrvnqsr.com/entry.php/3309-How-is-damage-calculated).

```
damage for this card =
(01)    servantAtk
(02)    * npDamageMultiplier
(03)    * {firstCardBonus + [cardDamageValue * max(1 + cardMod, 0)]}
(04)    * classAtkBonus
(05)    * triangleModifier
(06)    * attributeModifier
(07)    * randomModifier
(08)    * 0.23
(09)    * max(1 + atkMod - defMod, 0)
(10)    * criticalModifier
(11)    * extraCardModifier
(12)    * max(1 - specialDefMod, 0)
(13)    * max([1 + powerMod + selfDamageMod + (critDamageMod * isCrit) + (npDamageMod * isNP)], 0.001)
(14)    * [1 + ((superEffectiveModifier - 1) * isSuperEffective)]
(15)    + dmgPlusAdd
(16)    + selfDmgCutAdd
(17)    + (servantAtk * busterChainMod)

damage = Math.Floor(Math.Max(damage, 0))
```

This **directly answers file 00 §6's first open question** ("is the master formula strictly multiplicative in a fixed order, or are some categories summed before multiplying?"): it is a **fixed-order chain of 14 multiplicative terms (01–14)**, followed by **three additive terms (15–17)** tacked on at the very end (flat damage bonuses/self-damage-cut, and the Buster-chain flat bonus) — not a single flat sum-then-multiply. Within term (13), several sub-modifiers (`powerMod`, `selfDamageMod`, conditional crit/NP damage mods) **are** summed together *before* that one term is applied as a single multiplicative factor — so "some buff categories are summed before multiplying" is true, but only inside specific bracketed terms, not as a general rule across the whole formula. Each bracketed term is its own independent multiplicative slot; what varies is whether that slot's *internal* inputs are pre-summed (like term 13) or looked up as a single value (like term 04's class bonus).

## 2. Term-by-term definitions

| # | Term | Meaning | Source (constant/field) |
|---|---|---|---|
| 01 | `servantAtk` | The attacking servant's total ATK at their current level/ascension (file 00's "level-scaled stats" decision — this is the pre-computed ATK value, not something the formula itself scales). | `NiceServant.atkBase`/`atkGrowth` interpolated to actual level (file 01 §3) |
| 02 | `npDamageMultiplier` | The NP's own base damage multiplier for this specific hit. For a normal (non-NP) card, this term is effectively 1 (no NP multiplier applies). | The NP's damage-function `svals`/`svals2`.../`svals5` value at the servant's actual NP level — see §4 (Overcharge) below |
| 03 | `firstCardBonus + [cardDamageValue * max(1 + cardMod, 0)]` | The card-type-specific base multiplier (different for 1st/2nd/3rd card position, and for Quick/Arts/Buster/Extra), boosted by `cardMod` (net ATK%-up-vs-DEF%-down buffs affecting card damage specifically). | `NiceCard.json` → `card.order.addAtk` (firstCardBonus) and `card.order.adjustAtk` (cardDamageValue); `cardMod` = `actor.commandAtk - target.commandDef` (buff-action lookup, see §3) |
| 04 | `classAtkBonus` | Per-class baseline attack-rate multiplier (e.g. Berserker's well-known +ATK/-DEF baseline is expressed partly here). | `NiceClassAttackRate.json` |
| 05 | `triangleModifier` | The 3-class advantage/disadvantage triangle multiplier (attacker class vs target class). | `NiceClassRelation.json` |
| 06 | `attributeModifier` | The Man/Earth/Sky/Star/Beast attribute affinity triangle multiplier. | `NiceAttributeRelation.json` |
| 07 | `randomModifier` | Per-hit damage variance roll. | Range confirmed via `NiceConstant.json`: `ATTACK_RATE_RANDOM_MIN` = 900, `ATTACK_RATE_RANDOM_MAX` = 1100 → **0.90–1.10**, exactly matching file 00's assumed "~0.9–1.1 variance band." |
| 08 | `0.23` | A fixed global damage-scaling constant, not a buff-derived term. | `NiceConstant.json` → `ATTACK_RATE` = 230 (i.e. 230/1000 = 0.23) |
| 09 | `max(1 + atkMod - defMod, 0)` | Net ATK%-up minus DEF%-down/DEF%-up, floored at 0 (can't go negative — a maximally-defended target can reduce this term to exactly 0, not flip it negative). | `atkMod` = `actor.atk` buff action; `defMod` = `target.defence`, or `target.defencePierce` if the attacking NP is a defense-piercing NP (a distinct buff-action lookup — confirms "defense-ignoring" from file 00 §4 is a real, separate mechanic, not just a manual override) |
| 10 | `criticalModifier` | Flat critical-hit damage multiplier, applied only if this hit is a crit (see `isCrit` in term 13 for the *variable* crit-damage-up buff stacking — this term 10 is the fixed base). | `NiceConstant.json` → `CRITICAL_ATTACK_RATE` = 2000 → **2.0x** base crit multiplier, confirming file 00's assumed "base 2x + buffs" model, with "+buffs" living in term 13's `critDamageMod`, not here. |
| 11 | `extraCardModifier` | Only relevant to the Extra/Arts-Extra "5th card" attack after a chain; different values for a same-color ("Grand"/rainbow... actually see note) chain vs a normal one. | `NiceConstant.json` → `EXTRA_ATTACK_RATE_GRAND` = 3500 (3.5x, "color brave chain") vs `EXTRA_ATTACK_RATE_SINGLE` = 2000 (2.0x, otherwise) — only applies to the Extra card itself, per the source comment. |
| 12 | `max(1 - specialDefMod, 0)` | A *separate* defense-ignoring-adjacent term from term 09's `defMod` — a target's "special defense" (e.g. specific trait-based damage cut) reduces this multiplicatively, again floored at 0. | `target.specialdefence` buff action |
| 13 | `max([1 + powerMod + selfDamageMod + (critDamageMod * isCrit) + (npDamageMod * isNP)], 0.001)` | The main "everything else" bucket: general ATK%-up-from-skills (`powerMod`, itself a sum of several sub-categories — see below), self-inflicted-damage-taken modifiers, crit-damage-up (only if this hit is a crit), NP-damage-up (only if this hit is an NP). Floored at a **non-zero** minimum (0.001, not 0) — meaning this bucket can suppress damage to nearly-nothing via heavy debuffs but the formula never lets it hit exactly 0 or go negative through this term alone. | `powerMod` = sum of **four** distinct buff actions: `actor.damage` (general damage-up), `actor.damageIndividuality` (trait-conditional damage-up, e.g. "vs Male" — this is the Euryale-style mechanism, confirmed as its own dedicated buff-action slot rather than a hack), `actor.damageIndividualityActiveonly`, and `actor.damageEventPoint` (event-point-drop-linked damage buffs); `selfDamageMod` = `target.selfdamage`; `critDamageMod` = `actor.criticalDamage`; `npDamageMod` = `actor.npdamage` |
| 14 | `[1 + ((superEffectiveModifier - 1) * isSuperEffective)]` | "Super effective" bonus damage vs a specific trait (e.g. many NPs deal bonus damage "vs Undead"/"vs specific enemy category") — only applies its bonus if `isSuperEffective` (the target actually has the required trait) is true; otherwise this term is exactly 1 (neutral). | `superEffectiveModifier` = the relevant `NiceFunction`'s **Correction** value (a `Vals.Correction` field, confirmed to exist in file 01 §3) — this is the concrete mechanism behind file 00's "class/attribute-restricted" and trait-conditional damage bonuses on specific NPs. |
| 15 | `dmgPlusAdd` | A flat, additive (not %) damage bonus. | `actor.givenDamage` buff action |
| 16 | `selfDmgCutAdd` | A flat, additive damage **reduction** applied on the defender's side. | `target.receiveDamage` buff action |
| 17 | `servantAtk * busterChainMod` | The Buster **chain bonus** (3 Buster cards played together) — added as a flat extra chunk of (attacker ATK × a rate), not as a multiplier on the whole formula. | `busterChainMod` from chain-bonus constants (see §5) |

Final result is floored to an integer and clamped to a minimum of 0 (`Math.Floor(Math.Max(damage, 0))`) — so even a maximally-debuffed hit that would mathematically go negative from the additive terms (15–17) still deals exactly 0, not negative damage.

## 3. How buffs resolve into each term's modifier value (the "buff action" system)

Source: [`fgo-game-data-docs/battle/buff.md`](https://github.com/atlasacademy/fgo-game-data-docs/blob/master/battle/buff.md). Every modifier referenced above (`atkMod`, `defMod`, `cardMod`, `powerMod`'s sub-parts, etc.) is not read from a single buff — it's a **"buff action"**, computed by summing all currently-active buffs that map to that action, then applying bounds:

```python
num = buffAction.baseParam + (total plusTypes buffs values) - (total minusTypes buff values)

if buffAction.limit in (normal, lower):
    if num < 0:
        num = 0

num = num - buffAction.baseValue

if buffAction.limit in (normal, upper):
    if maxRate < num:
        num = maxRate

return num
```

**This directly resolves file 00 §6's buff-stacking questions**: within one buff action (e.g. "ATK up"), **multiple sources of the same action stack additively** (summed as integers, e.g. ten copies of a +50 ATK-up skill sum to +500 before any cap), **then the combined total is clamped by that action's `maxRate`** (sourced per-buff from the buff's own `maxRate` field, confirmed to exist in file 01 §3's `NiceBuff` schema — "if there are multiple buffs, the last `maxRate` is used"). So: **additive stacking within an action, with a per-action hard ceiling** — not unlimited additive, and not multiplicative-per-source. This is the authoritative answer to file 00's "buff stacking caps/limits" open concept: the cap is `maxRate`, defined per buff, looked up per buff action, and it's an upper (and for some actions, lower/floor) bound on the *summed* total, not a per-source limit.

Buff actions relevant to the damage formula (from `NiceBuffList.ActionList.json`, cited by name in damage.md) include (non-exhaustive, the ones actually named in the source): `commandAtk`/`commandDef` (card-specific ATK/DEF, → `cardMod`), `atk`/`defence`/`defencePierce`/`specialdefence` (→ `atkMod`/`defMod`/`specialDefMod`), `damage`/`damageIndividuality`/`damageIndividualityActiveonly`/`damageEventPoint` (→ the four `powerMod` sub-sums), `selfdamage`, `criticalDamage`, `npdamage`, `givenDamage`, `receiveDamage`. Each of these is its own independently-summed, independently-capped bucket — a buff can only contribute to the one action its `type` maps to, it cannot "spill over" into a different term.

## 4. NP damage and Overcharge — resolving file 00's OC-scaling question

The NP's damage contribution is term (02), `npDamageMultiplier`, drawn from the NP's own damage-dealing `NiceFunction`'s `svals` array (file 01 §3), indexed by the servant's actual **NP level** (1–5) — confirming file 00's "NP level directly changes the NP damage-multiplier `svals` entry read" decision is exactly correct, not an approximation.

**Overcharge (OC) does not universally rescale the primary damage multiplier.** The well-documented community finding (cross-checked via multiple independent sources, not just one) is: **NP level governs the base damage multiplier; Overcharge governs *secondary* effects bundled in the same NP** (extra hit counts, buff potency, added debuff chance, bonus function activation, etc.) — for the *large majority* of NPs, the primary damage function itself is read from `svals` only (no OC scaling), while a **different function within the same NP** (e.g. an attached buff-grant or hit-count-increase function) is the one that actually has populated `svals2`/`svals3`(/`svals4`/`svals5`) — read at whichever OC-bracket the gauge was at when the NP was cast. This is why "NP1 OC100% vs NP1 OC300%" deals the *same* damage for most servants, but a *different* secondary effect (e.g. bigger party buff, extra Arts-card-conversion, more hits). A minority of NPs *do* have OC-scaling on the damage function itself (this is a per-NP design choice, not a rule) — **this must be checked per-servant against their actual `functions[].svals2..5` population**, not assumed either way.

This resolves file 00 §6's open question about "OC beyond 300%" concretely at the schema level: `svals4`/`svals5` exist specifically so a NP (or a buff that artificially raises effective OC past the normal 300% gauge cap) can have OC4/OC5-specific values *for whichever function actually needs them* — it's not a single "OC max" constant hardcoded anywhere the engine would need to special-case; the engine should simply **always check for the presence of `svals4`/`svals5`** on every function of every NP, rather than assuming 3 brackets, per file 00's existing decision not to hardcode a 300% ceiling.

**Practical engine implication**: OC is not read as a single "OC scales damage" input — the engine must evaluate **each function within an NP independently**, checking that specific function's own populated `svals`/`svals2..5` range, and interpolate correctly for the case (rare, per user reports elsewhere) where OC is fractional/continuous rather than snapping to a bracket. **The exact interpolation rule between adjacent OC brackets (e.g. OC 150% between the OC1 and OC2 tables) was not found in the official `fgo-game-data-docs` battle files during this research pass** — this is flagged as an open item for file 04 (NP gauge/Overcharge), since it's more naturally scoped there alongside gauge-to-OC conversion, rather than re-deriving it from third-party community tools without a citable primary source.

### 4.1 The indirect path: OC *can* still change a hit's final damage, via intra-NP function order (confirmed live example — Space Ishtar)

The above ("OC usually doesn't rescale the damage function itself") is correct but incomplete on its own — it describes one function in isolation. In practice, an NP's `functions` array can (and often does) contain **more than one function**, executed **in array order**, and an earlier function's effect can already be active by the time a later function in the *same* NP resolves. This means OC can still increase an NP's own final damage number **without the `damageNp` function itself having OC-scaled `svals`**, if an earlier function in the same NP grants a self-buff that feeds into the damage formula's term 13 (`npDamageMod`, `powerMod`, etc.).

**Live-verified example**: Space Ishtar's NP (`GET /nice/JP/servant/1100900`, NP id `1100901`, "Edin Shugurra Quasar") has exactly 3 functions, in this order:

| Idx | `funcType` | Effect | OC scaling on this function |
|---|---|---|---|
| 0 | `addStateShort` (self) | Grants buff type `upNpdamage` (self NP-damage-up) | **Yes** — `Value` = 200 / 300 / 400 / 500 / 600 across `svals`/`svals2`/`svals3`/`svals4`/`svals5` (i.e. **+20% at OC1, +30% at OC2, +40% at OC3, +50% at OC4, +60% at OC5**) — flat across all 5 NP levels |
| 1 | `damageNp` (the actual hit) | Deals NP damage | **No** — `Value` (the base multiplier, 4500/6000/6750/7125/7500 across NP level 1–5) is **byte-for-byte identical** across `svals` through `svals5`; only NP level changes it, OC does not |
| 2 | `addStateShort` (self) | Grants buff type `upCommandatk` (self card-ATK-up, for future cards) | irrelevant to this NP's own damage |

Because function 0 executes **before** function 1 in the array, the `upNpdamage` buff it grants is already active when function 1's damage is computed for that same NP cast — it feeds into term 13's `npDamageMod * isNP` sub-term via the normal buff-action pipeline (§3), exactly as if the buff had been pre-existing from an earlier skill. **Net effect**: this NP's *effective* damage does scale with Overcharge (a real, correctly-observed effect), but the mechanism is "an earlier function in the same NP grants an OC-scaled buff that a later function in the same NP benefits from" — not "the damage function's own multiplier is OC-scaled." Both patterns are possible per the schema (a `damageNp` function *could* have differing `svals2..5` values directly), but this confirms at least one major real servant uses the indirect (buff-then-damage) pattern rather than the direct one, and the difference **matters for the engine**: it cannot just ask "does this NP's damage function have OC-scaled `svals`" and stop there — it must **evaluate every function in the NP's `functions` array in order, applying each one's effects (including self-buffs) before evaluating the next**, or it will silently under-count NPs built this way.

**This generalizes into its own domain concept** (added to `00-project-overview.md` §4): **intra-skill/NP function execution order**. This is the same principle as file 00's already-noted "same-turn NP-order effects" (buffs from an earlier NP in a turn affecting a later NP), just one level more granular — it applies **within a single skill or NP activation's own function list**, not just across separate skill/NP casts. The engine's function evaluator must process a `functions` array strictly in index order, re-checking buff state before each subsequent function, rather than evaluating all functions against a single "snapshot" buff state taken at the start of the skill/NP's resolution.

## 5. Chain bonus constants (Buster chain's flat add, term 17)

From `NiceConstant.json` (fetched directly, values confirmed live):

| Constant | Value | Role |
|---|---|---|
| `CHAINBONUS_BUSTER_RATE` | 200 (→ 0.20 / 20%) | The Buster-chain flat-add rate multiplied into term 17 (`servantAtk * busterChainMod`) — a 3-Buster brave chain adds a flat chunk of (attacker ATK × 20%) as extra damage on top of the normal per-card formula, once per qualifying card in the chain (exact per-card vs per-chain application still needs confirming against a live example — deferred to file 03, which owns card/chain mechanics in general). |
| `CHAINBONUS_ARTS_RATE` | 200 | Analogous constant surfaced for Arts (Arts brave chains don't add flat damage the way Buster does in standard play — this constant's exact usage context needs confirming in file 03, not assumed to mean "Arts also gets a damage add" by default). |
| `CHAINBONUS_QUICK` | 20 | Analogous Quick-chain constant (different scale factor than the other two — needs care, not directly comparable without confirming units, deferred to file 03). |
| `BUSTER_CHAIN_INDIVIDUALITY` / `ARTS_CHAIN_INDIVIDUALITY` / `QUICK_CHAIN_INDIVIDUALITY` / `BRAVE_CHAIN_INDIVIDUALITY` / `MIGHTY_CHAIN_INDIVIDUALITY` | trait IDs (4104–4108) | Confirms chains are internally tagged via the **same trait system** used everywhere else (file 00's "generic engine" decision) — a brave chain grants a temporary trait that other buffs/functions can key off (e.g. "buff active only during a Brave Chain"), not a special hardcoded flag outside the trait model. |

Full card/chain-position mechanics (first/second/third card multiplier tables, Mighty Chain, chain bonus application scope) are file 03's job — these constants are surfaced here only because term 17 of the damage formula references `busterChainMod` directly.

## 6. Open items carried forward

- **Exact OC-bracket interpolation rule for fractional Overcharge** (e.g. 150%, 220%) — not found in the primary `fgo-game-data-docs` battle files during this pass; deferred to file 04 (NP gauge/Overcharge), to be sourced from either a more complete primary-source read or, failing that, clearly labeled as community-derived rather than official if no primary source turns up.
- **Which specific pattern (single self-conditional function vs. base+bonus two-function split) Euryale's actual NP uses** — file 01 flagged this as needing a live lookup; this file confirms the *mechanism* that would carry it (`powerMod`'s `damageIndividuality` buff-action, or a `functvals`-gated separate function) but did not perform the live per-servant lookup. Still deferred to a concrete data-pull, not blocking the general formula documentation here.
- **Per-card-type/position exact values** for `firstCardBonus`/`cardDamageValue` (term 03) and the extra-card chain-position tables — these live in `NiceCard.json`, not yet individually catalogued; deferred to file 03 (card & hit mechanics), which owns this domain specifically.
- **Exact application scope of `busterChainMod`** (once per chain vs. once per qualifying card in the chain) — deferred to file 03.
- **Class-vs-attribute triangle composition**: confirmed both `triangleModifier` (term 05) and `attributeModifier` (term 06) are separate, both-always-applied multiplicative terms in the same formula — this resolves file 00 §6's question "do class advantage and attribute triangle both apply simultaneously and multiplicatively?" affirmatively: **yes, both always apply, as two independent multiplicative terms**, not conditionally one-or-the-other.
- **Per-class NP-gauge generation rate table and whether class advantage affects NP gain** — NP gain has its *own* separate formula (see `np.md`, briefly touched in §4 above) with different terms (`cardNpValue`, `enemyServerMod`, etc.) that do **not** include `triangleModifier`/`classAtkBonus` at all in the attacking-NP-gain formula fetched — **this directly resolves file 00 §6's question "does class advantage affect NP gauge gain from that hit": based on the formula fetched, no, the attacking NP-gain formula has no class-triangle term.** Full per-class base NP-gen-rate table itself is file 04's job (it's `NiceServant.noblePhantasms.npGain`, a per-servant field, not a shared class table — meaning file 00's assumption of a "class NP-gen-rate table" needs revising: **NP gain rate is stored per-servant, not as one shared per-class table** — flagged for file 04 to confirm/correct.)

## 7. Sources

- https://github.com/atlasacademy/fgo-game-data-docs/blob/master/battle/damage.md
- https://github.com/atlasacademy/fgo-game-data-docs/blob/master/battle/buff.md
- https://github.com/atlasacademy/fgo-game-data-docs/blob/master/battle/np.md (NP gain formula, cross-referenced for the class-triangle question in §6)
- https://api.atlasacademy.io/export/JP/NiceConstant.json (live-fetched, values quoted directly in §2/§5)
- https://api.atlasacademy.io/export/JP/NiceCard.json, `NiceClassAttackRate.json`, `NiceClassRelation.json`, `NiceAttributeRelation.json` (referenced by damage.md, not yet individually value-catalogued — deferred to file 03/06)
- https://blogs.nrvnqsr.com/entry.php/3309-How-is-damage-calculated (original datamining source credited by fgo-game-data-docs)
- https://api.atlasacademy.io/nice/JP/servant/1100900 (Space Ishtar, live-fetched — source for the intra-NP function-order / OC example in §4.1)
