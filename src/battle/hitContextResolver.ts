import { Card, type NoblePhantasm } from "@atlasacademy/api-connector";
import type { DerivedHitContext } from "./action.js";
import type { EnemyInstance, HandCard, ServantInstance } from "./battleState.js";

function npGainKeyForCard(card: Card): keyof NoblePhantasm.NoblePhantasmGain | null {
  switch (card) {
    case Card.ARTS:
      return "arts";
    case Card.BUSTER:
      return "buster";
    case Card.QUICK:
      return "quick";
    case Card.EXTRA:
      return "extra";
    default:
      return null;
  }
}

/**
 * Auto-resolves a non-NP `playCard` `Action`'s `DerivedHitContext` (`./action.js`) from raw
 * account/game data — closing the "no automatic resolver exists, `resolveHitContext` stays
 * caller-supplied" gap `questOptimizer.ts`'s own doc comment flagged. Fills in every field
 * this project's research has an actual primary source for; the 2 fields it does **not**
 * (`isSuperEffective`/`superEffectiveModifier`) are deliberately left at their neutral
 * defaults rather than guessed at — see below.
 *
 * Field-by-field sourcing:
 * - `card.type`: the hand slot's own card. `card.position` is left `1` — a placeholder,
 *   since it's actually the chain slot (1st/2nd/3rd), not derivable from a single hand slot
 *   in isolation; `buildCardOrderCandidates` (`../optimizer/cardOrderCandidates.js`)
 *   overwrites it per generated ordering, same as it already does for every hand-supplied
 *   template today.
 * - `npDamageMultiplier: 1`: research/02 §row 04 — this term is a no-op for an ordinary
 *   (non-NP) card; only `castNp` actually varies it.
 * - `randomModifier`: research/02 §row 07 — `NiceConstant.ATTACK_RATE_RANDOM_MIN`/`_MAX`
 *   confirm the real per-hit variance band is **0.90–1.10**, so this is a genuine RNG roll
 *   (`0.9 + randomFn() * 0.2`), not a fixed stand-in the way existing hand-built test
 *   fixtures use `1` for.
 * - `isSuperEffective: false`, `superEffectiveModifier: 1`: **not sourced** for the generic
 *   card-attack case — research/02's Correction term reads from a specific `NiceFunction`
 *   a bane-type skill/passive would need to actually grant, and no research pass has pinned
 *   down when/how an ordinary card hit acquires one. Left at these neutral defaults rather
 *   than guessed; a caller with a specific bane effect active should override the returned
 *   object's `isSuperEffective`/`superEffectiveModifier` fields directly.
 * - `isNP: false`: always false by construction — an NP goes through `castNp`, never this
 *   resolver.
 * - `offensiveNPRate`: `npGain.{buster|arts|quick|extra}[actingServant.npLevel - 1]`
 *   (research/04 §4 — `NiceTd.npGain`, confirmed to live on the NP entity, per NP level, not
 *   a per-class table). Caller supplies the acting servant's own NP's `npGain` object
 *   (`NoblePhantasm.NoblePhantasmGain`) since `ServantInstance` itself doesn't carry NP data.
 * - `npEnemyServerMod`/`starEnemyServerMod`: `targetEnemy.serverMod.tdRate`/`.starRate`
 *   (research/08 §1 — a real, per-quest, per-enemy server-supplied multiplier; `EnemyInstance`
 *   gained a `serverMod` field alongside this resolver, since nothing previously read it).
 * - `baseStarRate`: `actingServant.starGen` (research/03 §5.1 — `NiceServant.starGen`,
 *   `ServantInstance` gained this field alongside this resolver too, since nothing previously
 *   needed it).
 *
 * Throws if `handCard.card` isn't one of Buster/Arts/Quick/Extra — the NP card type ("5")
 * never appears in `handCards` (it's dealt separately via `castNp`, research/03 §6.5) and no
 * other card type exists, so this is a genuine caller-error guard, not a real branch.
 */
export function resolveCardHitContext(
  handCard: HandCard,
  actingServant: ServantInstance,
  npGain: NoblePhantasm.NoblePhantasmGain,
  targetEnemy: EnemyInstance,
  randomFn: () => number = Math.random,
): DerivedHitContext {
  const key = npGainKeyForCard(handCard.card);
  if (key === null) {
    throw new RangeError(`resolveCardHitContext only supports Buster/Arts/Quick/Extra cards, got ${String(handCard.card)}`);
  }
  const offensiveNPRate = npGain[key][actingServant.npLevel - 1];
  if (offensiveNPRate === undefined) {
    throw new RangeError(`npGain.${key} has no entry for NP level ${actingServant.npLevel}`);
  }
  return {
    card: { type: handCard.card, position: 1 },
    npDamageMultiplier: 1,
    randomModifier: 0.9 + randomFn() * 0.2,
    isSuperEffective: false,
    superEffectiveModifier: 1,
    isNP: false,
    offensiveNPRate,
    npEnemyServerMod: targetEnemy.serverMod.tdRate,
    baseStarRate: actingServant.starGen,
    starEnemyServerMod: targetEnemy.serverMod.starRate,
  };
}
