import type { Buff } from "@atlasacademy/api-connector";
import { traitGatePasses } from "./buffEvaluation.js";
import type { ActiveBuffInstance, BuffTraitContext } from "./types.js";

const GUTS = "guts" as Buff.BuffType;

export interface GutsResult {
  /** Whether a Guts instance revived the unit instead of it being defeated. */
  triggered: boolean;
  /** HP after resolution: the revive HP if triggered, otherwise the input HP unchanged. */
  hpAfter: number;
}

/**
 * Resolves whether an active Guts buff revives a unit whose HP has reached 0
 * (research/05-buffs-and-debuffs.md §6.2): `amount` is the buff's own per-mille revive
 * target (e.g. `500` = revive to 50% of max HP), the same "already-Overcharge-resolved,
 * per-mille" convention `ActiveBuffInstance.amount` uses everywhere else — Heracles' bond
 * CE's `Value: 500` is the live example this models. Only triggers when `hpAfterDamage` is
 * already at or below 0; a positive HP is returned unchanged, untriggered.
 *
 * Triggers uniformly across any overkill magnitude — Guts is decided by whether the card
 * that dealt the damage brought HP to 0-or-below at all, not by how far below 0 it landed
 * (project owner's direct gameplay knowledge, confirmed this session: overkill has no
 * separate bearing on whether Guts activates).
 *
 * When more than one Guts instance is active, this picks the first match in `defenderBuffs`
 * — no primary or community source found this session states the real selection order
 * among multiple simultaneous Guts sources, so this is a documented, open simplification,
 * not a confirmed rule.
 *
 * Does not itself decrement the consumed instance's `Count` (this project doesn't yet track
 * turn-by-turn buff state — see `BattleUnit`'s doc comment in `../battle/unit.js`) or remove
 * the instance once its charges are exhausted; the caller owns both.
 */
export function resolveGuts(
  hpAfterDamage: number,
  maxHp: number,
  defenderBuffs: readonly ActiveBuffInstance[],
  defenderContext: BuffTraitContext,
): GutsResult {
  if (hpAfterDamage > 0) {
    return { triggered: false, hpAfter: hpAfterDamage };
  }

  const guts = defenderBuffs.find(
    (instance) =>
      instance.type === GUTS &&
      traitGatePasses(instance.ckSelfIndv, defenderContext.holderTraits) &&
      traitGatePasses(instance.ckOpIndv, defenderContext.targetTraits),
  );
  if (!guts) {
    return { triggered: false, hpAfter: hpAfterDamage };
  }

  return { triggered: true, hpAfter: Math.floor((guts.amount / 1000) * maxHp) };
}
