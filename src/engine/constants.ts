/**
 * Fixed, non-buff-derived constants consumed by the damage formula (research/02-damage-
 * formula.md §2/§5), live-fetched from NiceConstant.json and quoted there as decimal
 * multipliers (the raw per-mille values, e.g. ATTACK_RATE = 230, are already divided
 * down in that research file — these mirror the divided, ready-to-multiply form).
 */

/** Term 08 — the fixed global damage-scaling constant (NiceConstant.ATTACK_RATE = 230). */
export const ATTACK_RATE = 0.23;

/** Term 10's base crit multiplier (NiceConstant.CRITICAL_ATTACK_RATE = 2000). */
export const CRITICAL_ATTACK_RATE = 2.0;

/** Term 07's per-hit variance band (NiceConstant.ATTACK_RATE_RANDOM_MIN/MAX = 900/1100). */
export const ATTACK_RATE_RANDOM_MIN = 0.9;
export const ATTACK_RATE_RANDOM_MAX = 1.1;

/**
 * Term 11 — the Extra Attack multiplier: 3.5x after a same-color ("Grand") chain,
 * 2.0x otherwise (NiceConstant.EXTRA_ATTACK_RATE_GRAND/SINGLE = 3500/2000).
 */
export const EXTRA_ATTACK_RATE_SINGLE = 2.0;
export const EXTRA_ATTACK_RATE_GRAND = 3.5;

/** Term 17's Buster-chain flat-add rate (NiceConstant.CHAINBONUS_BUSTER_RATE = 200). */
export const CHAINBONUS_BUSTER_RATE = 0.2;

/**
 * Arts-chain flat NP-gauge bonus (NiceConstant.CHAINBONUS_ARTS_RATE = 200, research/02 §5/
 * research/03 §3) — 200/1000 = 20%, cross-confirmed against the independently-sourced
 * community figure "+20% NP gauge to every servant whose card is in the chain" (research/06
 * §7.2). Unlike `CHAINBONUS_BUSTER_RATE` (a damage-formula input), this is a flat gauge
 * grant applied once per completed Arts chain — see `src/battle/turnLoop.ts`'s
 * `resolvePlayCard`.
 */
export const CHAINBONUS_ARTS_RATE = 0.2;

/**
 * Quick-chain flat critical-star bonus for next turn's allocation (NiceConstant.
 * CHAINBONUS_QUICK = 20, research/02 §5/research/03 §3) — a raw star *count*, not a per-
 * mille rate (unlike every other `CHAINBONUS_*`/`*_RATE` constant in this file — research/02
 * §5 flags this constant's scale as not directly comparable to the others). Cross-confirmed
 * against the independently-sourced community figure "+20 critical stars for the next turn"
 * (research/06 §7.2, the post-2022-07-31 value; pre-update was +10 — see that section's
 * version-boundary note, not modeled here since this project doesn't version-gate mechanics).
 */
export const CHAINBONUS_QUICK_STARS = 20;

/**
 * Quick-lead flat crit-chance bonus for every hand card, next turn (research/06 §7.2/§7.4:
 * "+20% critical chance for all 5 hand cards," added 2022-07-31's 7th-Anniversary battle
 * overhaul). Community-sourced, cross-corroborated across 3+ independent authors — this
 * project's usual "reliable but not primary-source" tier (see research/06 §7's own sourcing
 * note) — no `NiceConstant` name was found for this specific figure, unlike
 * `CHAINBONUS_ARTS_RATE`/`CHAINBONUS_QUICK`. Distinct from both `CHAINBONUS_QUICK_STARS`
 * (the *uniform-Quick-chain*'s own next-turn star bonus) and the `criticalAdd`/
 * `firstCardBonus` term already wired via `chainLeadCardType` (`src/battle/damageInput.ts`
 * et al. — that one boosts *star-drop chance*, a different stat from *crit chance*): this
 * constant fires whenever Quick merely *leads* the chain (`chainCards[0].type`), regardless
 * of whether the chain is uniformly Quick, and is applied as a flat additive bonus on top of
 * `critChanceForStars`'s star-derived chance — see `BattleState.critChanceBonusCarried`/
 * `activeCritChanceBonus` (`src/battle/battleState.ts`) and `applyChainCompletionBonus`
 * (`src/battle/turnLoop.ts`).
 */
export const CHAINBONUS_QUICK_CRIT_RATE = 0.2;

/**
 * Mighty Chain's ATK bonus (research/06 §7.4: "ATK +50%" for all 3 played cards of a
 * one-of-each-color QAB chain, official/primary for the mechanic's existence, 2022-07-31
 * 7th-Anniversary battle-system overhaul) — modeled as the same flat-additive-to-`servantAtk`
 * damage-formula shape as `CHAINBONUS_BUSTER_RATE`, rather than a multiplicative ATK-up buff.
 * Research/06 §7.4 itself only states "ATK +50%" without specifying the mechanism; the
 * project owner confirmed via their own gameplay knowledge that it behaves the same way as
 * the flat first-card-bonus/Buster-chain shape (this project's memory notes gameplay
 * recollections as authoritative, cross-checked where possible against sources — see
 * `src/battle/chainDetection.ts`'s `isMightyChainFrom` and `src/engine/damage.ts`'s
 * `isMightyChain` for where this is applied). See `CHAINBONUS_MIGHTY_CRIT_RATE`/
 * `CHAINBONUS_MIGHTY_NPGAIN_RATE`/`CHAINBONUS_MIGHTY_STARRATE` below for Mighty Chain's
 * other 3 bonuses — all 4 are now modeled.
 */
export const CHAINBONUS_MIGHTY_ATK_RATE = 0.5;

/**
 * Mighty Chain's critical-chance bonus (research/06 §7.4: "Critical Chance +20% (for all
 * cards, same shape as the post-update Quick first-card-bonus, §7.2)") — same hand-wide,
 * next-turn-carried mechanism as `CHAINBONUS_QUICK_CRIT_RATE`
 * (`BattleState.critChanceBonusCarried`/`activeCritChanceBonus`), but a separate, additive
 * bonus: research/06 §7.4 explicitly notes "these can stack if the chain also happens to
 * start with Quick" — a Quick-led Mighty Chain earns both bonuses at once.
 */
export const CHAINBONUS_MIGHTY_CRIT_RATE = 0.2;

/**
 * Mighty Chain's "NP Gain Up" bonus (research/06 §7.4 flagged this as an unconfirmed
 * percentage per §7.5; the project owner supplied the figure from an FGO wiki source —
 * **+100%** NP gain rate for all 3 played cards). Modeled as an addition to the attacking
 * NP-gain formula's existing `npChargeRateMod` term (`AttackingNpGainInput`,
 * `src/engine/npGain.ts`) — the same multiplicative "NP gain up" mechanism an ordinary
 * buff-action (`DROP_NP`) already uses, rather than the flat-additive-to-ATK shape
 * `CHAINBONUS_MIGHTY_ATK_RATE` uses, since "NP gain rate +100%" reads as a rate modifier
 * (matching how buff-sourced NP-gain-up already works) rather than a flat gauge grant.
 * Single-source (one wiki page, not independently cross-corroborated in this pass) —
 * flag for a second source if this becomes load-bearing for optimizer output.
 */
export const CHAINBONUS_MIGHTY_NPGAIN_RATE = 1.0;

/**
 * Mighty Chain's "Critical Star Drop Rate Up" bonus (research/06 §7.4/§7.5 — the last of
 * its 4 bonuses to have a confirmed value; the project owner supplied the figure directly:
 * **+20%** critical-star generation rate). Distinct from the already-implemented Quick-lead
 * `firstCardBonus`/`criticalAdd` term (`StarDropResolutionContext.chainLeadCardType`,
 * `src/battle/starDropInput.ts`) — that one only fires when Quick specifically leads the
 * chain; this one fires for the whole chain whenever it's a Mighty Chain, regardless of
 * which color happens to lead. Modeled as an addition to the star-drop formula's existing
 * `starDropMod` term (`StarDropInput`, `src/engine/starDrop.ts`) — the same buff-action
 * (`CRITICAL_POINT`) mechanism an ordinary "star drop up" effect already uses, matching how
 * `CHAINBONUS_MIGHTY_NPGAIN_RATE` reuses the analogous `npChargeRateMod` term. Single-source
 * (project-owner-supplied, not independently cross-corroborated in this pass) — flag for a
 * second source if this becomes load-bearing for optimizer output.
 */
export const CHAINBONUS_MIGHTY_STARRATE = 0.2;

/**
 * NP-gain formula constants (research/04-np-gauge-and-refund.md §1, §5.1), same divided-
 * decimal convention as the damage constants above.
 */

/** The internal gauge unit: 10000 raw units = 100% gauge (NiceConstant.FULL_TD_POINT). */
export const FULL_TD_POINT = 10000;

/** Attacking-formula crit multiplier (NiceConstant.CRITICAL_TD_POINT_RATE = 2000). */
export const CRITICAL_TD_POINT_RATE = 2.0;

/** Attacking-formula Overkill multiplier, applied after the first floor (NiceConstant.OVER_KILL_NP_RATE = 1500). */
export const OVER_KILL_NP_RATE = 1.5;

/**
 * Star-drop-chance formula constants (research/03-card-and-hit-mechanics.md §5.1), same
 * divided-decimal convention — confirmed against the raw NiceConstant.json values
 * (200/1000/300) directly, resolving what had looked like a unit mismatch in that
 * research file's own quoted (already-divided) numbers.
 */

/** Flat crit-generation bonus on a landed critical hit (NiceConstant.CRITICAL_STAR_RATE = 200). */
export const CRITICAL_STAR_RATE = 0.2;

/** Star-drop multiplier on an Overkill hit — no change (NiceConstant.OVER_KILL_STAR_RATE = 1000). */
export const OVER_KILL_STAR_RATE = 1.0;

/** Flat star-drop bonus on an Overkill hit (NiceConstant.OVER_KILL_STAR_ADD = 300). */
export const OVER_KILL_STAR_ADD = 0.3;

/**
 * Crit-chance-from-stars-on-hand constant (research/04-np-gauge-and-refund.md §6.1,
 * primary-source-confirmed via a live `NiceConstant.json` fetch): each critical star
 * allocated to a specific hand card slot (`src/battle/critStarLottery.ts`) adds this much
 * flat crit-chance to that card (NiceConstant.CRITICAL_RATE_PER_STAR = 100).
 */
export const CRITICAL_RATE_PER_STAR = 0.1;
