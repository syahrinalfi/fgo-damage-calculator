import { CRITICAL_STAR_RATE, OVER_KILL_STAR_RATE, OVER_KILL_STAR_ADD } from "./constants.js";

/**
 * Every already-resolved input the critical-star drop-chance formula needs (research/03-
 * card-and-hit-mechanics.md §5.1) — the per-hit probability of generating a critical star,
 * distinct from crit-chance-*from*-stars-on-hand (research/04 §6), a separate mechanic
 * this project has not implemented (research flags the stars-carried-over cap and
 * per-servant criticalWeight as unresolved even after a dedicated research pass).
 * Fields are decimal fractions, same convention as ./damage.js and ./npGain.js.
 */
export interface StarDropInput {
  /** `NiceServant.starGen`, a flat per-servant baseline. */
  baseStarRate: number;
  /** `NiceCard.json` `addCritical` for this card's type/position. */
  firstCardBonus: number;
  /** `NiceCard.json` `adjustCritical` for this card's type/position. */
  cardStarValue: number;
  /** Net `atkSvt.commandStarAtk - defSvt.commandStarDef` buff-action total. */
  cardMod: number;
  /** The server-supplied per-hit star-rate modifier (not client-computable from static data alone). */
  serverRate: number;
  /** Attacker's `criticalPoint` buff-action total. */
  starDropMod: number;
  /** Defender's `criticalStarDamageTaken` buff-action total, added (fgo-docs `critstars.md`; replaced the old `-defSvt.criticalPoint`). */
  enemyStarDropMod: number;
  /** Whether this hit is a critical hit. */
  isCrit: boolean;
  /** Whether this hit is an Overkill. */
  isOverkill: boolean;
}

/**
 * Implements the star-drop-chance formula verbatim (research/03 §5.1). Returns a raw
 * probability with no documented cap — no primary source states this is clamped to
 * [0, 1], so, consistent with this project's sourcing standard, none is invented here;
 * a caller treating the result as a Bernoulli probability should clamp it themselves.
 */
export function calculateStarDropChance(input: StarDropInput): number {
  const criticalModifier = input.isCrit ? CRITICAL_STAR_RATE : 0;
  const cardTerm = input.firstCardBonus + input.cardStarValue * Math.max(1 + input.cardMod, 0);

  const base =
    input.baseStarRate +
    cardTerm +
    input.serverRate +
    input.starDropMod +
    input.enemyStarDropMod +
    criticalModifier;

  const overkillModifier = input.isOverkill ? OVER_KILL_STAR_RATE : 1;
  const overkillAdd = input.isOverkill ? OVER_KILL_STAR_ADD : 0;

  return base * overkillModifier + overkillAdd;
}
