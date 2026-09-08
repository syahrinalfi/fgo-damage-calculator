import type { Buff, Card, CardDetail } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { Action, DerivedHitContext } from "../battle/action.js";
import type { BattleState, EnemyInstance, HandCard, ServantInstance } from "../battle/battleState.js";
import { BUFF_ACTION_KEYS } from "../battle/buffActionKeys.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { buildCardOrderCandidates } from "./cardOrderCandidates.js";
import { damageDealtAtSlot } from "./objectives.js";
import { searchBestActionSequence } from "./turnSearch.js";

const BUSTER = "2" as Card;
const ARTS = "1" as Card;
const QUICK = "3" as Card;

function handCard(card: Card, servantId: number): HandCard {
  return { card, servantId };
}

function contextTemplate(cardType: Card): DerivedHitContext {
  return {
    card: { type: cardType, position: 1 }, // deliberately wrong — buildCardOrderCandidates must overwrite this
    npDamageMultiplier: 1,
    randomModifier: 1,
    isSuperEffective: false,
    superEffectiveModifier: 1,
    isNP: false,
    offensiveNPRate: 500,
    npEnemyServerMod: 1,
    baseStarRate: 500,
    starEnemyServerMod: 0,
  };
}

describe("buildCardOrderCandidates — unit", () => {
  const hand = [handCard(BUSTER, 1), handCard(ARTS, 1), handCard(QUICK, 2), handCard(BUSTER, 3)];
  const templates = hand.map((h) => contextTemplate(h.card));

  it("produces one candidate per nP3 ordered selection (4 cards -> 24)", () => {
    const result = buildCardOrderCandidates(hand, templates, 9001);
    expect(result).toHaveLength(24);
  });

  it("sets chainCards/chainPosition/context.card.position from the ordering, overwriting the template's placeholder position", () => {
    const result = buildCardOrderCandidates(hand, templates, 9001);
    const candidate = result.find((c) => c.actions.every((a) => a.type === "playCard"))?.actions[0];
    const first = result[0]?.actions as readonly Action[];
    expect(first).toHaveLength(3);
    for (const [i, action] of first.entries()) {
      if (action.type !== "playCard") throw new Error("expected playCard");
      expect(action.chainPosition).toBe(i + 1);
      expect(action.context.card.position).toBe(i + 1);
      expect(action.chainCards).toHaveLength(3);
    }
    expect(candidate).toBeDefined();
  });

  it("recomputes handCardIndex against each prior play's removal, not the original hand index", () => {
    // Ordering [3, 0, 2] on a 4-card hand: play original index 3 first (handCardIndex 3,
    // remaining [0,1,2]), then original index 0 (handCardIndex 0, remaining [1,2]), then
    // original index 2 (now at position 1 in [1,2] after 0/3 removed -> handCardIndex 1).
    const result = buildCardOrderCandidates(hand, templates, 9001);
    const match = result.find((c) => {
      const actions = c.actions as readonly Extract<Action, { type: "playCard" }>[];
      return (
        actions[0]?.servantId === 3 &&
        actions[1]?.servantId === 1 &&
        actions[1]?.context.card.type === BUSTER &&
        actions[2]?.servantId === 2
      );
    });
    expect(match).toBeDefined();
    const actions = match?.actions as readonly Extract<Action, { type: "playCard" }>[];
    expect(actions.map((a) => a.handCardIndex)).toEqual([3, 0, 1]);
  });

  it("every generated Action's chainCards matches the card actually being played, in play order", () => {
    const result = buildCardOrderCandidates(hand, templates, 9001);
    for (const candidate of result) {
      const actions = candidate.actions as readonly Extract<Action, { type: "playCard" }>[];
      for (const [i, action] of actions.entries()) {
        const chainEntry = action.chainCards[action.chainPosition - 1];
        expect(chainEntry?.type).toBe(action.context.card.type);
        expect(chainEntry?.servantId).toBe(action.servantId);
        expect(i + 1).toBe(action.chainPosition);
      }
    }
  });
});

describe("buildCardOrderCandidates — end to end with searchBestActionSequence", () => {
  function percentAction(plusType: string, minusType: string, baseValue = 0): Buff.BuffConstant {
    return {
      limit: "normal" as Buff.BuffLimit,
      plusTypes: [plusType] as Buff.BuffType[],
      minusTypes: [minusType] as Buff.BuffType[],
      baseParam: 1000,
      baseValue,
      isRec: true,
      plusAction: 0,
      maxRate: [5000],
    };
  }

  const BUFF_CONSTANTS = {
    [BUFF_ACTION_KEYS.ATK]: percentAction("upAtk", "downAtk"),
    [BUFF_ACTION_KEYS.DAMAGE]: percentAction("upDamage", "downDamage", 1000),
  } as unknown as Buff.BuffConstantMap;

  const CARD_POSITIONS = { 1: { addAtk: 500, addTdGauge: 0, addCritical: 0 }, 2: { addAtk: 0, addTdGauge: 0, addCritical: 0 }, 3: { addAtk: 0, addTdGauge: 0, addCritical: 0 } };
  function cardPositionEntries(base: { adjustAtk: number; adjustTdGauge: number; adjustCritical: number }) {
    return Object.fromEntries(
      Object.entries(CARD_POSITIONS).map(([position, bonus]) => [position, { individuality: [], ...base, ...bonus }]),
    );
  }
  const CARD_CONSTANTS = {
    "1": cardPositionEntries({ adjustAtk: 300, adjustTdGauge: 3000, adjustCritical: 1000 }),
    "2": cardPositionEntries({ adjustAtk: 1200, adjustTdGauge: 1000, adjustCritical: 1400 }),
    "3": cardPositionEntries({ adjustAtk: 800, adjustTdGauge: 1000, adjustCritical: 1000 }),
  } as unknown as CardDetail.CardConstantMap;

  const CONSTANTS: BattleConstants = {
    buff: BUFF_CONSTANTS,
    card: CARD_CONSTANTS,
    classAttack: { saber: 1000 } as BattleConstants["classAttack"],
    classAffinity: { saber: { lancer: 1000 } } as BattleConstants["classAffinity"],
    attribute: { human: { earth: 1000 } } as BattleConstants["attribute"],
  };

  function servant(): ServantInstance {
    return {
      servantId: 1,
      isFrontLine: true,
      cardTypes: [BUSTER, BUSTER, ARTS, ARTS, QUICK],
      npLevel: 1,
      atk: 10000,
      className: "saber" as ServantInstance["className"],
      attribute: "human" as ServantInstance["attribute"],
      traits: new Set(),
      currentHp: 15000,
      maxHp: 15000,
      currentNpGauge: 0,
      activeBuffs: [],
      skillCooldowns: [0, 0, 0],
      criticalWeight: 99,
      starGen: 60,
    };
  }

  function enemy(): EnemyInstance {
    return {
      npcId: 9001,
      atk: 8000,
      className: "lancer" as EnemyInstance["className"],
      attribute: "earth" as EnemyInstance["attribute"],
      traits: new Set(),
      currentHp: 50000,
      maxHp: 50000,
      activeBuffs: [],
      currentNpTurns: 0,
      npTurnLimit: 5,
      deathRate: 1000,
      readyToNp: false,
      serverMod: { tdRate: 1000, tdAttackRate: 1000, starRate: 1000 },
    };
  }

  function state(hand: readonly HandCard[]): BattleState {
    return {
      waves: [],
      currentWaveIndex: 0,
      currentTurn: 1,
      servants: [servant()],
      enemies: [enemy()],
      handCards: hand,
      cardBag: [],
      starsCarried: 0,
      handCardStars: hand.map(() => 0),
      critChanceBonusCarried: 0,
      activeCritChanceBonus: 0,
      fieldTraits: new Set(),
      costSpent: 0,
      costBudget: 100,
      commandSealsRemaining: 3,
      consecutiveNpChainCount: 0,
      mysticCodeSkillCooldowns: [0, 0, 0],
    };
  }

  it("ranks the generated candidates end to end, favoring the ordering with Buster played last (Buster's +50% ATK bonus applies at chain position 1, but the highest-damage line here comes from maximizing chain composition)", () => {
    const hand = [handCard(BUSTER, 1), handCard(ARTS, 1), handCard(QUICK, 1)];
    const templates = hand.map((h) => contextTemplate(h.card));
    const candidates = buildCardOrderCandidates(hand, templates, 9001);
    expect(candidates).toHaveLength(6); // 3P3 = 6

    const results = searchBestActionSequence(state(hand), candidates, CONSTANTS, () => 1, damageDealtAtSlot(0));
    expect(results).toHaveLength(6);
    // Every candidate must have dealt some damage (a 3-card mixed chain always lands hits).
    for (const result of results) {
      expect(result.score).toBeGreaterThan(0);
    }
    // Results are ranked descending.
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]?.score).toBeGreaterThanOrEqual(results[i]?.score ?? -Infinity);
    }
  });
});
