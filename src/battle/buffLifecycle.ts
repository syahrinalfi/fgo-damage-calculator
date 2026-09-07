import { applyBuff, traitGatePasses } from "../buffs/index.js";
import type { ActiveBuffInstance, BuffTraitContext } from "../buffs/types.js";

/**
 * One buff instance as tracked inside persistent battle state, across turns —
 * `ActiveBuffInstance` (research/05 §1-2, §4 — what the buff-evaluation layer and
 * `resolveHit`/`resolveDefenseBlock` need) plus the two independent expiry axes
 * confirmed in research/05 §7: `turnsRemaining`/`usesRemaining`. `null` means "unlimited
 * on that axis" — this project's own idiom for the raw API's `Turn`/`Count: -1` sentinel,
 * converted once at grant time by `grantBuff` rather than carried as a magic number
 * through battle state (the same "raw-to-normalized at the boundary" convention this
 * project already uses for per-mille buff magnitudes elsewhere).
 *
 * `TrackedBuff` is structurally an `ActiveBuffInstance` (it only adds fields), so it can be
 * passed anywhere an `ActiveBuffInstance[]`/`readonly ActiveBuffInstance[]` is expected —
 * `resolveHit`, `resolveDefenseBlock`, `resolveBuffActionModifier` — with no conversion step.
 */
export interface TrackedBuff extends ActiveBuffInstance {
  turnsRemaining: number | null;
  usesRemaining: number | null;
}

function rawDurationToRemaining(raw: number): number | null {
  return raw === -1 ? null : raw;
}

/**
 * Grants a new buff to a unit's tracked buffs, honoring the buffGroup collision rule
 * (`applyBuff`, research/05 §3 — reject-new on a same-non-zero-`buffGroup` collision) and
 * converting the buff's raw `Turn`/`Count` `Vals` fields (research/01 §6.3-6.4, research/05
 * §7) to `TrackedBuff`'s `null`-for-unlimited convention.
 */
export function grantBuff(
  existing: readonly TrackedBuff[],
  newBuff: ActiveBuffInstance,
  rawTurn: number,
  rawCount: number,
): readonly TrackedBuff[] {
  const tracked: TrackedBuff = {
    ...newBuff,
    turnsRemaining: rawDurationToRemaining(rawTurn),
    usesRemaining: rawDurationToRemaining(rawCount),
  };
  return applyBuff(existing, tracked);
}

/**
 * Advances one turn's worth of `Turn`-axis expiry (research/05 §7, timing confirmed by the
 * project owner's direct gameplay knowledge: decrements at the end of the round, after the
 * enemy phase, before the player's next turn) — decrements every finite `turnsRemaining` by
 * 1 and drops any instance that reaches 0. Does not touch `usesRemaining`; `Count` only
 * decrements on a qualifying consumption event, not per turn — see `consumeBuffUse`.
 */
export function advanceTurnBuffs(tracked: readonly TrackedBuff[]): readonly TrackedBuff[] {
  return tracked
    .map((buff): TrackedBuff => (buff.turnsRemaining === null ? buff : { ...buff, turnsRemaining: buff.turnsRemaining - 1 }))
    .filter((buff) => buff.turnsRemaining === null || buff.turnsRemaining > 0);
}

/**
 * Consumes one qualifying "hit absorbed" charge (research/05 §7 — an attack absorbed, for
 * Evade/Invincible/Guts) from the first tracked instance of `type` that passes the trait
 * gate, dropping it once `usesRemaining` reaches 0; a `null` (unlimited-use) instance is
 * left untouched. Intended to be called with the `tier`/Guts-trigger a `resolveHit` result
 * (`../battle/hitResolution.js`) reports consumed — buffGroup already guarantees at most
 * one active instance per non-zero group, so for Evade/Invincible/`specialInvincible`/Guts
 * specifically there's never more than one instance this could mean.
 */
export function consumeBuffUse(
  tracked: readonly TrackedBuff[],
  type: ActiveBuffInstance["type"],
  context: BuffTraitContext,
): readonly TrackedBuff[] {
  let consumed = false;
  return tracked
    .map((buff): TrackedBuff => {
      if (
        consumed ||
        buff.type !== type ||
        !traitGatePasses(buff.ckSelfIndv, context.holderTraits) ||
        !traitGatePasses(buff.ckOpIndv, context.targetTraits)
      ) {
        return buff;
      }
      consumed = true;
      return buff.usesRemaining === null ? buff : { ...buff, usesRemaining: buff.usesRemaining - 1 };
    })
    .filter((buff) => buff.usesRemaining === null || buff.usesRemaining > 0);
}
