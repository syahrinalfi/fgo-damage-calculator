import {
  ATTACK_RATE,
  CRITICAL_ATTACK_RATE,
  EXTRA_ATTACK_RATE_GRAND,
  EXTRA_ATTACK_RATE_SINGLE,
  CHAINBONUS_BUSTER_RATE,
  CHAINBONUS_MIGHTY_ATK_RATE,
} from "./constants.js";

/**
 * Term 11's Extra Attack case: no bonus outside a chain, 2.0x after a normal chain, 3.5x
 * after a same-color ("Grand") chain (research/02-damage-formula.md §2 term 11).
 */
export type ExtraCardChainType = "none" | "single" | "grand";

/**
 * Every already-resolved input the single-hit damage formula needs (research/02-damage-
 * formula.md §1-2). This engine does not itself walk a party/enemy's active buffs to
 * produce these numbers — that is a separate buff-evaluation concern (resolveBuffAction
 * in ./buffAction.js is the primitive it would be built from) — it only implements the
 * fixed-order 17-term formula once every modifier is already known.
 *
 * All fields are decimal fractions (e.g. 0.2 for a +20% buff, 1.5 for a 150% card
 * multiplier), matching the already-divided form the constants in ./constants.js use —
 * not the raw per-mille integers Atlas Academy's NiceCard.json/NiceConstant.json store
 * (e.g. a raw `adjustAtk` of 1500 becomes `cardDamageValue: 1.5`). Normalizing raw game
 * data to this form is the caller's responsibility.
 */
export interface DamageInput {
  /** Term 01 — the attacking servant's total ATK at their current level/ascension. */
  servantAtk: number;
  /** Term 02 — the NP's own damage multiplier for this hit; 1 for a non-NP card. */
  npDamageMultiplier: number;
  /** Term 03 — `NiceCard.json` `addAtk` for this card's type/position (0 outside 1st Buster/Quick). */
  firstCardBonus: number;
  /** Term 03 — `NiceCard.json` `adjustAtk` for this card's type/position. */
  cardDamageValue: number;
  /** Term 03 — net `actor.commandAtk - target.commandDef` buff-action total. */
  cardMod: number;
  /** Term 04 — per-class baseline attack-rate multiplier. */
  classAtkBonus: number;
  /** Term 05 — the 3-class advantage/disadvantage triangle multiplier. */
  triangleModifier: number;
  /** Term 06 — the attribute affinity triangle multiplier. */
  attributeModifier: number;
  /** Term 07 — the per-hit variance roll, in [0.90, 1.10]. */
  randomModifier: number;
  /** Term 09 — net `actor.atk` buff-action total. */
  atkMod: number;
  /** Term 09 — `target.defence`, or `target.defencePierce` if this NP ignores defense. */
  defMod: number;
  /** Whether this hit is a critical hit — drives term 10 and the crit sub-term of term 13. */
  isCrit: boolean;
  /** Term 11 — whether/how this is an Extra Attack chain hit. */
  extraCardChainType: ExtraCardChainType;
  /** Term 12 — `target.specialdefence` buff-action total. */
  specialDefMod: number;
  /** Term 13 — sum of `actor.damage` + `damageIndividuality` + `damageIndividualityActiveonly` + `damageEventPoint`. */
  powerMod: number;
  /** Term 13 — `target.selfdamage` buff-action total. */
  selfDamageMod: number;
  /** Term 13 — `actor.criticalDamage` buff-action total; only applied if `isCrit`. */
  critDamageMod: number;
  /** Whether this hit is an NP hit — drives the NP-damage sub-term of term 13. */
  isNP: boolean;
  /** Term 13 — `actor.npdamage` buff-action total; only applied if `isNP`. */
  npDamageMod: number;
  /** Term 14 — the relevant function's `Correction` value; only applied if `isSuperEffective`. */
  superEffectiveModifier: number;
  /** Whether the target actually has the trait this hit's super-effective bonus requires. */
  isSuperEffective: boolean;
  /** Term 15 — `actor.givenDamage`, a flat additive bonus. */
  dmgPlusAdd: number;
  /** Term 16 — `target.receiveDamage`, a flat additive reduction (already negative if reducing). */
  selfDmgCutAdd: number;
  /** Term 17 — whether this hit completes a 3-Buster chain (adds `servantAtk * 0.20`). */
  isBusterChain: boolean;
  /**
   * Term 17 — whether this hit is one of a Mighty Chain's 3 cards (one of each Buster/
   * Arts/Quick color, research/06 §7.4 — adds `servantAtk * CHAINBONUS_MIGHTY_ATK_RATE`,
   * the same flat-additive-to-ATK shape as `isBusterChain`, confirmed by the project owner
   * against their own gameplay knowledge). Mutually exclusive with `isBusterChain` — a
   * chain is never both uniformly Buster and one-of-each-color at once.
   */
  isMightyChain: boolean;
}

function extraCardModifier(type: ExtraCardChainType): number {
  switch (type) {
    case "grand":
      return EXTRA_ATTACK_RATE_GRAND;
    case "single":
      return EXTRA_ATTACK_RATE_SINGLE;
    case "none":
      return 1;
  }
}

/**
 * Implements the single-hit damage formula verbatim, term for term (research/02-damage-
 * formula.md §1): 14 multiplicative terms followed by 3 additive terms, floored to a
 * non-negative integer.
 */
export function calculateHitDamage(input: DamageInput): number {
  const cardTerm = input.firstCardBonus + input.cardDamageValue * Math.max(1 + input.cardMod, 0);
  const atkDefTerm = Math.max(1 + input.atkMod - input.defMod, 0);
  const criticalModifier = input.isCrit ? CRITICAL_ATTACK_RATE : 1;
  const specialDefTerm = Math.max(1 - input.specialDefMod, 0);
  const bucketTerm = Math.max(
    1 +
      input.powerMod +
      input.selfDamageMod +
      input.critDamageMod * (input.isCrit ? 1 : 0) +
      input.npDamageMod * (input.isNP ? 1 : 0),
    0.001,
  );
  const superEffectiveTerm = 1 + (input.superEffectiveModifier - 1) * (input.isSuperEffective ? 1 : 0);
  const busterChainMod = input.isBusterChain ? CHAINBONUS_BUSTER_RATE : 0;
  const mightyChainMod = input.isMightyChain ? CHAINBONUS_MIGHTY_ATK_RATE : 0;

  const damage =
    input.servantAtk *
      input.npDamageMultiplier *
      cardTerm *
      input.classAtkBonus *
      input.triangleModifier *
      input.attributeModifier *
      input.randomModifier *
      ATTACK_RATE *
      atkDefTerm *
      criticalModifier *
      extraCardModifier(input.extraCardChainType) *
      specialDefTerm *
      bucketTerm *
      superEffectiveTerm +
    input.dmgPlusAdd +
    input.selfDmgCutAdd +
    input.servantAtk * busterChainMod +
    input.servantAtk * mightyChainMod;

  return Math.floor(Math.max(damage, 0));
}
