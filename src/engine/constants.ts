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
