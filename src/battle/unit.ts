import type { Attribute as AttributeModule, ClassName, Entity as EntityModule } from "@atlasacademy/api-connector";
import type { ActiveBuffInstance } from "../buffs/types.js";

/**
 * One combatant's already-resolved static stats plus its currently-active buffs — the
 * shared shape both `resolveDamageInput` and the NP-gain/star-drop resolvers key off of.
 * `activeBuffs` is whatever the caller has already decided is active for the hit being
 * resolved; turn-by-turn buff application/expiry (research/05 §7's three-axis duration
 * model, now confirmed) is a separate persistent-state concern layered on top of this —
 * see `TrackedBuff`/`grantBuff`/`advanceTurnBuffs`/`consumeBuffUse` in `./buffLifecycle.js`
 * — not something `BattleUnit` itself needs to track.
 */
export interface BattleUnit {
  /** Total ATK for the hit being resolved (already includes fous/ascension/level). */
  atk: number;
  className: ClassName;
  attribute: AttributeModule.Attribute;
  /** Trait IDs, used for `ckSelfIndv`/`ckOpIndv` gating and super-effective checks. */
  traits: ReadonlySet<number>;
  activeBuffs: readonly ActiveBuffInstance[];
}

/**
 * Reads a servant's leveled ATK straight from `Entity.atkGrowth` (already the final
 * per-level value, not a curve to interpolate). This does not account for a servant whose
 * `atkGrowth` array varies by ascension (`ascensionAdd.individuality`/`lvMax` can differ
 * per ascension for a small number of servants) — no live example needing that distinction
 * was checked this session, so indexing by level alone is a documented, open assumption,
 * consistent with this project's sourcing standard for unverified edge cases.
 */
export function servantAtkAtLevel(servant: Pick<EntityModule.Entity, "atkGrowth">, level: number): number {
  const atk = servant.atkGrowth[level - 1];
  if (atk === undefined) {
    throw new RangeError(`No atkGrowth entry for level ${level} (array has ${servant.atkGrowth.length} entries)`);
  }
  return atk;
}

/** Same shape/caveats as `servantAtkAtLevel` above, reading `Entity.hpGrowth` instead — also works for a `CraftEssence` (also an `Entity`, research/01 §1). */
export function servantHpAtLevel(servant: Pick<EntityModule.Entity, "hpGrowth">, level: number): number {
  const hp = servant.hpGrowth[level - 1];
  if (hp === undefined) {
    throw new RangeError(`No hpGrowth entry for level ${level} (array has ${servant.hpGrowth.length} entries)`);
  }
  return hp;
}

/** Builds the `ReadonlySet<number>` trait context `resolveDamageInput` etc. expect. */
export function traitIdSet(traits: readonly { id: number }[]): ReadonlySet<number> {
  return new Set(traits.map((trait) => trait.id));
}
