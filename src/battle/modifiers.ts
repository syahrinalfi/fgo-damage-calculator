import type { Buff } from "@atlasacademy/api-connector";
import { resolveBuffActionModifier, traitGatePasses } from "../buffs/buffEvaluation.js";
import type { ActiveBuffInstance, BuffTraitContext } from "../buffs/types.js";
import { getBuffConstant, type BUFF_ACTION_KEYS } from "./buffActionKeys.js";

/**
 * Resolves one buff action's net modifier for a unit's active buffs, or 0 if the live
 * registry has no entry for that action (defensive only — every key this module passes
 * was confirmed present in a live fetch this session, but a caller-supplied `buffConstant`
 * snapshot could in principle be stale or partial).
 */
export function resolveUnitActionModifier(
  buffConstants: Buff.BuffConstantMap,
  key: (typeof BUFF_ACTION_KEYS)[keyof typeof BUFF_ACTION_KEYS],
  instances: readonly ActiveBuffInstance[],
  context: BuffTraitContext,
): number {
  const constant = getBuffConstant(buffConstants, key);
  if (!constant) return 0;
  return resolveBuffActionModifier(constant, instances, context);
}

/**
 * `GIVEN_DAMAGE`/`RECEIVE_DAMAGE` (damage.ts terms 15-16) are flat raw-HP additive terms,
 * not percentage buffs — their live `BuffConstant` (`baseParam: 0, baseValue: 0,
 * limit: "none", maxRate: [0]`) confirms this: with no floor/ceiling clamp and a 0
 * baseline, the action is pure `plusTotal - minusTotal` in the buff's own raw units.
 * Running that through `resolveBuffActionModifier`'s /1000 percentage-decimal conversion
 * (correct for every other action this module uses) would silently shrink a flat HP bonus
 * a thousandfold, so this bypasses that conversion and sums the raw amounts directly.
 */
export function resolveUnitFlatActionTotal(
  buffConstants: Buff.BuffConstantMap,
  key: (typeof BUFF_ACTION_KEYS)[keyof typeof BUFF_ACTION_KEYS],
  instances: readonly ActiveBuffInstance[],
  context: BuffTraitContext,
): number {
  const constant = getBuffConstant(buffConstants, key);
  if (!constant) return 0;

  let total = 0;
  for (const instance of instances) {
    const gatesPass =
      traitGatePasses(instance.ckSelfIndv, context.holderTraits) &&
      traitGatePasses(instance.ckOpIndv, context.targetTraits);
    if (!gatesPass) continue;

    if (constant.plusTypes.includes(instance.type)) {
      total += instance.amount;
    } else if (constant.minusTypes.includes(instance.type)) {
      total -= instance.amount;
    }
  }
  return total;
}
