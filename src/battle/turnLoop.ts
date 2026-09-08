import { Card, type Buff } from "@atlasacademy/api-connector";
import type { NpLevel } from "../account/types.js";
import {
  CHAINBONUS_ARTS_RATE,
  CHAINBONUS_MIGHTY_CRIT_RATE,
  CHAINBONUS_QUICK_CRIT_RATE,
  CHAINBONUS_QUICK_STARS,
  FULL_TD_POINT,
} from "../engine/constants.js";
import { advanceTurnBuffs, consumeBuffUse, grantBuff, removeBuffsByTrait } from "./buffLifecycle.js";
import type { Action, CommandSealEffect } from "./action.js";
import { enemyToBattleUnit, servantToBattleUnit, type BattleState, type EnemyInstance, type ServantInstance } from "./battleState.js";
import { buildCombinedCardDeck } from "./cardDeck.js";
import { drawCardBagHand } from "./cardBag.js";
import { allocateCritStars, critChanceForStars, rollIsCrit } from "./critStarLottery.js";
import { classifyChain, extraCardChainTypeFrom, isArtsChainFrom, isBusterChainFrom, isMightyChainFrom, isQuickChainFrom, type ChainClassification } from "./chainDetection.js";
import type { BattleConstants } from "./gameConstants.js";
import { resolveHit, type HitResolutionContext } from "./hitResolution.js";
import type {
  BuffGrantEffect,
  GainHpEffect,
  GainHpPercentEffect,
  GainNpEffect,
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
 * `currentWaveIndex` and wave/death transitions are deliberately untouched by `endTurn` —
 * this increment doesn't resolve enemy death transitions (shift/call), so there's nothing
 * correct to compute here. Star *generation* from landed hits (i.e. what would feed the
 * *next* `endTurn`'s `starsCarried`) also isn't wired yet (research/09 §7) — this increment
 * only wires the *consumption* side, allocating whatever `starsCarried` already holds
 * across the freshly drawn hand.
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
  const enemies = state.enemies.map(advanceEnemyForEndTurn);

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
    currentTurn: state.currentTurn + 1,
    consecutiveNpChainCount: 0,
    mysticCodeSkillCooldowns: decrementCooldowns(state.mysticCodeSkillCooldowns),
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
 * Resolves one hit (`resolveHit`, `./hitResolution.js`) and folds the result back into
 * `state`: the defender's HP, the specific defense-tier/Guts buff instance consumed (if
 * any, `consumeBuffUse`), and the attacker's NP gauge gain (capped at that servant's own
 * `NP_GAUGE_CAP_BY_LEVEL` ceiling).
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
  const enemy = findEnemy(state, action.targetNpcId);
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
  if (chainCardAtPosition === undefined || chainCardAtPosition.type !== handCard.card || chainCardAtPosition.servantId !== handCard.servantId) {
    throw new RangeError("action.chainCards[action.chainPosition - 1] must match the card actually being played (matched by type + servantId)");
  }

  const classification = classifyChain(action.chainCards);
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
    isCrit,
    isBusterChain: isBusterChainFrom(classification),
    isMightyChain: isMightyChainFrom(classification),
    extraCardChainType: extraCardChainTypeFrom(classification),
    chainLeadCardType,
  };

  const hitState = applyHit(state, servant, enemy, constants, context);
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
  chainCards: readonly { readonly type: Card; readonly servantId: number }[],
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
 *
 * `isCrit`/`isBusterChain`/`isMightyChain`/`extraCardChainType` are hardcoded
 * `false`/`false`/`false`/`"none"`, and
 * `chainLeadCardType` is set to this NP's own `context.card.type` (a deliberate no-op — an
 * NP's own `NiceCard.json` entry is itself an all-zero stub, so this lookup always yields a
 * zero `firstCardBonus` regardless), rather than derived from the crit-star lottery/chain
 * classification the way `playCard`'s are — research/03 §1.4/§5: the NP card is an all-zero
 * stub in the per-position modifier table and isn't part of the 3-card chain at all, so none
 * of these mechanics apply to an NP.
 */
function resolveCastNp(state: BattleState, action: Extract<Action, { type: "castNp" }>, constants: BattleConstants): BattleState {
  const servant = findServant(state, action.servantId);
  const enemy = findEnemy(state, action.targetNpcId);
  if (!action.context.isNP) {
    throw new RangeError("castNp's context.isNP must be true");
  }

  const context: HitResolutionContext = {
    ...action.context,
    isCrit: false,
    isBusterChain: false,
    isMightyChain: false,
    extraCardChainType: "none",
    chainLeadCardType: action.context.card.type,
  };
  const nextState = applyHit(state, servant, enemy, constants, context);
  const servants = nextState.servants.map((s) => (s.servantId === servant.servantId ? { ...s, currentNpGauge: 0 } : s));

  return { ...nextState, servants, consecutiveNpChainCount: nextState.consecutiveNpChainCount + 1 };
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

/** Applies one `LossHpSafeEffect` (`./skillEffect.js`) to every servant `resolveAllyTargets` resolves it to — subtracts `rawPercent / 1000` of that servant's own `maxHp`, rounded, floored at `1` (never lethal, matching the `FuncType`'s "safe" naming). */
function applyLossHpSafeEffect(
  servants: readonly ServantInstance[],
  actingServantId: number | undefined,
  effect: LossHpSafeEffect,
  targetServantId: number | undefined,
): readonly ServantInstance[] {
  const targetIds = new Set(resolveAllyTargets(servants, effect.targetType, actingServantId, targetServantId));
  return servants.map((s) =>
    targetIds.has(s.servantId) ? { ...s, currentHp: Math.max(s.currentHp - Math.round((s.maxHp * effect.rawPercent) / 1000), 1) } : s,
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

/** Dispatches one `SkillEffect` (`./skillEffect.js`) to the matching `apply*Effect` function, folding the result back into `state`. */
function applySkillEffect(
  state: BattleState,
  actingServantId: number | undefined,
  effect: SkillEffect,
  targetServantId: number | undefined,
  targetNpcId: number | undefined,
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
function resolveUseSkill(state: BattleState, action: Extract<Action, { type: "useSkill" }>): BattleState {
  const actingServant = findServantAny(state, action.servantId);
  const cooldownIndex = action.skillSlot - 1;
  // `skillSlot` is a `1 | 2 | 3` literal, so `cooldownIndex` is always in-bounds for the 3-tuple — `noUncheckedIndexedAccess` can't see that through a variable index.
  const remainingCooldown = actingServant.skillCooldowns[cooldownIndex] as number;
  if (remainingCooldown > 0) {
    throw new RangeError(`Servant ${action.servantId}'s skill slot ${action.skillSlot} is still on cooldown (${remainingCooldown} turns remaining)`);
  }

  let nextState = state;
  for (const effect of action.effects) {
    nextState = applySkillEffect(nextState, actingServant.servantId, effect, action.targetServantId, action.targetNpcId);
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
function resolveUseMysticCodeSkill(state: BattleState, action: Extract<Action, { type: "useMysticCodeSkill" }>): BattleState {
  const cooldownIndex = action.slot - 1;
  // `slot` is a `1 | 2 | 3` literal, so `cooldownIndex` is always in-bounds for the 3-tuple — `noUncheckedIndexedAccess` can't see that through a variable index.
  const remainingCooldown = state.mysticCodeSkillCooldowns[cooldownIndex] as number;
  if (remainingCooldown > 0) {
    throw new RangeError(`Mystic Code skill slot ${action.slot} is still on cooldown (${remainingCooldown} turns remaining)`);
  }

  let nextState = state;
  for (const effect of action.effects) {
    nextState = applySkillEffect(nextState, undefined, effect, action.targetServantId, action.targetNpcId);
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
 * `endTurn`, `playCard`, `castNp`, `useCommandSeal`, `useSkill`, `useMysticCodeSkill`, and
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
      return resolveCastNp(state, action, constants);
    case "useCommandSeal":
      return resolveUseCommandSeal(state, action);
    case "useSkill":
      return resolveUseSkill(state, action);
    case "useMysticCodeSkill":
      return resolveUseMysticCodeSkill(state, action);
    case "orderChange":
      return resolveOrderChange(state, action);
    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
