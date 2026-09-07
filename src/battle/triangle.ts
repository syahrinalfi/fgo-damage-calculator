import type { ClassName, Attribute as AttributeModule } from "@atlasacademy/api-connector";
import type { BattleConstants } from "./gameConstants.js";

/**
 * Term 04 — the attacking class's baseline attack-rate multiplier (`NiceClassAttackRate.json`,
 * per-mille). Falls back to the neutral 1.0 if a class is absent from the live table (e.g. an
 * unlisted collection/placeholder class) rather than throwing — this is a lookup against an
 * open-ended, data-driven key set, not an internal invariant this project controls.
 */
export function resolveClassAttackBonus(constants: BattleConstants, attackerClass: ClassName): number {
  return (constants.classAttack[attackerClass] ?? 1000) / 1000;
}

/** Term 05 — the 3-class advantage/disadvantage triangle multiplier (`NiceClassRelation.json`). */
export function resolveClassTriangleModifier(
  constants: BattleConstants,
  attackerClass: ClassName,
  defenderClass: ClassName,
): number {
  return (constants.classAffinity[attackerClass]?.[defenderClass] ?? 1000) / 1000;
}

/** Term 06 — the attribute affinity triangle multiplier (`NiceAttributeRelation.json`). */
export function resolveAttributeTriangleModifier(
  constants: BattleConstants,
  attackerAttribute: AttributeModule.Attribute,
  defenderAttribute: AttributeModule.Attribute,
): number {
  return (constants.attribute[attackerAttribute]?.[defenderAttribute] ?? 1000) / 1000;
}
