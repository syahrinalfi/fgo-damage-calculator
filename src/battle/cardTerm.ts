import type { Card } from "@atlasacademy/api-connector";
import type { BattleConstants } from "./gameConstants.js";

/**
 * One `NiceCard.json` entry (a card type + chain position), already divided down to the
 * decimal-fraction convention every src/engine/ formula uses. The three "adjust"/"add"
 * pairs feed three different formulas' `firstCardBonus`/card-value fields (research/02 §1
 * term 03, research/03 §5.1, research/04 §1) despite all three formulas naming the field
 * "firstCardBonus" — they are genuinely different underlying constants, not the same
 * number reused, so this returns all three pairs rather than picking one.
 */
export interface CardTerm {
  /** `adjustAtk`/1000 — damage formula's `cardDamageValue`. */
  atkAdjust: number;
  /** `addAtk`/1000 — damage formula's `firstCardBonus`. */
  atkAdd: number;
  /** `adjustTdGauge`/1000 — attacking NP-gain formula's `cardNpValue`. */
  npGaugeAdjust: number;
  /** `addTdGauge`/1000 — attacking NP-gain formula's `firstCardBonus`. */
  npGaugeAdd: number;
  /** `adjustCritical`/1000 — star-drop formula's `cardStarValue`. */
  criticalAdjust: number;
  /** `addCritical`/1000 — star-drop formula's `firstCardBonus`. */
  criticalAdd: number;
}

/**
 * Looks up the `NiceCard.json` entry for a card type + chain position (1st/2nd/3rd).
 * Throws if the type/position combination isn't in the live table — an all-zero
 * "neutral" fallback would be silently wrong here, not actually neutral: `atkAdjust: 0`
 * with `atkAdd: 0` collapses the damage formula's entire multiplicative card term to 0,
 * producing a silent "0 damage" result instead of surfacing the caller's mistake (e.g. an
 * invalid position number).
 */
export function resolveCardTerm(constants: BattleConstants, cardType: Card, position: number): CardTerm {
  const entry = constants.card[cardType]?.[position];
  if (!entry) {
    throw new RangeError(`No NiceCard.json entry for card type ${String(cardType)}, position ${position}`);
  }

  return {
    atkAdjust: entry.adjustAtk / 1000,
    atkAdd: entry.addAtk / 1000,
    npGaugeAdjust: entry.adjustTdGauge / 1000,
    npGaugeAdd: entry.addTdGauge / 1000,
    criticalAdjust: entry.adjustCritical / 1000,
    criticalAdd: entry.addCritical / 1000,
  };
}
