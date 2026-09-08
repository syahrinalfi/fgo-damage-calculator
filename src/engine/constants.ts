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
