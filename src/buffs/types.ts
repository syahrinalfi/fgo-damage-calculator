import type { Buff, Trait as TraitModule } from "@atlasacademy/api-connector";

type Trait = TraitModule.Trait;

/**
 * One already-active buff instance on a unit, reduced to exactly what the buff-action
 * evaluator needs (research/05-buffs-and-debuffs.md §1-2). `amount` is the buff's raw,
 * already-Overcharge-resolved magnitude in the API's own per-mille convention (e.g. 200
 * for a +20% ATK-up buff's `Value` at the active Overcharge stage) — selecting the right
 * `svals`/`svals2`/... entry for the current Overcharge stage (research/04 §5.2) is the
 * caller's responsibility, same "already-resolved input" convention used throughout
 * src/engine/. This evaluator only handles the plain-numeric buff types that resolve
 * through the summed buff-action algorithm; it does not model dispel or the richer
 * BuffScript conditions (HP-gated, opponent-buff-gated, etc.) — both still-open items per
 * research/05 §8. `buffGroup` unstacking (research/05 §3) is handled separately, at
 * buff-application time, by `applyBuff` in `./buffGroup.js`; Evade/Invincible/
 * `specialInvincible`'s hit-blocking priority (research/05 §6.3) by `resolveDefenseBlock`
 * in `./defenseBlock.js`; and Guts (research/05 §6.2) by `resolveGuts` in `./guts.js`.
 */
export interface ActiveBuffInstance {
  /** The buff's `NiceBuffType` — matched against a `BuffConstant`'s `plusTypes`/`minusTypes`. */
  type: Buff.BuffType;
  /** Raw per-mille magnitude, already resolved for the current Overcharge stage. */
  amount: number;
  /** Traits the buff's own *holder* must have for it to apply (research/05 §4). */
  ckSelfIndv: Trait[];
  /** Traits the *target of the buff's action* must have for it to apply (research/05 §4). */
  ckOpIndv: Trait[];
  /**
   * Unstacking group (research/05 §3). `0` means "no restriction" — always stackable,
   * including alongside copies of itself. A non-zero value means at most one active
   * instance of that group may exist on a unit at a time; see `applyBuff` in
   * `./buffGroup.js` for the confirmed collision rule (reject-new).
   */
  buffGroup: number;
  /**
   * This buff's own classification trait IDs (`NiceBuff.vals`, research/05 §5) — e.g. Guts
   * carries `buffPositiveEffect` + `buffGuts`; Evade carries `buffPositiveEffect` +
   * `buffEvadeAndInvincible` + `buffEvade`. A dispel effect (`subState`,
   * `removeBuffsByTrait` in `../battle/buffLifecycle.js`) matches against this set, not
   * against `type`/`ckSelfIndv`/`ckOpIndv` — those gate whether a buff *applies*, `vals`
   * is what a *removal* effect targets. Optional and defaults to "no classification traits
   * recorded" (never matched by a dispel) so the many existing call sites that build an
   * `ActiveBuffInstance` without dispel in mind (buff-action evaluation, defense-block,
   * Guts) don't all need to start supplying it.
   */
  vals?: ReadonlySet<number>;
}

/**
 * The traits available for gating one buff-action evaluation: the unit whose action total
 * is being computed (the buff's "self"/holder side) and, when the action targets an
 * opponent (e.g. a DEF-down debuff evaluated on the attacker's side against the defender),
 * the traits of that opposing unit.
 */
export interface BuffTraitContext {
  holderTraits: ReadonlySet<number>;
  targetTraits: ReadonlySet<number>;
}
