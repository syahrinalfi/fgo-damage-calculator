import type { Buff } from "@atlasacademy/api-connector";
import type { NpLevel } from "../account/types.js";
import { FULL_TD_POINT } from "../engine/constants.js";
import { advanceTurnBuffs, consumeBuffUse } from "./buffLifecycle.js";
import type { Action } from "./action.js";
import { enemyToBattleUnit, servantToBattleUnit, type BattleState, type EnemyInstance, type ServantInstance } from "./battleState.js";
import { buildCombinedCardDeck } from "./cardDeck.js";
import { drawCardBagHand } from "./cardBag.js";
import type { BattleConstants } from "./gameConstants.js";
import { resolveHit, type HitResolutionContext } from "./hitResolution.js";

/**
 * NP gauge's passive accumulation ceiling by NP level (research/04 §5.2a, confirmed by the
 * project owner): 100% at level 1, 200% at levels 2-4, 300% at level 5. Reaching OC stage
 * 4/5 (400-500%) is never done through passive accumulation alone at any level — only
 * through an ephemeral, cast-time-only NP Chain (§5.5) or Overcharge-up-skill addition on
 * top of this capped value, which is why this cap is enforced on `currentNpGauge` itself
 * rather than on the (separate, still-caller-supplied) Overcharge stage used at cast time.
 */
export const NP_GAUGE_CAP_BY_LEVEL: Record<NpLevel, number> = {
  1: 1 * FULL_TD_POINT,
  2: 2 * FULL_TD_POINT,
  3: 2 * FULL_TD_POINT,
  4: 2 * FULL_TD_POINT,
  5: 3 * FULL_TD_POINT,
};

function decrementCooldowns([slot1, slot2, slot3]: readonly [number, number, number]): readonly [number, number, number] {
  return [Math.max(slot1 - 1, 0), Math.max(slot2 - 1, 0), Math.max(slot3 - 1, 0)];
}

/**
 * Advances one servant's `Turn`-based state for `endTurn` (research/09 §2 step 5: buff
 * `Turn` counters and skill cooldowns both tick here). A benched (`!isFrontLine`) servant
 * is returned completely unchanged — research/07 §4, confirmed by the project owner:
 * Order Change freezes a servant's entire state (buffs' `Turn`/`Count`, cooldowns, HP, NP
 * gauge) the instant it leaves the field, resuming only once it's back on the front line.
 */
function advanceServantForEndTurn(servant: ServantInstance): ServantInstance {
  if (!servant.isFrontLine) {
    return servant;
  }
  return {
    ...servant,
    activeBuffs: advanceTurnBuffs(servant.activeBuffs),
    skillCooldowns: decrementCooldowns(servant.skillCooldowns),
  };
}

function advanceEnemyForEndTurn(enemy: EnemyInstance): EnemyInstance {
  return { ...enemy, activeBuffs: advanceTurnBuffs(enemy.activeBuffs) };
}

/**
 * `endTurn` (research/09 §2 step 5): decrements every `Turn`-based buff/cooldown counter,
 * then draws the next turn's 5-card hand from the card bag (`buildCombinedCardDeck` +
 * `drawCardBagHand`, `./cardDeck.js`/`./cardBag.js`).
 *
 * `consecutiveNpChainCount` is reset to 0 here — not explicitly stated by research/09 §1
 * (which only documents the reset triggering on a non-NP `playCard`), but this field's own
 * doc comment scopes it as "so far this turn"; carrying a nonzero count across a turn
 * boundary with no NP actually cast this new turn would contradict that scoping. Treated as
 * a documented, provisional call (same standing as this project's other open-item defaults)
 * rather than a confirmed rule, since no primary/community source addresses it directly.
 *
 * `starsCarried`, `currentWaveIndex`, and wave/death transitions are deliberately untouched
 * by `endTurn` — this increment's `playCard`/`castNp` don't yet generate/consume stars or
 * resolve enemy death transitions (shift/call), so there's nothing correct to compute here.
 */
function resolveEndTurn(state: BattleState, randomFn: () => number): BattleState {
  const servants = state.servants.map(advanceServantForEndTurn);
  const enemies = state.enemies.map(advanceEnemyForEndTurn);

  const fullDeck = buildCombinedCardDeck(servants);
  const { hand, nextBag } = drawCardBagHand(state.cardBag, fullDeck, 5, randomFn);

  return {
    ...state,
    servants,
    enemies,
    handCards: hand,
    cardBag: nextBag,
    currentTurn: state.currentTurn + 1,
    consecutiveNpChainCount: 0,
  };
}

function findServant(state: BattleState, servantId: number): ServantInstance {
  const servant = state.servants.find((s) => s.servantId === servantId);
  if (!servant) {
    throw new RangeError(`No servant with servantId ${servantId} in this BattleState`);
  }
  if (!servant.isFrontLine) {
    throw new RangeError(`Servant ${servantId} is benched (not front-line) and cannot act`);
  }
  return servant;
}

function findEnemy(state: BattleState, npcId: number): EnemyInstance {
  const enemy = state.enemies.find((e) => e.npcId === npcId);
  if (!enemy) {
    throw new RangeError(`No enemy with npcId ${npcId} in this BattleState`);
  }
  return enemy;
}

/**
 * Resolves one hit (`resolveHit`, `./hitResolution.js`) and folds the result back into
 * `state`: the defender's HP, the specific defense-tier/Guts buff instance consumed (if
 * any, `consumeBuffUse`), and the attacker's NP gauge gain (capped at that servant's own
 * `NP_GAUGE_CAP_BY_LEVEL` ceiling).
 *
 * This is the shared core of `playCard`/`castNp` — everything research/09 §2 steps 3a-3d
 * (crit roll from stars, chain-position bonus, Overcharge stage) that would otherwise
 * *derive* `context` is still the caller's responsibility here, matching `resolveHit`'s own
 * existing "already-resolved input" design (see that function's doc comment) — this turn
 * loop does not yet compute any of it itself (research/09 §7: the crit-star weighted
 * lottery and chain detection are their own, not-yet-built increments).
 */
function applyHit(
  state: BattleState,
  servant: ServantInstance,
  enemy: EnemyInstance,
  constants: BattleConstants,
  context: HitResolutionContext,
): BattleState {
  const result = resolveHit(servantToBattleUnit(servant), enemyToBattleUnit(enemy), enemy.currentHp, enemy.maxHp, constants, context);

  const defenderContext = { holderTraits: enemy.traits, targetTraits: servant.traits };
  let enemyBuffs = enemy.activeBuffs;
  if (result.defense.blocked && result.defense.tier) {
    enemyBuffs = consumeBuffUse(enemyBuffs, result.defense.tier as Buff.BuffType, defenderContext);
  }
  if (result.guts.triggered) {
    enemyBuffs = consumeBuffUse(enemyBuffs, "guts" as Buff.BuffType, defenderContext);
  }

  const updatedEnemy: EnemyInstance = { ...enemy, currentHp: result.defenderHpFinal, activeBuffs: enemyBuffs };
  const updatedServant: ServantInstance = {
    ...servant,
    currentNpGauge: Math.min(servant.currentNpGauge + result.npGain, NP_GAUGE_CAP_BY_LEVEL[servant.npLevel]),
  };

  return {
    ...state,
    servants: state.servants.map((s) => (s.servantId === servant.servantId ? updatedServant : s)),
    enemies: state.enemies.map((e) => (e.npcId === enemy.npcId ? updatedEnemy : e)),
  };
}

/**
 * `playCard` — resolves one non-NP hand card. `handCardIndex` indexes into `state`'s
 * *current* `handCards` — i.e. the hand as of the `BattleState` this call actually
 * receives, not a snapshot from before earlier `playCard`s this turn. Removing a played
 * card shifts every later card's index down by one, so a caller queuing multiple
 * `playCard`s in one turn must recompute each `handCardIndex` against the previous call's
 * returned state, not against the turn's original 5-card hand.
 *
 * Throws if `handCardIndex` doesn't point at a real card in `state.handCards`, or if the
 * supplied `context.card.type`/`context.isNP` don't match what's actually being played (the
 * same "don't silently accept wrong-looking input" convention `buildCombinedCardDeck`/
 * `drawCardBagHand` already use) — `state` has no per-slot servant ownership to check the
 * *acting servant* against yet (research/07 §4's still-open data-model note), so
 * `action.servantId` is trusted as the caller's own responsibility, same as `context`.
 *
 * Removes the played card from the hand (played cards aren't returned to the bag — the bag
 * only tracks not-yet-*dealt* cards, research/03 §6.5) and resets `consecutiveNpChainCount`
 * to 0 (research/09 §1: any non-NP `playCard` breaks an NP chain).
 */
function resolvePlayCard(
  state: BattleState,
  action: Extract<Action, { type: "playCard" }>,
  constants: BattleConstants,
): BattleState {
  const servant = findServant(state, action.servantId);
  const enemy = findEnemy(state, action.targetNpcId);
  const card = state.handCards[action.handCardIndex];
  if (card === undefined) {
    throw new RangeError(`handCardIndex ${action.handCardIndex} is out of range for a ${state.handCards.length}-card hand`);
  }
  if (action.context.card.type !== card) {
    throw new RangeError(`context.card.type (${String(action.context.card.type)}) does not match the actual hand card (${String(card)}) at index ${action.handCardIndex}`);
  }
  if (action.context.isNP) {
    throw new RangeError("playCard's context.isNP must be false — NP cards are cast via castNp, not playCard");
  }

  const nextState = applyHit(state, servant, enemy, constants, action.context);
  const handCards = nextState.handCards.filter((_, index) => index !== action.handCardIndex);

  return { ...nextState, handCards, consecutiveNpChainCount: 0 };
}

/**
 * `castNp` — resolves a servant's Noble Phantasm. NP cards are additive and outside the
 * card bag/hand (research/03 §6.5), so unlike `playCard` nothing is removed from
 * `handCards`. Increments `consecutiveNpChainCount` (research/09 §1's NP Chain Bonus) —
 * the *effect* of that count on this NP's own Overcharge stage is still the caller's
 * responsibility to fold into `context.npDamageMultiplier` before calling, since deriving
 * it here would need this NP's own `svals`/OC-stage table, which nothing in this codebase
 * reads yet (no skill/NP function-parsing layer exists — research/09 §7).
 *
 * Resets the casting servant's `currentNpGauge` to exactly 0 after resolving — research/04
 * §5.2a, confirmed by the project owner: casting an NP always fully drains the gauge to 0
 * regardless of how far past 100% (or any other bracket) it was sitting at, with no
 * "keep the remainder" carryover. This overrides whatever gauge `applyHit` just added from
 * this same NP's own hits (irrelevant for the caster, since it's zeroed immediately after).
 */
function resolveCastNp(state: BattleState, action: Extract<Action, { type: "castNp" }>, constants: BattleConstants): BattleState {
  const servant = findServant(state, action.servantId);
  const enemy = findEnemy(state, action.targetNpcId);
  if (!action.context.isNP) {
    throw new RangeError("castNp's context.isNP must be true");
  }

  const nextState = applyHit(state, servant, enemy, constants, action.context);
  const servants = nextState.servants.map((s) => (s.servantId === servant.servantId ? { ...s, currentNpGauge: 0 } : s));

  return { ...nextState, servants, consecutiveNpChainCount: nextState.consecutiveNpChainCount + 1 };
}

/**
 * Applies one `Action` to `state`, producing the next `BattleState` — research/09 §1's
 * pure function `(BattleState, Action) → BattleState'`.
 *
 * `endTurn`, `playCard`, and `castNp` are implemented. Every other case throws,
 * deliberately, rather than faking behavior for mechanics this codebase doesn't correctly
 * model yet: `useSkill`/`useMysticCodeSkill`'s buff-granting needs skill/NP function-array
 * parsing, which nothing in this codebase reads yet (`grantBuff` exists but has no real
 * caller — research/09 §7); `orderChange` needs the hand-card ownership remodeling
 * research/07 §4 already flagged as a prerequisite (a hand slot's card *type* survives a
 * swap, but *which servant* it resolves against changes, and `BattleState.handCards`/
 * `Card[]` has no per-slot owner to reassign); `useCommandSeal`'s exact effect is still
 * open research (research/00 §6).
 *
 * `playCard`/`castNp` themselves are also narrower than research/09 §2's full pipeline:
 * they resolve exactly one hit from an already-fully-resolved `HitResolutionContext` the
 * caller supplies (crit roll, chain position/type, Overcharge stage) — the crit-star
 * weighted lottery, chain-position detection, and Overcharge-stage derivation that would
 * *produce* that context automatically are still not implemented (research/09 §7).
 */
export function resolveAction(
  state: BattleState,
  action: Action,
  constants: BattleConstants,
  randomFn: () => number = Math.random,
): BattleState {
  switch (action.type) {
    case "endTurn":
      return resolveEndTurn(state, randomFn);
    case "playCard":
      return resolvePlayCard(state, action, constants);
    case "castNp":
      return resolveCastNp(state, action, constants);
    case "useSkill":
    case "useMysticCodeSkill":
    case "orderChange":
    case "useCommandSeal":
      throw new Error(`Action type "${action.type}" is not implemented yet`);
    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
