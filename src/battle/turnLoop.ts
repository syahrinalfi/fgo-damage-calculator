import { Card, type Buff } from "@atlasacademy/api-connector";
import type { NpLevel } from "../account/types.js";
import {
  CHAINBONUS_ARTS_RATE,
  CHAINBONUS_MIGHTY_CRIT_RATE,
  CHAINBONUS_QUICK_CRIT_RATE,
  CHAINBONUS_QUICK_STARS,
  FULL_TD_POINT,
} from "../engine/constants.js";
import { resolveGuts } from "../buffs/index.js";
import { advanceTurnBuffs, consumeBuffUse, grantBuff, removeBuffsByTrait } from "./buffLifecycle.js";
import type { Action, AttackChainCard, CommandSealEffect } from "./action.js";
import { ActionUnavailableError } from "./actionError.js";
import { buildEnemyInstance, enemyToBattleUnit, servantToBattleUnit, type BattleState, type EnemyInstance, type ServantInstance } from "./battleState.js";
import { BUFF_ACTION_KEYS } from "./buffActionKeys.js";
import { buildCombinedCardDeck } from "./cardDeck.js";
import { drawCardBagHand } from "./cardBag.js";
import { allocateCritStars, critChanceForStars, rollIsCrit } from "./critStarLottery.js";
import { classifyChain, extraCardChainTypeFrom, isArtsChainFrom, isBusterChainFrom, isMightyChainFrom, isQuickChainFrom, type ChainClassification } from "./chainDetection.js";
import type { BattleConstants } from "./gameConstants.js";
import { resolveHit, type HitResolutionContext } from "./hitResolution.js";
import { resolveUnitActionModifier } from "./modifiers.js";
import { findEnemyByNpcId, resolveShiftTargets } from "../quest/types.js";
import type {
  BuffGrantEffect,
  DelayNpTurnEffect,
  ForceInstantDeathEffect,
  GainHpEffect,
  GainHpPercentEffect,
  GainNpEffect,
  InstantDeathEffect,
  LossHpEffect,
  LossHpSafeEffect,
  LossNpEffect,
  RemoveBuffEffect,
  RevivalEffect,
  ShortenSkillEffect,
  SkillEffect,
  SkillTargetType,
} from "./skillEffect.js";

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

/**
 * Advances one enemy's `Turn`-based state for `endTurn`, mirroring `advanceServantForEndTurn`
 * above: buffs tick the same way, and `currentNpTurns` (research/08-enemy-mechanics.md §5)
 * advances by exactly `+1`, an unconditional, formula-free tick, unlike `ServantInstance.
 * currentNpGauge`'s attacking/defending-formula-driven gain.
 *
 * **Trigger flag, 2026-09-08**: reaching `npTurnLimit` now sets `readyToNp: true` and
 * resets `currentNpTurns` back to `0` (a new cycle starts building toward the next cast),
 * rather than capping and sitting there forever. This is deliberately a **flag only** — no
 * enemy NP effect actually resolves against the servants when this fires; that's the
 * project's still-out-of-scope "phase 2, enemy-attack simulation" (research/08 §5). A caller
 * wanting the actual attack has to build that itself and is responsible for clearing
 * `readyToNp` once it's handled — this function only ever sets it, never clears it, so a
 * flag left unconsumed for multiple turns simply stays `true` while `currentNpTurns` keeps
 * cycling underneath it (a known, documented simplification of the real game, where an
 * enemy that's ready reliably casts on its very next turn rather than possibly cycling
 * through several ready-but-uncast turns).
 *
 * `npTurnLimit <= 0` (a non-NP-capable enemy, research/08 §5 — `QuestEnemy.chargeTurn: 0`
 * live-confirmed) never reaches `readyToNp: true` — guarded explicitly rather than relying
 * on `nextNpTurns >= npTurnLimit` alone, which would otherwise fire on the very first turn
 * for an enemy with no NP at all.
 */
function advanceEnemyForEndTurn(enemy: EnemyInstance): EnemyInstance {
  const nextNpTurns = enemy.currentNpTurns + 1;
  const reachedLimit = enemy.npTurnLimit > 0 && nextNpTurns >= enemy.npTurnLimit;
  return {
    ...enemy,
    activeBuffs: advanceTurnBuffs(enemy.activeBuffs),
    currentNpTurns: reachedLimit ? 0 : nextNpTurns,
    readyToNp: reachedLimit ? true : enemy.readyToNp,
  };
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
 * When every active enemy is dead after already-resolved break-bar shifts, `endTurn` advances
 * to the next wave and builds that wave's independent `initialEnemies`. Reinforcement `call`
 * remains deferred because its trigger semantics are still unresolved; a live shift target
 * prevents advancement naturally because its replacement `EnemyInstance` has positive HP.
 * Star *generation* from landed hits now feeds `starsCarried`
 * directly from `applyHit` (research/09 §7, wired in a later pass than this function's own
 * original comment suggested); this function only ever handles the *consumption* side,
 * allocating whatever `starsCarried` already holds across the freshly drawn hand.
 *
 * The new hand's per-slot crit-star allocation (`handCardStars`, research/04 §6.2's
 * weighted lottery, `allocateCritStars`) is computed here, once per turn, exactly matching
 * that file's confirmed "stars generated during a turn are allocated to determine the
 * *following* turn's per-card crit chance" — the freshly-dealt hand is the natural, and
 * only, point where that following turn's hand is actually known. `starsCarried` itself is
 * then reset to 0 — research/04 §6.3, confirmed: "a single turn's leftover stars are simply
 * discarded once the next turn's crit chances are rolled," not carried indefinitely. Without
 * this reset, an un-updated `starsCarried` (star generation being unwired means nothing else
 * writes to it yet) would get silently re-allocated onto every future turn's hand instead of
 * being spent exactly once.
 *
 * `critChanceBonusCarried` (research/06 §7.2/§7.4's Quick-lead "+20% crit chance for all 5
 * hand cards") is activated the same way: copied into `activeCritChanceBonus` for the
 * freshly-drawn hand, then itself reset to 0, so a Quick-led chain's bonus applies to
 * exactly one future turn's hand rather than persisting indefinitely.
 */
function resolveEndTurn(state: BattleState, randomFn: () => number): BattleState {
  const servants = state.servants.map(advanceServantForEndTurn);
  const advancedEnemies = state.enemies.map(advanceEnemyForEndTurn);
  const nextWaveIndex = state.currentWaveIndex + 1;
  const nextWave = state.enemies.every((enemy) => enemy.currentHp <= 0) ? state.waves[nextWaveIndex] : undefined;
  const currentWaveIndex = nextWave === undefined ? state.currentWaveIndex : nextWaveIndex;
  const enemies = nextWave === undefined ? advancedEnemies : nextWave.initialEnemies.map(buildEnemyInstance);

  const fullDeck = buildCombinedCardDeck(servants);
  const { hand, nextBag } = drawCardBagHand(state.cardBag, fullDeck, 5, randomFn);
  const handCardStars = allocateCritStars(hand, servants, state.starsCarried, randomFn);

  return {
    ...state,
    servants,
    enemies,
    handCards: hand,
    handCardStars,
    cardBag: nextBag,
    starsCarried: 0,
    activeCritChanceBonus: state.critChanceBonusCarried,
    critChanceBonusCarried: 0,
    currentWaveIndex,
    currentTurn: state.currentTurn + 1,
    consecutiveNpChainCount: 0,
    mysticCodeSkillCooldowns: decrementCooldowns(state.mysticCodeSkillCooldowns),
  };
}

/** True only after the final configured wave exists and all of its active enemies are dead. */
export function isQuestCleared(state: BattleState): boolean {
  return state.waves.length > 0 && state.currentWaveIndex === state.waves.length - 1 && state.enemies.every((enemy) => enemy.currentHp <= 0);
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

/** Looks up a servant by id with no front-line requirement — used for `useCommandSeal` targets, since Command Seal is a Master action, not something only an acting front-line servant can receive. */
function findServantAny(state: BattleState, servantId: number): ServantInstance {
  const servant = state.servants.find((s) => s.servantId === servantId);
  if (!servant) {
    throw new RangeError(`No servant with servantId ${servantId} in this BattleState`);
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
 * Resolves FGO's per-chain auto-target rule. Enemy array order is the player's left-to-right
 * slots 1..N, while fallback priority is right-to-left (N..1). Consecutive non-NP face cards
 * from the same servant keep Overkilling the selected corpse; a servant change or any NP
 * boundary switches to the highest-priority living enemy.
 */
function resolveAttackTarget(
  state: BattleState,
  requestedNpcId: number,
  servantId: number,
  isNp: boolean,
  previousSlot: AttackChainCard | undefined,
): EnemyInstance | undefined {
  const requested = state.enemies.find((candidate) => candidate.npcId === requestedNpcId);
  if (requested === undefined) {
    throw new RangeError(`No enemy with npcId ${requestedNpcId} in this BattleState`);
  }
  if (requested?.currentHp !== undefined && requested.currentHp > 0) return requested;
  if (!isNp && requested !== undefined && previousSlot !== undefined && !previousSlot.isNp && previousSlot.servantId === servantId) {
    return requested;
  }
  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const candidate = state.enemies[index];
    if (candidate !== undefined && candidate.currentHp > 0) return candidate;
  }
  return undefined;
}

/**
 * Wave/death transitions, first piece: **break-bar (`shift`) only** — reinforcement
 * (`call`) is deliberately deferred (research/08 §3-4/§6), since no research pass pinned
 * down its exact trigger condition (death of the specific enemy? a turn count? another
 * enemy's death? research/01 §6.3 only established the *mechanism*, not this project's own
 * open "when does it actually fire" question) — modeling it now would be guessing at a
 * trigger this project's own sourcing standard doesn't allow.
 *
 * `shift` is unambiguous by contrast: Atlas Academy's own schema title for the field is
 * literally "Break bar switch to these NPC IDs" (research/08 §4, research/01 §6.3) — this
 * enemy's HP hitting `0` is *the* trigger, no ambiguity to research further. Scans every
 * `currentHp <= 0` enemy; for each, looks up its static `WaveEnemy` record in the current
 * wave's `enemyPool` (`state.waves[state.currentWaveIndex]`) and resolves its `shift`
 * targets (`resolveShiftTargets`, `../quest/types.js`). A resolvable target's `WaveEnemy`
 * record is rebuilt into a fresh `EnemyInstance` (`buildEnemyInstance`, `./battleState.js`)
 * and takes over that same array slot — the boss "continues" rather than the wave treating
 * it as dead. No target (no `shift` array, an empty one, or every listed npcId missing from
 * the pool — research/01 §6.3's noted Rayshift hash-coverage gaps) leaves the `0`-HP entry
 * untouched, i.e. this enemy is genuinely dead.
 *
 * **Only the first resolved shift target is used** when `shift` lists more than one npcId —
 * no live example or schema note in this project's research explains what a multi-entry
 * `shift` array means (simultaneous multi-boss transition? an ordered fallback list?), so
 * rather than guess, this takes the array's natural "primary" reading (first entry) and
 * leaves the rest unused; flagged here as an open item, not a silent assumption. Called
 * unconditionally after every state-returning path that can reduce an enemy's `currentHp`
 * (`applyHit`, `applyInstantDeathEffect`) — a no-op scan when nothing died this call.
 */
function applyShiftTransitions(state: BattleState): BattleState {
  const wave = state.waves[state.currentWaveIndex];
  if (!wave) {
    return state;
  }

  const enemies = state.enemies.map((enemy): EnemyInstance => {
    if (enemy.currentHp > 0) {
      return enemy;
    }
    const waveEnemy = findEnemyByNpcId(wave, enemy.npcId);
    if (!waveEnemy) {
      return enemy;
    }
    const [shiftTarget] = resolveShiftTargets(wave, waveEnemy);
    return shiftTarget ? buildEnemyInstance(shiftTarget) : enemy;
  });

  return { ...state, enemies };
}

/**
 * Resolves one hit (`resolveHit`, `./hitResolution.js`) and folds the result back into
 * `state`: the defender's HP, the specific defense-tier/Guts buff instance consumed (if
 * any, `consumeBuffUse`), the attacker's NP gauge gain (capped at that servant's own
 * `NP_GAUGE_CAP_BY_LEVEL` ceiling), and — new this pass — the hit's own critical-star
 * generation folded into `state.starsCarried` (research/09 §7's previously-open "star
 * generation from landed hits isn't wired" gap; only the *consumption* side, `allocateCritStars`
 * in `resolvePlayCard`, was wired before now).
 *
 * `result.starDropChance` (research/03 §5.1) is a raw, uncapped decimal fraction with no
 * documented ">100%" multi-star behavior — `calculateStarDropChance`'s own doc comment
 * already flags this ("no primary source states this is clamped... a caller treating the
 * result as a Bernoulli probability should clamp it themselves") and file 03 §5.1 describes
 * the mechanic as "a genuine per-hit probability... a Bernoulli-per-hit process, not a fixed
 * average" — so this clamps to `[0, 1]` and rolls **once** per hit for 0-or-1 stars, the
 * literal reading of "Bernoulli," rather than inventing an unsourced "floor the excess into
 * guaranteed stars, roll the remainder" mechanic (the commonly-known in-game behavior for
 * >100% chances) that no primary source in this project's research confirms.
 *
 * This is the shared core of `playCard`/`castNp` — `context` here is always a *complete*
 * `HitResolutionContext` (its caller, `resolvePlayCard`/`resolveCastNp`, is the one that
 * derives `isCrit`/`isBusterChain`/`extraCardChainType` before calling in). Overcharge
 * stage and the remaining server-mod/random-roll fields (research/09 §2 steps 3a-3d) are
 * still the caller's responsibility beyond that, matching `resolveHit`'s own existing
 * "already-resolved input" design (see that function's doc comment).
 */
function applyHit(
  state: BattleState,
  servant: ServantInstance,
  enemy: EnemyInstance,
  constants: BattleConstants,
  context: HitResolutionContext,
  randomFn: () => number,
): BattleState {
  const result = resolveHit(servantToBattleUnit(servant), enemyToBattleUnit(enemy), enemy.currentHp, enemy.maxHp, constants, context);
  const starChance = Math.min(Math.max(result.starDropChance, 0), 1);
  const starsGained = randomFn() < starChance ? 1 : 0;

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

  return applyShiftTransitions({
    ...state,
    servants: state.servants.map((s) => (s.servantId === servant.servantId ? updatedServant : s)),
    enemies: state.enemies.map((e) => (e.npcId === enemy.npcId ? updatedEnemy : e)),
    starsCarried: state.starsCarried + starsGained,
  });
}

/**
 * `playCard` — resolves one non-NP hand card. `handCardIndex` indexes into `state`'s
 * *current* `handCards` — i.e. the hand as of the `BattleState` this call actually
 * receives, not a snapshot from before earlier `playCard`s this turn. Removing a played
 * card shifts every later card's index down by one, so a caller queuing multiple
 * `playCard`s in one turn must recompute each `handCardIndex` against the previous call's
 * returned state, not against the turn's original 5-card hand.
 *
 * Throws if `handCardIndex` doesn't point at a real card in `state.handCards`, if that
 * slot's `HandCard.servantId` (research/07 §4) doesn't match `action.servantId`, if the
 * supplied `context.card.type`/`context.isNP` don't match what's actually being played, or
 * if `action.chainCards` doesn't include the card actually being played — the same "don't
 * silently accept wrong-looking input" convention `buildCombinedCardDeck`/`drawCardBagHand`
 * already use.
 *
 * `HitResolutionContext.isCrit`/`isBusterChain`/`isMightyChain`/`extraCardChainType` are
 * derived here rather than caller-supplied (research/09 §7's "next increment", now built):
 * `isCrit` from this hand slot's `state.handCardStars` allocation plus any
 * `state.activeCritChanceBonus` (`critChanceForStars`/`rollIsCrit`, `./critStarLottery.js`),
 * the other three from classifying `action.chainCards` (`classifyChain`/`isBusterChainFrom`/
 * `isMightyChainFrom`/`extraCardChainTypeFrom`, `./chainDetection.js`).
 *
 * Removes the played card from the hand (played cards aren't returned to the bag — the bag
 * only tracks not-yet-*dealt* cards, research/03 §6.5) and resets `consecutiveNpChainCount`
 * to 0 (research/09 §1: any non-NP `playCard` breaks an NP chain).
 */
function resolvePlayCard(
  state: BattleState,
  action: Extract<Action, { type: "playCard" }>,
  constants: BattleConstants,
  randomFn: () => number,
): BattleState {
  const servant = findServant(state, action.servantId);
  const handCard = state.handCards[action.handCardIndex];
  if (handCard === undefined) {
    throw new RangeError(`handCardIndex ${action.handCardIndex} is out of range for a ${state.handCards.length}-card hand`);
  }
  if (handCard.servantId !== action.servantId) {
    throw new RangeError(`Hand card at index ${action.handCardIndex} belongs to servantId ${handCard.servantId}, not the acting servantId ${action.servantId}`);
  }
  if (action.context.card.type !== handCard.card) {
    throw new RangeError(`context.card.type (${String(action.context.card.type)}) does not match the actual hand card (${String(handCard.card)}) at index ${action.handCardIndex}`);
  }
  if (action.context.isNP) {
    throw new RangeError("playCard's context.isNP must be false — NP cards are cast via castNp, not playCard");
  }
  const chainCardAtPosition = action.chainCards[action.chainPosition - 1];
  if (chainCardAtPosition === undefined || chainCardAtPosition.isNp || chainCardAtPosition.type !== handCard.card || chainCardAtPosition.servantId !== handCard.servantId) {
    throw new RangeError("action.chainCards[action.chainPosition - 1] must match the card actually being played (matched by type + servantId)");
  }

  const classification = classifyChain(action.chainCards);
  const enemy = resolveAttackTarget(state, action.targetNpcId, action.servantId, false, action.chainCards[action.chainPosition - 2]);
  if (enemy === undefined) {
    return {
      ...state,
      handCards: state.handCards.filter((_, index) => index !== action.handCardIndex),
      handCardStars: state.handCardStars.filter((_, index) => index !== action.handCardIndex),
      consecutiveNpChainCount: 0,
    };
  }
  // `handCardStars` is always kept parallel to `handCards` (same length/order), and `handCard` above already confirmed this index is in range.
  const stars = state.handCardStars[action.handCardIndex] as number;
  // `state.activeCritChanceBonus` (a Quick-led chain's next-turn "+20% crit chance for all
  // hand cards," research/06 §7.2/§7.4) is a flat add-on, applied uniformly to every hand
  // card regardless of its own star allocation — capped at 1.0 to mirror
  // `critChanceForStars`'s own capping convention (a combined chance can't exceed 100%).
  const isCrit = rollIsCrit(Math.min(critChanceForStars(stars) + state.activeCritChanceBonus, 1), randomFn);
  // `classifyChain` above already confirmed `action.chainCards` has exactly 3 entries, so index 0 always exists.
  const chainLeadCardType = (action.chainCards[0] as (typeof action.chainCards)[number]).type;
  const context: HitResolutionContext = {
    ...action.context,
    npEnemyServerMod: enemy.serverMod.tdRate / 1000,
    starEnemyServerMod: enemy.serverMod.starRate / 1000,
    isCrit,
    isBusterChain: isBusterChainFrom(classification),
    isMightyChain: isMightyChainFrom(classification),
    extraCardChainType: "none",
    chainLeadCardType,
  };

  const hitState = applyHit(state, servant, enemy, constants, context, randomFn);
  const handCards = hitState.handCards.filter((_, index) => index !== action.handCardIndex);
  const handCardStars = hitState.handCardStars.filter((_, index) => index !== action.handCardIndex);
  const nextState =
    action.chainPosition === 3 ? applyChainCompletionBonus(hitState, action.chainCards, classification) : hitState;

  return { ...nextState, handCards, handCardStars, consecutiveNpChainCount: 0 };
}

/**
 * Applies the Arts/Quick-chain completion bonuses (research/06 §7.2) once, when a chain's
 * 3rd (last) card is played (`resolvePlayCard`'s `action.chainPosition === 3` check) —
 * distinct from `isBusterChainFrom`/`extraCardChainTypeFrom`, which feed the per-hit damage
 * formula and so apply on every card of the chain, not just its last.
 *
 * **Arts chain** (`CHAINBONUS_ARTS_RATE`, `src/engine/constants.ts`): grants +20% NP gauge
 * to every *distinct* servant whose card is in the chain — not just the current attacker,
 * and not limited to front-line-only `resolveAllyTargets` targeting, since the chain's own
 * card composition (`chainCards`) already names exactly which servants qualify. Capped at
 * each servant's own `NP_GAUGE_CAP_BY_LEVEL` ceiling, same as every other gauge grant.
 *
 * **Quick chain** (`CHAINBONUS_QUICK_STARS`): adds a flat `CHAINBONUS_QUICK_STARS` to
 * `BattleState.starsCarried` for the *next* turn's crit-star allocation (research/04 §6.2) —
 * not this turn's `handCardStars`, which is already fixed for the turn in progress.
 *
 * A chain can only be one of `busterChain`/`artsChain`/`quickChain`/`mightyChain`/`none` at
 * once (`ChainClassification`), so at most one of the Arts/Quick-chain branches above ever
 * applies per call.
 *
 * **Quick lead** (`CHAINBONUS_QUICK_CRIT_RATE`): unlike the two branches above, this is keyed
 * off `chainCards[0].type` directly rather than `classification` — it fires whenever Quick
 * merely *leads* the chain (research/06 §7.2/§7.4), including a Quick-led Mighty Chain that
 * isn't uniformly Quick and so wouldn't satisfy `isQuickChainFrom`. Independent of, and can
 * co-occur with, the `isQuickChainFrom` branch (e.g. a uniform Quick-Quick-Quick chain gets
 * both the stars-next-turn bonus and this one). Adds to `state.critChanceBonusCarried`, not
 * `activeCritChanceBonus` — see that field's doc comment on `BattleState`.
 *
 * **Mighty Chain** (`CHAINBONUS_MIGHTY_CRIT_RATE`, `isMightyChainFrom`): a one-of-each-color
 * (QAB) chain's own +20% crit chance (research/06 §7.4), also carried via
 * `critChanceBonusCarried`. Explicitly additive with the Quick-lead branch above, not
 * mutually exclusive — research/06 §7.4 notes the two "can stack if the chain also happens
 * to start with Quick." Mighty Chain's other two bonuses (ATK +50%, applied per-hit via
 * `DamageInput.isMightyChain` instead of here; NP Gain Up / Critical Star Drop Rate Up,
 * unmodeled — no confirmed numeric value in any source checked, research/06 §7.5) are not
 * this function's concern.
 */
function applyChainCompletionBonus(
  state: BattleState,
  chainCards: readonly AttackChainCard[],
  classification: ChainClassification,
): BattleState {
  let nextState = state;
  if (isArtsChainFrom(classification)) {
    const bonusServantIds = new Set(chainCards.map((c) => c.servantId));
    const bonusAmount = FULL_TD_POINT * CHAINBONUS_ARTS_RATE;
    const servants = nextState.servants.map((s) =>
      bonusServantIds.has(s.servantId) ? { ...s, currentNpGauge: Math.min(s.currentNpGauge + bonusAmount, NP_GAUGE_CAP_BY_LEVEL[s.npLevel]) } : s,
    );
    nextState = { ...nextState, servants };
  } else if (isQuickChainFrom(classification)) {
    nextState = { ...nextState, starsCarried: nextState.starsCarried + CHAINBONUS_QUICK_STARS };
  }
  // `classifyChain` (in `resolvePlayCard`) already confirmed `chainCards` has exactly 3 entries.
  if ((chainCards[0] as (typeof chainCards)[number]).type === Card.QUICK) {
    nextState = { ...nextState, critChanceBonusCarried: nextState.critChanceBonusCarried + CHAINBONUS_QUICK_CRIT_RATE };
  }
  if (isMightyChainFrom(classification)) {
    // research/06 §7.4: Mighty Chain's own +20% crit chance is separate from, and stacks
    // with, the Quick-lead bonus above if the Mighty Chain also happens to start with Quick.
    nextState = { ...nextState, critChanceBonusCarried: nextState.critChanceBonusCarried + CHAINBONUS_MIGHTY_CRIT_RATE };
  }
  return nextState;
}

/**
 * `castNp` — resolves a servant's Noble Phantasm. NP cards are available outside the random
 * card bag/hand but still consume one of the turn's 3 selected attack slots, so unlike
 * `playCard` nothing is removed from `handCards`. Increments `consecutiveNpChainCount`
 * (research/09 §1's NP Chain Bonus) —
 * the *effect* of that count on this NP's own Overcharge stage is still the caller's
 * responsibility to fold into `context.npDamageMultiplier` before calling, since deriving
 * it here would need this NP's own `svals`/OC-stage table, which nothing in this codebase
 * reads yet (no skill/NP function-parsing layer exists — research/09 §7).
 *
 * Consumes the casting servant's pre-cast gauge before damage, then preserves refund generated
 * by the NP's own hit(s). Any amount above 100% is consumed too; only newly generated refund
 * remains after the cast.
 *
 * The NP's color/owner participates in chain classification, but its own hit hardcodes
 * crit/chain-derived damage flags off. Chain completion still fires when the NP occupies slot
 * 3, and a same-servant three-slot selection enables the separate automatic Extra Attack.
 *
 * `action.effects` (default `[]` — `./action.js`'s doc comment) are folded in via
 * `applySkillEffect` strictly *after* the above (damage, gauge reset, NP Chain count) —
 * this is where `InstantDeathEffect` (`./skillEffect.js`) attaches for NPs that carry it.
 */
function resolveCastNp(
  state: BattleState,
  action: Extract<Action, { type: "castNp" }>,
  constants: BattleConstants,
  randomFn: () => number,
): BattleState {
  const servant = findServant(state, action.servantId);
  if (servant.currentNpGauge < FULL_TD_POINT) {
    throw new ActionUnavailableError(`Servant ${action.servantId} needs at least 100% NP gauge to cast, got ${servant.currentNpGauge}`);
  }
  const declaredTargetNpcIds = action.targetNpcIds ?? [action.targetNpcId];
  if (declaredTargetNpcIds.length === 0 || !declaredTargetNpcIds.includes(action.targetNpcId)) {
    throw new RangeError("castNp targetNpcIds must contain at least the primary targetNpcId");
  }
  for (const targetNpcId of declaredTargetNpcIds) {
    findEnemy(state, targetNpcId);
  }
  if (!action.context.isNP) {
    throw new RangeError("castNp's context.isNP must be true");
  }
  const chainCardAtPosition = action.chainCards[action.chainPosition - 1];
  if (
    chainCardAtPosition === undefined ||
    !chainCardAtPosition.isNp ||
    chainCardAtPosition.type !== action.context.card.type ||
    chainCardAtPosition.servantId !== action.servantId
  ) {
    throw new RangeError("castNp must occupy the matching NP-marked attack-chain slot (matched by type + servantId)");
  }
  const classification = classifyChain(action.chainCards);
  const isAoe = declaredTargetNpcIds.length > 1;
  const primaryTarget = isAoe
    ? state.enemies.find((candidate) => candidate.npcId === action.targetNpcId && candidate.currentHp > 0)
    : resolveAttackTarget(state, action.targetNpcId, action.servantId, true, action.chainCards[action.chainPosition - 2]);
  const targetNpcIds = isAoe
    ? declaredTargetNpcIds.filter((npcId) => state.enemies.some((candidate) => candidate.npcId === npcId && candidate.currentHp > 0))
    : primaryTarget === undefined
      ? []
      : [primaryTarget.npcId];
  if (targetNpcIds.length === 0) return state;
  const primaryTargetNpcId = primaryTarget?.npcId ?? targetNpcIds[0] as number;

  // NP consumption happens before damage; refund generated by the NP's own hit(s) therefore
  // remains after the cast instead of being erased with the pre-cast gauge.
  let nextState: BattleState = {
    ...state,
    servants: state.servants.map((candidate) => (candidate.servantId === servant.servantId ? { ...candidate, currentNpGauge: 0 } : candidate)),
    consecutiveNpChainCount: state.consecutiveNpChainCount + 1,
  };

  for (const effect of action.effectsBeforeDamage ?? []) {
    nextState = applySkillEffect(nextState, servant.servantId, effect, undefined, primaryTargetNpcId, constants, randomFn);
  }

  const defaultHitContexts = action.hitContexts ?? [action.context];
  const targetPlans = targetNpcIds.map((targetNpcId) => ({
    targetNpcId,
    hitContexts: action.targetHitContexts?.find((plan) => plan.targetNpcId === targetNpcId)?.hitContexts ?? defaultHitContexts,
  }));
  for (const plan of targetPlans) {
    for (const hitContext of plan.hitContexts) {
      if (!hitContext.isNP || hitContext.card.type !== action.context.card.type) {
        throw new RangeError("Every castNp hit context must be NP-typed and match the NP card color");
      }
      const currentEnemy = nextState.enemies.find((candidate) => candidate.npcId === plan.targetNpcId);
      if (currentEnemy === undefined) break; // A just-broken shift bar does not receive the NP's remaining hits.
      const currentServant = findServant(nextState, action.servantId);
      const context: HitResolutionContext = {
        ...hitContext,
        card: { ...hitContext.card, position: 1 },
        npEnemyServerMod: currentEnemy.serverMod.tdRate / 1000,
        starEnemyServerMod: currentEnemy.serverMod.starRate / 1000,
        isCrit: false,
        isBusterChain: false,
        isMightyChain: false,
        extraCardChainType: "none",
        chainLeadCardType: (action.chainCards[0] as AttackChainCard).type,
      };
      nextState = applyHit(nextState, currentServant, currentEnemy, constants, context, randomFn);
    }
  }

  for (const effect of action.effects ?? []) {
    nextState = applySkillEffect(nextState, servant.servantId, effect, undefined, primaryTargetNpcId, constants, randomFn);
  }

  if (action.chainPosition === 3) {
    nextState = applyChainCompletionBonus(nextState, action.chainCards, classification);
  }

  return nextState;
}

function resolvePlayExtraCard(
  state: BattleState,
  action: Extract<Action, { type: "playExtraCard" }>,
  constants: BattleConstants,
  randomFn: () => number,
): BattleState {
  const servant = findServant(state, action.servantId);
  if (action.context.isNP || action.context.card.type !== Card.EXTRA) {
    throw new RangeError("playExtraCard requires a non-NP Extra-card context");
  }
  const classification = classifyChain(action.chainCards);
  if (!classification.isBraveChain || action.chainCards.some((candidate) => candidate.servantId !== action.servantId)) {
    throw new RangeError("playExtraCard requires a three-slot Brave Chain owned by the acting servant");
  }
  const enemy = resolveAttackTarget(state, action.targetNpcId, action.servantId, false, action.chainCards[2]);
  if (enemy === undefined) return state;
  const context: HitResolutionContext = {
    ...action.context,
    card: { type: Card.EXTRA, position: 1 },
    npEnemyServerMod: enemy.serverMod.tdRate / 1000,
    starEnemyServerMod: enemy.serverMod.starRate / 1000,
    chainLeadCardType: (action.chainCards[0] as AttackChainCard).type,
    isCrit: false,
    isBusterChain: isBusterChainFrom(classification),
    isMightyChain: isMightyChainFrom(classification),
    extraCardChainType: extraCardChainTypeFrom(classification),
  };
  const nextState = applyHit(state, servant, enemy, constants, context, randomFn);
  return { ...nextState, consecutiveNpChainCount: 0 };
}

/** Command Seal costs by effect (research/00 §6, confirmed by the project owner). */
const COMMAND_SEAL_COST: Record<CommandSealEffect["kind"], number> = {
  fillNpGauge: 1,
  healHp: 1,
  reviveParty: 3,
};

/**
 * `useCommandSeal` — spends `BattleState.commandSealsRemaining` (a Master-level, account-
 * wide resource — research/00 §6, confirmed by the project owner) on one of 3 effects.
 * Throws if fewer seals remain than the effect's cost, rather than silently allowing an
 * over-spend.
 *
 * `fillNpGauge` **raises the gauge to at least 100%, never lowering it** — `Math.max`, not
 * an unconditional set. A flat "set to exactly 100%" would actually *reduce* the gauge of
 * any servant above NP level 1 already sitting past 100% (research/04 §5.2a: NP levels
 * 2-4/5 can passively hold up to 200%/300%), which makes no sense for a beneficial effect;
 * `Math.max` is the only reading consistent with Command Seals existing to *help* reach
 * NP-ready state. `healHp` sets HP to exactly `maxHp` — no equivalent above-cap case exists
 * for HP (no overheal mechanic is modeled), so set-vs-max is not a live distinction there.
 *
 * `reviveParty` applies to every servant in `state.servants` at `currentHp <= 0` regardless
 * of front-line/benched status, since Command Seal targeting isn't restricted to acting
 * front-line servants the way `playCard`/`castNp` are (still a documented, provisional
 * scope choice — research/00 §6's still-open note). A revived servant's NP gauge is maxed
 * to *that servant's own* `NP_GAUGE_CAP_BY_LEVEL` ceiling (100/200/300% by NP level), not
 * flatly to 100% like `fillNpGauge` — matching the confirmed "mentokin NP gauge juga"
 * (maxes the gauge too) wording, which describes hitting each servant's own cap.
 */
function resolveUseCommandSeal(state: BattleState, action: Extract<Action, { type: "useCommandSeal" }>): BattleState {
  const cost = COMMAND_SEAL_COST[action.effect.kind];
  if (state.commandSealsRemaining < cost) {
    throw new RangeError(`Not enough Command Seals: this effect costs ${cost}, only ${state.commandSealsRemaining} remain`);
  }

  let servants = state.servants;
  switch (action.effect.kind) {
    case "fillNpGauge": {
      const target = findServantAny(state, action.effect.servantId);
      servants = servants.map((s) => (s.servantId === target.servantId ? { ...s, currentNpGauge: Math.max(s.currentNpGauge, FULL_TD_POINT) } : s));
      break;
    }
    case "healHp": {
      const target = findServantAny(state, action.effect.servantId);
      servants = servants.map((s) => (s.servantId === target.servantId ? { ...s, currentHp: s.maxHp } : s));
      break;
    }
    case "reviveParty": {
      servants = servants.map((s) =>
        s.currentHp <= 0 ? { ...s, currentHp: s.maxHp, currentNpGauge: NP_GAUGE_CAP_BY_LEVEL[s.npLevel] } : s,
      );
      break;
    }
  }

  return { ...state, servants, commandSealsRemaining: state.commandSealsRemaining - cost };
}

/**
 * Resolves which servant(s) an ally-only `self`/`ptOne`/`ptAll` skill-effect targeting
 * shape (`SkillTargetType`, `./skillEffect.js`) actually reaches, as a list of
 * `servantId`s — the shared targeting logic every ally-side `SkillEffect` variant uses.
 * `self` always resolves against `actingServantId` regardless of front-line status (a
 * servant can buff/heal/charge itself before being swapped in) — `actingServantId` is
 * `undefined` for a Mystic Code skill, which has no servant of its own to mean "self", so a
 * `self`-targeted effect there throws rather than silently doing nothing. `ptAll` reaches
 * every front-line servant only, never the bench, matching `ServantInstance`'s existing
 * "only front-line servants can act/be targeted" convention; `ptOne` requires
 * `targetServantId` and — same convention — throws if it doesn't resolve to a front-line
 * servant.
 */
function resolveAllyTargets(
  servants: readonly ServantInstance[],
  targetType: SkillTargetType,
  actingServantId: number | undefined,
  targetServantId: number | undefined,
): readonly number[] {
  switch (targetType) {
    case "self":
      if (actingServantId === undefined) {
        throw new RangeError('A "self" skill effect requires an acting servant — a Mystic Code skill has none');
      }
      return [actingServantId];
    case "ptAll":
      return servants.filter((s) => s.isFrontLine).map((s) => s.servantId);
    case "ptOne": {
      if (targetServantId === undefined) {
        throw new RangeError("A ptOne skill effect requires action.targetServantId");
      }
      const target = servants.find((s) => s.servantId === targetServantId);
      if (!target) {
        throw new RangeError(`No servant with servantId ${targetServantId} in this BattleState`);
      }
      if (!target.isFrontLine) {
        throw new RangeError(`Servant ${targetServantId} is benched (not front-line) and cannot be targeted by a ptOne skill effect`);
      }
      return [target.servantId];
    }
  }
}

/** Applies one `BuffGrantEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets` resolves it to, via `grantBuff` (buffGroup unstacking already handled there). */
function applyBuffGrantEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: BuffGrantEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  return servants.map((s) =>
    targetIds.has(s.servantId) ? { ...s, activeBuffs: grantBuff(s.activeBuffs, effect.buff, effect.rawTurn, effect.rawCount) } : s,
  );
}

/** Applies one `GainNpEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets` resolves it to, capping each at that servant's own `NP_GAUGE_CAP_BY_LEVEL` ceiling. */
function applyGainNpEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: GainNpEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  return servants.map((s) =>
    targetIds.has(s.servantId) ? { ...s, currentNpGauge: Math.min(s.currentNpGauge + effect.rawAmount, NP_GAUGE_CAP_BY_LEVEL[s.npLevel]) } : s,
  );
}

/** Applies one `GainHpEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets` resolves it to, capping each at its own `maxHp` (no overheal). */
function applyGainHpEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: GainHpEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  return servants.map((s) => (targetIds.has(s.servantId) ? { ...s, currentHp: Math.min(s.currentHp + effect.rawAmount, s.maxHp) } : s));
}

/** Applies one `GainHpPercentEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets` resolves it to — heals `rawPercent / 1000` of that servant's own `maxHp`, rounded, capped at `maxHp` (no overheal). */
function applyGainHpPercentEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: GainHpPercentEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  return servants.map((s) =>
    targetIds.has(s.servantId) ? { ...s, currentHp: Math.min(s.currentHp + Math.round((s.maxHp * effect.rawPercent) / 1000), s.maxHp) } : s,
  );
}

/** Applies one `LossNpEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets` resolves it to, flooring each at `0` (the mirror of `applyGainNpEffect`'s `NP_GAUGE_CAP_BY_LEVEL` ceiling). */
function applyLossNpEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: LossNpEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  return servants.map((s) => (targetIds.has(s.servantId) ? { ...s, currentNpGauge: Math.max(s.currentNpGauge - effect.rawAmount, 0) } : s));
}

/** Applies one `LossHpSafeEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets` resolves it to — subtracts the flat `amount` of HP, floored at `1` (never lethal, matching the `FuncType`'s "safe" naming). */
function applyLossHpSafeEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: LossHpSafeEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  return servants.map((s) =>
    targetIds.has(s.servantId) ? { ...s, currentHp: Math.max(s.currentHp - effect.amount, 1) } : s,
  );
}

/** Applies one `LossHpEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets` resolves it to — subtracts the flat `amount` of HP, floored at `0` (unlike `applyLossHpSafeEffect`'s `1`-floor, this can bring a servant to exactly `0`). */
function applyLossHpEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: LossHpEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  return servants.map((s) =>
    targetIds.has(s.servantId) ? { ...s, currentHp: Math.max(s.currentHp - effect.amount, 0) } : s,
  );
}

/** Applies one `ShortenSkillEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets` resolves it to — subtracts `rawTurns` from all 3 `skillCooldowns` entries at once, each floored at `0` (the same per-slot flooring shape `decrementCooldowns` above uses, generalized from "always -1" to an arbitrary `rawTurns`). */
function applyShortenSkillEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: ShortenSkillEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  const shortened = ([slot1, slot2, slot3]: readonly [number, number, number]): readonly [number, number, number] => [
    Math.max(slot1 - effect.rawTurns, 0),
    Math.max(slot2 - effect.rawTurns, 0),
    Math.max(slot3 - effect.rawTurns, 0),
  ];
  return servants.map((s) => (targetIds.has(s.servantId) ? { ...s, skillCooldowns: shortened(s.skillCooldowns) } : s));
}

/**
 * Applies one `RevivalEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets`
 * resolves it to — only a target already at `currentHp <= 0` is revived (to full `maxHp`
 * and its own `NP_GAUGE_CAP_BY_LEVEL` ceiling); a still-living target is left untouched,
 * mirroring `resolveUseCommandSeal`'s `reviveParty` effect below in that regard. Unlike
 * `reviveParty`, though, this shares the standard `resolveAllyTargets` (`self`/`ptOne`/
 * `ptAll`) front-line-only restriction every other `SkillEffect` uses — `reviveParty`'s own
 * benched-inclusive scope is a documented, provisional Command-Seal-specific choice
 * (research/00 §6), not the general rule for a `revival` skill/NP effect.
 */
function applyRevivalEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: RevivalEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  return servants.map((s) =>
    targetIds.has(s.servantId) && s.currentHp <= 0 ? { ...s, currentHp: s.maxHp, currentNpGauge: NP_GAUGE_CAP_BY_LEVEL[s.npLevel] } : s,
  );
}

/** Applies one `ForceInstantDeathEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets` resolves it to — unconditionally sets `currentHp` to `0` (no roll, no `resolveGuts` check — see the effect's own doc comment). */
function applyForceInstantDeathEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: ForceInstantDeathEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  return servants.map((s) => (targetIds.has(s.servantId) ? { ...s, currentHp: 0 } : s));
}

/**
 * Applies one `RemoveBuffEffect` (`./skillEffect.js`, research/05 §5's `subState`) to every
 * unit it targets, via `removeBuffsByTrait` (`./buffLifecycle.js`). `self`/`ptAll`/`ptOne`
 * share `resolveAllyTargets`, same as every other ally-side effect; `enemyOne` resolves
 * `targetNpcId` against `state.enemies` (`findEnemy`, throwing on an unknown id), `enemyAll`
 * reaches every enemy unconditionally — enemies have no bench concept in this project's
 * model, so there's no front-line-equivalent restriction to apply there.
 *
 * Returns the whole next `BattleState` (not just `servants`, unlike the ally-only `apply*`
 * functions above) since an enemy-targeted removal only touches `state.enemies`.
 */
function applyRemoveBuffEffect(
  state: BattleState,
  actingServantId: number | undefined,
  effect: RemoveBuffEffect,
  targetServantId: number | undefined,
  targetNpcId: number | undefined,
): BattleState {
  const dispelled = (buffs: ServantInstance["activeBuffs"]) => removeBuffsByTrait(buffs, effect.targetTrait);

  switch (effect.targetType) {
    case "enemyOne": {
      if (targetNpcId === undefined) {
        throw new RangeError("An enemyOne skill effect requires action.targetNpcId");
      }
      const target = findEnemy(state, targetNpcId);
      return { ...state, enemies: state.enemies.map((e) => (e.npcId === target.npcId ? { ...e, activeBuffs: dispelled(e.activeBuffs) } : e)) };
    }
    case "enemyAll":
      return { ...state, enemies: state.enemies.map((e) => ({ ...e, activeBuffs: dispelled(e.activeBuffs) })) };
    default: {
      const targetIds = new Set(resolveAllyTargets(state.servants, effect.targetType, actingServantId, targetServantId));
      return { ...state, servants: state.servants.map((s) => (targetIds.has(s.servantId) ? { ...s, activeBuffs: dispelled(s.activeBuffs) } : s)) };
    }
  }
}

/**
 * Applies one `InstantDeathEffect` (`./skillEffect.js`) — rolls `effect.deathRate / 1000`
 * against `randomFn()` independently for each targeted enemy, setting `currentHp` straight
 * to `0` on success (no `resolveGuts` check — see the effect's own doc comment for why).
 * Enemy-only, matching `RemoveBuffEffect`'s `enemyOne`/`enemyAll` handling above.
 */
/**
 * Implements the full instant-death success-rate formula (community source: firq.dev,
 * cross-referenced against live `funcTargetType` data for each buff type this session — see
 * `BUFF_ACTION_KEYS`'s doc comment for the per-term sourcing, one tier below this project's
 * live-tested findings): `finalChance = hitRate * enemyDeathRate * (1 + grant - resist +
 * nonresist)`, clamped to `[0, 1]` before rolling. `hitRate` is `effect.deathRate`
 * (already-OC-resolved), `enemyDeathRate` is the target's own `EnemyInstance.deathRate`
 * (research/08 §2's `QuestEnemy.deathRate`, per-mille), `grant` is the attacker's
 * `grantInstantdeath` buff total, and `resist`/`nonresist` are the target's own
 * `resistInstantdeath`/`nonresistInstantdeath` buff totals (both target-side despite
 * "nonresist" reading like an attacker-side "ignore resistance" buff — see
 * `BUFF_ACTION_KEYS`'s doc comment).
 *
 * Guts is now wired in on a success (`resolveGuts`, `../buffs/guts.js`) — the earlier
 * "bypasses `resolveGuts` entirely" gap is closed: cross-corroborated community sources
 * (GameFAQs, GamePress Q&A) confirm instant death triggers Guts the same way ordinary
 * lethal damage does, so a successful roll no longer unconditionally zeroes `currentHp` —
 * it goes through the same Guts check/consume path `applyHit` already uses for ordinary
 * hits. `forceInstantDeath` (`applyForceInstantDeathEffect` below) is deliberately NOT
 * given the same treatment — no source addresses whether a self-sacrifice NP *cost* (as
 * opposed to death inflicted by an attack) should respect the caster's own Guts, and it's a
 * different enough mechanic (research/09 §7) that assuming symmetry would repeat the
 * project's own `hastenNpturn`/`delayNpturn` mirror-symmetry lesson.
 */
function applyInstantDeathEffect(
  state: BattleState,
  effect: InstantDeathEffect,
  targetNpcId: number | undefined,
  actingServantId: number | undefined,
  constants: BattleConstants,
  randomFn: () => number,
): BattleState {
  const attacker = actingServantId === undefined ? undefined : servantToBattleUnit(findServant(state, actingServantId));
  const attackerTraits = attacker?.traits ?? new Set<number>();
  const attackerBuffs = attacker?.activeBuffs ?? [];

  const kills = (enemy: EnemyInstance): EnemyInstance => {
    const enemyTraits = enemyToBattleUnit(enemy).traits;
    const defenderContext = { holderTraits: enemyTraits, targetTraits: attackerTraits };
    const attackerContext = { holderTraits: attackerTraits, targetTraits: enemyTraits };

    const resist = resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.RESIST_INSTANT_DEATH, enemy.activeBuffs, defenderContext);
    const nonresist = resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.NONRESIST_INSTANT_DEATH, enemy.activeBuffs, defenderContext);
    const grant = resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.GRANT_INSTANT_DEATH, attackerBuffs, attackerContext);
    const rawChance = (effect.deathRate / 1000) * (enemy.deathRate / 1000) * (1 + grant - resist + nonresist);
    const finalChance = Math.min(Math.max(rawChance, 0), 1);
    if (randomFn() >= finalChance) {
      return enemy;
    }

    const guts = resolveGuts(0, enemy.maxHp, enemy.activeBuffs, defenderContext);
    const activeBuffs = guts.triggered ? consumeBuffUse(enemy.activeBuffs, "guts" as Buff.BuffType, defenderContext) : enemy.activeBuffs;
    return { ...enemy, currentHp: guts.hpAfter, activeBuffs };
  };

  if (effect.targetType === "enemyOne") {
    if (targetNpcId === undefined) {
      throw new RangeError("An enemyOne skill effect requires action.targetNpcId");
    }
    const target = findEnemy(state, targetNpcId);
    return applyShiftTransitions({ ...state, enemies: state.enemies.map((e) => (e.npcId === target.npcId ? kills(e) : e)) });
  }
  return applyShiftTransitions({ ...state, enemies: state.enemies.map(kills) });
}

/** Applies one `DelayNpTurnEffect` (`./skillEffect.js`) — subtracts `effect.rawTurns` from each targeted enemy's `currentNpTurns`, floored at `0`. Enemy-only, same `enemyOne`/`enemyAll` handling as `applyInstantDeathEffect` above. */
function applyDelayNpTurnEffect(state: BattleState, effect: DelayNpTurnEffect, targetNpcId: number | undefined): BattleState {
  const delayed = (enemy: EnemyInstance): EnemyInstance => ({ ...enemy, currentNpTurns: Math.max(enemy.currentNpTurns - effect.rawTurns, 0) });

  if (effect.targetType === "enemyOne") {
    if (targetNpcId === undefined) {
      throw new RangeError("An enemyOne skill effect requires action.targetNpcId");
    }
    const target = findEnemy(state, targetNpcId);
    return { ...state, enemies: state.enemies.map((e) => (e.npcId === target.npcId ? delayed(e) : e)) };
  }
  return { ...state, enemies: state.enemies.map(delayed) };
}

/** Dispatches one `SkillEffect` (`./skillEffect.js`) to the matching `apply*Effect` function, folding the result back into `state`. */
function applySkillEffect(
  state: BattleState,
  actingServantId: number | undefined,
  effect: SkillEffect,
  targetServantId: number | undefined,
  targetNpcId: number | undefined,
  constants: BattleConstants,
  randomFn: () => number,
): BattleState {
  switch (effect.kind) {
    case "grantBuff":
      return { ...state, servants: applyBuffGrantEffect(state.servants, actingServantId, effect, targetServantId) };
    case "gainNp":
      return { ...state, servants: applyGainNpEffect(state.servants, actingServantId, effect, targetServantId) };
    case "gainHp":
      return { ...state, servants: applyGainHpEffect(state.servants, actingServantId, effect, targetServantId) };
    case "gainHpPercent":
      return { ...state, servants: applyGainHpPercentEffect(state.servants, actingServantId, effect, targetServantId) };
    case "revival":
      return { ...state, servants: applyRevivalEffect(state.servants, actingServantId, effect, targetServantId) };
    case "removeBuff":
      return applyRemoveBuffEffect(state, actingServantId, effect, targetServantId, targetNpcId);
    case "gainStar":
      return { ...state, starsCarried: state.starsCarried + effect.rawAmount };
    case "lossNp":
      return { ...state, servants: applyLossNpEffect(state.servants, actingServantId, effect, targetServantId) };
    case "lossHpSafe":
      return { ...state, servants: applyLossHpSafeEffect(state.servants, actingServantId, effect, targetServantId) };
    case "shortenSkill":
      return { ...state, servants: applyShortenSkillEffect(state.servants, actingServantId, effect, targetServantId) };
    case "lossStar":
      return { ...state, starsCarried: Math.max(state.starsCarried - effect.rawAmount, 0) };
    case "lossHp":
      return { ...state, servants: applyLossHpEffect(state.servants, actingServantId, effect, targetServantId) };
    case "instantDeath":
      return applyInstantDeathEffect(state, effect, targetNpcId, actingServantId, constants, randomFn);
    case "forceInstantDeath":
      return { ...state, servants: applyForceInstantDeathEffect(state.servants, actingServantId, effect, targetServantId) };
    case "delayNpTurn":
      return applyDelayNpTurnEffect(state, effect, targetNpcId);
  }
}

/**
 * `useSkill` — resolves a servant skill's `effects` (research/09 §7's still-limited scope;
 * see `SkillEffect`'s doc comment) and sets that skill slot's cooldown. Unlike
 * `playCard`/`castNp`, the acting servant need not be front-line — skills (e.g. pre-buffing
 * before an Order Change swap-in) are usable from the bench, per research/07 §4 confirming
 * only buff/cooldown *ticking* freezes while benched, not skill availability itself — so
 * `findServantAny`, not `findServant`, looks up `action.servantId`.
 *
 * Throws if the targeted skill slot is still on cooldown, rather than silently allowing a
 * skill to be used twice before it's ready.
 */
function resolveUseSkill(state: BattleState, action: Extract<Action, { type: "useSkill" }>, constants: BattleConstants, randomFn: () => number): BattleState {
  const actingServant = findServantAny(state, action.servantId);
  const cooldownIndex = action.skillSlot - 1;
  // `skillSlot` is a `1 | 2 | 3` literal, so `cooldownIndex` is always in-bounds for the 3-tuple — `noUncheckedIndexedAccess` can't see that through a variable index.
  const remainingCooldown = actingServant.skillCooldowns[cooldownIndex] as number;
  if (remainingCooldown > 0) {
    throw new RangeError(`Servant ${action.servantId}'s skill slot ${action.skillSlot} is still on cooldown (${remainingCooldown} turns remaining)`);
  }

  let nextState = state;
  for (const effect of action.effects) {
    nextState = applySkillEffect(nextState, actingServant.servantId, effect, action.targetServantId, action.targetNpcId, constants, randomFn);
  }
  const servants = nextState.servants.map((s): ServantInstance => {
    if (s.servantId !== actingServant.servantId) {
      return s;
    }
    const skillCooldowns = [...s.skillCooldowns] as [number, number, number];
    skillCooldowns[cooldownIndex] = action.cooldownTurns;
    return { ...s, skillCooldowns };
  });

  return { ...nextState, servants };
}

/**
 * `useMysticCodeSkill` — the account-wide equivalent of `resolveUseSkill`, spending one of
 * `BattleState.mysticCodeSkillCooldowns`'s 3 slots instead of a servant's own. The Mystic
 * Code itself has no `servantId` to act as a `"self"`-targeted effect's target, so that
 * targeting throws here (via `applySkillEffect`'s shared checks) rather than silently doing
 * nothing.
 */
function resolveUseMysticCodeSkill(
  state: BattleState,
  action: Extract<Action, { type: "useMysticCodeSkill" }>,
  constants: BattleConstants,
  randomFn: () => number,
): BattleState {
  const cooldownIndex = action.slot - 1;
  // `slot` is a `1 | 2 | 3` literal, so `cooldownIndex` is always in-bounds for the 3-tuple — `noUncheckedIndexedAccess` can't see that through a variable index.
  const remainingCooldown = state.mysticCodeSkillCooldowns[cooldownIndex] as number;
  if (remainingCooldown > 0) {
    throw new RangeError(`Mystic Code skill slot ${action.slot} is still on cooldown (${remainingCooldown} turns remaining)`);
  }

  let nextState = state;
  for (const effect of action.effects) {
    nextState = applySkillEffect(nextState, undefined, effect, action.targetServantId, action.targetNpcId, constants, randomFn);
  }

  const mysticCodeSkillCooldowns = [...state.mysticCodeSkillCooldowns] as [number, number, number];
  mysticCodeSkillCooldowns[cooldownIndex] = action.cooldownTurns;

  return { ...nextState, mysticCodeSkillCooldowns };
}

/**
 * `orderChange` — swaps a front-line servant out for a benched one, per research/07 §3-4
 * (`funcType: replaceMember`, confirmed by the project owner's direct gameplay knowledge).
 * `outgoingServantId` must currently be front-line and `incomingServantId` currently
 * benched — throws otherwise, rather than silently no-op'ing an already-correct swap or
 * accepting a swap that isn't actually to/from the field.
 *
 * Flips `isFrontLine` on both servants and re-attributes every `state.handCards` slot
 * currently owned by `outgoingServantId` to `incomingServantId` — the card *type* in that
 * slot is untouched, only which servant it resolves against (research/07 §4: "the card
 * type shown in that slot for the rest of the turn is identical to what it was before the
 * swap, only *which servant* that slot's card belongs to changes"). The card bag itself is
 * never touched — Order Change is decoupled from the bag-depletion mechanic (research/03
 * §6.5/research/07 §4).
 *
 * HP, NP gauge, buffs, and skill cooldowns need no adjustment here beyond the `isFrontLine`
 * flip itself: they already live on the `ServantInstance`, not the hand slot, and
 * `advanceServantForEndTurn`'s existing "skip if `!isFrontLine`" freeze (research/07 §4)
 * automatically starts/stops applying to each servant the instant this flip takes effect.
 */
function resolveOrderChange(state: BattleState, action: Extract<Action, { type: "orderChange" }>): BattleState {
  const outgoing = findServantAny(state, action.outgoingServantId);
  const incoming = findServantAny(state, action.incomingServantId);
  if (!outgoing.isFrontLine) {
    throw new RangeError(`Servant ${action.outgoingServantId} is not front-line and cannot be swapped out`);
  }
  if (incoming.isFrontLine) {
    throw new RangeError(`Servant ${action.incomingServantId} is already front-line and cannot be swapped in`);
  }

  const servants = state.servants.map((s): ServantInstance => {
    if (s.servantId === outgoing.servantId) {
      return { ...s, isFrontLine: false };
    }
    if (s.servantId === incoming.servantId) {
      return { ...s, isFrontLine: true };
    }
    return s;
  });
  const handCards = state.handCards.map((hc) => (hc.servantId === outgoing.servantId ? { ...hc, servantId: incoming.servantId } : hc));

  return { ...state, servants, handCards };
}

/**
 * Applies one `Action` to `state`, producing the next `BattleState` — research/09 §1's
 * pure function `(BattleState, Action) → BattleState'`.
 *
 * `endTurn`, `playCard`, `castNp`, `playExtraCard`, `useCommandSeal`, `useSkill`, `useMysticCodeSkill`, and
 * `orderChange` are all implemented. `useSkill`/`useMysticCodeSkill` are narrower than a
 * full skill/NP function-array interpreter (research/09 §7): they only apply the 4 modeled
 * `SkillEffect` variants (`./skillEffect.js`) the caller supplies as already-resolved —
 * `addState`/`addStateShort` (buff grant), `subState` (dispel), `gainNp`, `gainHp` — a skill
 * whose functions do anything else (damage, card manipulation, NP-turn shortening, etc.)
 * can't be represented yet.
 *
 * `playCard`/`castNp` are also narrower than research/09 §2's full pipeline in one
 * remaining way: Overcharge-stage derivation stays caller-supplied (`context.
 * npDamageMultiplier`), as do the server-mod/random-roll fields. `isCrit`/`isBusterChain`/
 * `extraCardChainType`, however, are now derived automatically via the crit-star weighted
 * lottery (`./critStarLottery.js`) and chain classification (`./chainDetection.js`) —
 * research/09 §7's "next increment" this pass built.
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
      return resolvePlayCard(state, action, constants, randomFn);
    case "castNp":
      return resolveCastNp(state, action, constants, randomFn);
    case "playExtraCard":
      return resolvePlayExtraCard(state, action, constants, randomFn);
    case "useCommandSeal":
      return resolveUseCommandSeal(state, action);
    case "useSkill":
      return resolveUseSkill(state, action, constants, randomFn);
    case "useMysticCodeSkill":
      return resolveUseMysticCodeSkill(state, action, constants, randomFn);
    case "orderChange":
      return resolveOrderChange(state, action);
    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
