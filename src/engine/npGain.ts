import { CRITICAL_TD_POINT_RATE, OVER_KILL_NP_RATE, FULL_TD_POINT } from "./constants.js";

/**
 * Every already-resolved input the attacking NP-gain formula needs (research/04-np-
 * gauge-and-refund.md §1). Fields are decimal fractions except where noted, matching
 * ./damage.js's convention — raw NiceCard/NiceConstant per-mille integers must already
 * be normalized by the caller.
 */
export interface AttackingNpGainInput {
  /** The attacking NP's own base gain rate for this card color/NP (`NiceTd.npGain`), per-NP not per-class. */
  offensiveNPRate: number;
  /** `NiceCard.json` `addTdGauge` for this card's type/position. */
  firstCardBonus: number;
  /** `NiceCard.json` `adjustTdGauge` for this card's type/position. */
  cardNpValue: number;
  /** Net `atkSvt.commandNpAtk - target.commandNpDef` buff-action total. */
  cardMod: number;
  /** The target's server-supplied `tdRate` stat (not client-computable from static data alone). */
  enemyServerMod: number;
  /** `atkSvt.dropNp` buff-action total ("NP gain up"). */
  npChargeRateMod: number;
  /** Whether this hit is a critical hit. */
  isCrit: boolean;
  /** Whether this hit is an Overkill (dealt more damage than the target's remaining HP). */
  isOverkill: boolean;
}

/**
 * Implements the attacking NP-gain formula verbatim (research/04 §1): the inner product
 * is floored to an integer first, then the Overkill multiplier is applied to that already-
 * floored value and the result is floored again. Overkill is the outermost step, not
 * folded into the same rounding pass as everything else. Returns raw gauge units, where
 * FULL_TD_POINT (10000) equals 100% gauge.
 */
export function calculateAttackingNpGain(input: AttackingNpGainInput): number {
  const criticalModifier = input.isCrit ? CRITICAL_TD_POINT_RATE : 1;
  const cardTerm = input.firstCardBonus + input.cardNpValue * Math.max(1 + input.cardMod, 0);

  const innerProduct = Math.floor(
    input.offensiveNPRate * cardTerm * input.enemyServerMod * (1 + input.npChargeRateMod) * criticalModifier,
  );

  const overkillModifier = input.isOverkill ? OVER_KILL_NP_RATE : 1;
  return Math.floor(innerProduct * overkillModifier);
}

/** Every already-resolved input the defending NP-gain formula needs (research/04 §2). */
export interface DefendingNpGainInput {
  /** `NiceServant.npGain.defence` — lives at the servant level, not per-NP (research/04 §2/§4). */
  defensiveNPRate: number;
  /** The attacker's server-supplied `tdAttackRate` stat — a distinct variable from the attacking formula's `enemyServerMod`. */
  enemyServerMod: number;
  /** `defSvt.dropNp` buff-action total (the defender's own "NP gain up", if any). */
  npChargeRateMod: number;
  /** `defSvt.dropNpDamage` buff-action total — damage-taken-based NP gain, a distinct buff action. */
  defensiveChargeRateMod: number;
}

/**
 * Implements the defending NP-gain formula verbatim (research/04 §2): a single floor,
 * no Overkill term. Returns raw gauge units (FULL_TD_POINT = 100% gauge).
 */
export function calculateDefendingNpGain(input: DefendingNpGainInput): number {
  return Math.floor(
    input.defensiveNPRate *
      input.enemyServerMod *
      (1 + input.npChargeRateMod) *
      (1 + input.defensiveChargeRateMod),
  );
}

/** Converts raw gauge units (as returned by the two functions above) to a gauge percentage. */
export function rawGaugeToPercent(rawUnits: number): number {
  return (rawUnits / FULL_TD_POINT) * 100;
}
