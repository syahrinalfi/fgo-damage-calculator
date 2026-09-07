import type { Buff } from "@atlasacademy/api-connector";
import { resolveBuffAction, type BuffActionLimit } from "../engine/buffAction.js";
import type { ActiveBuffInstance, BuffTraitContext } from "./types.js";

/**
 * Every trait in `required` must be present on `have` (AND semantics) for a buff's
 * `ckSelfIndv`/`ckOpIndv` gate to pass. No primary source pins down AND vs. OR for a
 * multi-trait `ckSelfIndv`/`ckOpIndv` list (research/05-buffs-and-debuffs.md §4, §8
 * flags this open) — AND is chosen as the documented working assumption since an empty
 * list (no gate at all) trivially passes either way, and every live example found so far
 * carries at most one trait.
 */
export function traitGatePasses(required: readonly { id: number }[], have: ReadonlySet<number>): boolean {
  return required.every((trait) => have.has(trait.id));
}

/**
 * Resolves one `BuffAction`'s net modifier from a unit's currently-active buffs, using the
 * live `BuffConstant` for that action (research/05-buffs-and-debuffs.md §2) — the official
 * type-to-action registry (`NiceBuffList.ActionList.json`, exposed via
 * `GameDataClient.buffConstant()`) rather than a hand-maintained mapping of the 239
 * `NiceBuffType` values.
 *
 * Returns the modifier as a decimal fraction (e.g. 0.2 for a net +20%), matching the
 * convention every src/engine/ formula input already uses — not the constant's own raw
 * per-mille integers. This works by running the raw per-mille arithmetic through
 * `resolveBuffAction` exactly as the API defines it, then subtracting back out the
 * action's own neutral baseline (whatever `resolveBuffAction` itself returns with no
 * buffs active — computed the same way, not hand-derived as `baseParam - baseValue`, so
 * it stays correct even for a hypothetical action whose `baseParam` alone already exceeds
 * its `maxRate`) and dividing by 1000.
 *
 * `maxRateIndex` selects which entry of the constant's `maxRate` array to use as the
 * ceiling. The live export carries more than one value per action (e.g. `atk`'s is
 * `[5000, 10000, 50000]`) and no primary source found this session states what the
 * different indices mean (per-rarity? per-buff-rank?) — flagged **open**; this defaults
 * to index 0, the most conservative (lowest) ceiling, and callers who learn the real
 * indexing can override it.
 */
export function resolveBuffActionModifier(
  constant: Buff.BuffConstant,
  instances: readonly ActiveBuffInstance[],
  context: BuffTraitContext,
  maxRateIndex = 0,
): number {
  let plusTotal = 0;
  let minusTotal = 0;

  for (const instance of instances) {
    const gatesPass =
      traitGatePasses(instance.ckSelfIndv, context.holderTraits) &&
      traitGatePasses(instance.ckOpIndv, context.targetTraits);
    if (!gatesPass) continue;

    if (constant.plusTypes.includes(instance.type)) {
      plusTotal += instance.amount;
    } else if (constant.minusTypes.includes(instance.type)) {
      minusTotal += instance.amount;
    }
  }

  const maxRate = constant.maxRate[maxRateIndex] ?? 0;
  const baseInput = {
    baseParam: constant.baseParam,
    baseValue: constant.baseValue,
    maxRate,
    limit: constant.limit as BuffActionLimit,
  };
  const rawResult = resolveBuffAction({ ...baseInput, plusTotal, minusTotal });
  const neutralBaseline = resolveBuffAction({ ...baseInput, plusTotal: 0, minusTotal: 0 });

  return (rawResult - neutralBaseline) / 1000;
}
