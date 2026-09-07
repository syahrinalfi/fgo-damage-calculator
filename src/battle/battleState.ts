import type { Card } from "@atlasacademy/api-connector";
import type { TrackedBuff } from "./buffLifecycle.js";
import type { BattleUnit } from "./unit.js";
import type { Wave } from "../quest/types.js";

/**
 * One fielded servant's live battle state (research/09 §1) — the static baseline stats
 * `BattleUnit` already models (`atk`/`className`/`attribute`/`traits`) plus everything
 * that mutates turn to turn: HP, NP gauge (`FULL_TD_POINT` units, research/04 §1),
 * buffs-as-`TrackedBuff[]` (turn/use expiry, not the bare `ActiveBuffInstance[]`
 * `BattleUnit` uses for a single already-resolved hit), skill cooldowns, and Command
 * Seal count. Front-line vs. sub-member (research/00 §4) matters because only front-line
 * servants can act/be targeted; a sub-member's state is otherwise frozen (research/07 §4,
 * confirmed by the project owner — Order Change swaps in a servant's state unchanged).
 */
export interface ServantInstance extends Omit<BattleUnit, "activeBuffs"> {
  readonly servantId: number;
  readonly isFrontLine: boolean;
  /** This servant's 5-card deck composition (`Entity.cards`, research/03 §6.4/§6.5), in fixed slot order. */
  readonly cardTypes: readonly Card[];
  readonly currentHp: number;
  readonly maxHp: number;
  /** Raw gauge units; `FULL_TD_POINT` (10000, `src/engine/constants.ts`) equals 100%. */
  readonly currentNpGauge: number;
  readonly activeBuffs: readonly TrackedBuff[];
  /** Turns remaining before each of the servant's 3 skill slots is usable again; 0 = ready. */
  readonly skillCooldowns: readonly [number, number, number];
  readonly commandSealsRemaining: number;
}

/**
 * One in-wave enemy's live battle state — a mutable copy of a `WaveEnemy` (research/08,
 * `src/quest/types.ts`) tracking only what changes during the fight: current HP and
 * buffs. Everything else (ATK, traits, skills, NP) stays on the static `WaveEnemy` record
 * this instance was built from; re-deriving it here would duplicate data `BattleState`
 * would then need to keep in sync across a shift/call/change swap (research/08 §3-4) —
 * out of scope for this increment, which does not model swap resolution yet.
 */
export interface EnemyInstance extends Omit<BattleUnit, "activeBuffs"> {
  readonly npcId: number;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly activeBuffs: readonly TrackedBuff[];
}

/**
 * Everything that can change during a fight (research/09 §1). This increment models the
 * state shape only — HP/gauge/cooldown/buff/hand/bag/cost bookkeeping a turn-resolution
 * loop will read and write — not the `Action` discriminated union or the loop itself
 * (research/09 §1's `Action` type, §2's turn-resolution pipeline), which need their own
 * dedicated increment per the prior session's scope-discipline pattern.
 *
 * Every field here (and on `ServantInstance`/`EnemyInstance`) is `readonly`: research/09
 * §1 defines the simulator as a pure function `(BattleState, Action) → BattleState'`, and
 * the existing buff-state layer (`applyBuff`/`advanceTurnBuffs`/`consumeBuffUse`,
 * `../buffs/buffGroup.js`/`./buffLifecycle.js`) is already written as pure functions
 * returning new arrays rather than mutating in place — a mutable `BattleState` would
 * invite in-place writes that break that model once the turn loop lands.
 */
export interface BattleState {
  readonly waves: readonly Wave[];
  readonly currentWaveIndex: number;
  readonly currentTurn: number;
  readonly servants: readonly ServantInstance[];
  readonly enemies: readonly EnemyInstance[];
  /** This turn's drawn pool minus already-played cards (research/00 §4). */
  readonly handCards: readonly Card[];
  /**
   * Not-yet-dealt cards from the current 3-turn draw cycle (research/03 §6.5, research/09
   * §1) — the 3 fielded servants' 15-card combined deck, dealt without replacement across
   * 3 turns, then reshuffled. See `buildCombinedCardDeck` (`./cardDeck.js`) to build the
   * 15-card deck and `drawCardBagHand` (`./cardBag.js`) to deal a turn's hand from it; this
   * field only holds the resulting state shape, not the turn-loop wiring that reads/writes
   * it (still a future increment).
   */
  readonly cardBag: readonly Card[];
  /** Crit stars generated last turn, allocated via this turn's weighted lottery (research/04 §6.2). Never accumulates past one turn (research/04 §6.3). */
  readonly starsCarried: number;
  readonly fieldTraits: ReadonlySet<number>;
  readonly costSpent: number;
  readonly costBudget: number;
  /** Directly-consecutive NPs cast this turn with no non-NP card played in between (research/04 §5.5's NP Chain Bonus); resets to 0 on any non-NP `playCard`. */
  readonly consecutiveNpChainCount: number;
}

/** Builds the `BattleUnit` shape `resolveHit`/`resolveDamageInput` etc. expect from a `ServantInstance`. */
export function servantToBattleUnit(servant: ServantInstance): BattleUnit {
  return { atk: servant.atk, className: servant.className, attribute: servant.attribute, traits: servant.traits, activeBuffs: servant.activeBuffs };
}

/** Builds the `BattleUnit` shape `resolveHit`/`resolveDamageInput` etc. expect from an `EnemyInstance`. */
export function enemyToBattleUnit(enemy: EnemyInstance): BattleUnit {
  return { atk: enemy.atk, className: enemy.className, attribute: enemy.attribute, traits: enemy.traits, activeBuffs: enemy.activeBuffs };
}
