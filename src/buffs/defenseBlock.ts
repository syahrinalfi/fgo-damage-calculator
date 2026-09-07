import type { Buff } from "@atlasacademy/api-connector";
import { traitGatePasses } from "./buffEvaluation.js";
import type { ActiveBuffInstance, BuffTraitContext } from "./types.js";

const SPECIAL_INVINCIBLE = "specialInvincible" as Buff.BuffType;
const INVINCIBLE = "invincible" as Buff.BuffType;
const AVOIDANCE = "avoidance" as Buff.BuffType;
const PIERCE_SPECIAL_INVINCIBLE = "pierceSpecialInvincible" as Buff.BuffType;
const PIERCE_INVINCIBLE = "pierceInvincible" as Buff.BuffType;
const BREAK_AVOIDANCE = "breakAvoidance" as Buff.BuffType;

/** The defensive layer that decided a `resolveDefenseBlock` result, or `null` if unblocked. */
export type DefenseTier = "specialInvincible" | "invincible" | "avoidance";

export interface DefenseBlockResult {
  /** Whether this hit's damage should be gated to 0 (research/05 §6.3/§6.4: NP gain and star
   * drop still resolve normally regardless — only the damage formula's output is affected). */
  blocked: boolean;
  /** Which defensive buff type decided the result; `null` when `blocked` is false. */
  tier: DefenseTier | null;
}

function hasActiveType(
  instances: readonly ActiveBuffInstance[],
  type: Buff.BuffType,
  context: BuffTraitContext,
): boolean {
  return instances.some(
    (instance) =>
      instance.type === type &&
      traitGatePasses(instance.ckSelfIndv, context.holderTraits) &&
      traitGatePasses(instance.ckOpIndv, context.targetTraits),
  );
}

/**
 * Resolves whether a hit is blocked by the defender's Evade/Invincible/`specialInvincible`
 * buffs, and which tier decided it — the priority-order piercing check confirmed in
 * research/05-buffs-and-debuffs.md §6.3: **`specialInvincible` (needs `pierceSpecialInvincible`)
 * → `invincible` (needs `pierceInvincible`, which also pierces a co-present `avoidance`) →
 * `avoidance` (needs either `pierceInvincible` or `breakAvoidance`)** — not three
 * independent, order-agnostic pairs. A tier that's present but successfully pierced simply
 * falls through to the next check, rather than being treated as absent for the whole hit.
 *
 * Only decides *whether* the hit is blocked, not what happens to the consumed buff's own
 * `Turn`/`Count` afterward (research/05 §7's expiry model) or Guts (a separate, non-blocking
 * mechanic — see `./guts.js`) — this project doesn't yet track turn-by-turn buff state to
 * decrement against (see `BattleUnit`'s own doc comment in `../battle/unit.js`).
 */
export function resolveDefenseBlock(
  defenderBuffs: readonly ActiveBuffInstance[],
  defenderContext: BuffTraitContext,
  attackerBuffs: readonly ActiveBuffInstance[],
  attackerContext: BuffTraitContext,
): DefenseBlockResult {
  const hasSpecialInvincible = hasActiveType(defenderBuffs, SPECIAL_INVINCIBLE, defenderContext);
  const hasInvincible = hasActiveType(defenderBuffs, INVINCIBLE, defenderContext);
  const hasAvoidance = hasActiveType(defenderBuffs, AVOIDANCE, defenderContext);

  const hasPierceSpecialInvincible = hasActiveType(attackerBuffs, PIERCE_SPECIAL_INVINCIBLE, attackerContext);
  const hasPierceInvincible = hasActiveType(attackerBuffs, PIERCE_INVINCIBLE, attackerContext);
  const hasBreakAvoidance = hasActiveType(attackerBuffs, BREAK_AVOIDANCE, attackerContext);

  if (hasSpecialInvincible && !hasPierceSpecialInvincible) {
    return { blocked: true, tier: "specialInvincible" };
  }
  if (hasInvincible && !hasPierceInvincible) {
    return { blocked: true, tier: "invincible" };
  }
  if (hasAvoidance && !(hasPierceInvincible || hasBreakAvoidance)) {
    return { blocked: true, tier: "avoidance" };
  }
  return { blocked: false, tier: null };
}
