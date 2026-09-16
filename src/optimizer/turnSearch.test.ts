import type { Buff, Card, CardDetail } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { Action, DerivedHitContext } from "../battle/action.js";
import type { BattleState, EnemyInstance, HandCard, ServantInstance } from "../battle/battleState.js";
import { BUFF_ACTION_KEYS } from "../battle/buffActionKeys.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { damageDealtAtSlot, negativeRemainingHpAtSlot } from "./objectives.js";
import { searchBestActionSequence, simulateActionSequence } from "./turnSearch.js";

const BUSTER = "2" as Card;
const ARTS = "1" as Card;
const QUICK = "3" as Card;
const FIVE_CARD_DECK: readonly Card[] = [BUSTER, BUSTER, ARTS, ARTS, QUICK];

function handCardsFor(cards: readonly Card[], servantId = 1): readonly HandCard[] {
  return cards.map((card): HandCard => ({ card, servantId }));
}

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

const CARD_CONSTANTS = {
  "1": { 1: { individuality: [], adjustAtk: 300, adjustTdGauge: 3000, adjustCritical: 1000, addAtk: 0, addTdGauge: 0, addCritical: 0 } },
  "2": { 1: { individuality: [], adjustAtk: 1200, adjustTdGauge: 1000, adjustCritical: 1400, addAtk: 300, addTdGauge: 0, addCritical: 50 } },
  "3": { 1: { individuality: [], adjustAtk: 800, adjustTdGauge: 1000, adjustCritical: 1000, addAtk: 0, addTdGauge: 0, addCritical: 0 } },
} as unknown as CardDetail.CardConstantMap;

const CONSTANTS: BattleConstants = {
  buff: BUFF_CONSTANTS,
  card: CARD_CONSTANTS,
  classAttack: { saber: 1000 } as BattleConstants["classAttack"],
  classAffinity: { saber: { lancer: 1000 } } as BattleConstants["classAffinity"],
  attribute: { human: { earth: 1000 } } as BattleConstants["attribute"],
};

function servant(overrides: Partial<ServantInstance> = {}): ServantInstance {
  return {
    servantId: 1,
    isFrontLine: true,
    cardTypes: FIVE_CARD_DECK,
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
    ...overrides,
  };
}

function enemy(overrides: Partial<EnemyInstance> = {}): EnemyInstance {
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
    ...overrides,
  };
}

function state(overrides: Partial<BattleState> = {}): BattleState {
  return {
    waves: [],
    currentWaveIndex: 0,
    currentTurn: 1,
    servants: [servant()],
    enemies: [enemy()],
    handCards: handCardsFor(FIVE_CARD_DECK),
    cardBag: [],
    starsCarried: 0,
    handCardStars: [0, 0, 0, 0, 0],
    critChanceBonusCarried: 0,
    activeCritChanceBonus: 0,
    fieldTraits: new Set(),
    costSpent: 0,
    costBudget: 100,
    commandSealsRemaining: 3,
    consecutiveNpChainCount: 0,
    mysticCodeSkillCooldowns: [0, 0, 0],
    ...overrides,
  };
}

const BUSTER_CONTEXT: DerivedHitContext = {
  card: { type: BUSTER, position: 1 },
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

function playAction(handCardIndex: number, cardType: Card): Action {
  return {
    type: "playCard",
    servantId: 1,
    handCardIndex,
    targetNpcId: 9001,
    context: { ...BUSTER_CONTEXT, card: { type: cardType, position: 1 } },
    chainCards: [
      { type: BUSTER, servantId: 1 },
      { type: BUSTER, servantId: 1 },
      { type: ARTS, servantId: 1 },
    ],
    chainPosition: 1,
  };
}

describe("simulateActionSequence", () => {
  it("folds a candidate's actions through resolveAction in strict order", () => {
    const result = simulateActionSequence(state(), [playAction(0, BUSTER)], CONSTANTS, () => 1);
    expect(result.enemies[0]?.currentHp).toBeLessThan(50000);
    expect(result.handCards).toHaveLength(4);
  });
});

describe("searchBestActionSequence", () => {
  it("ranks candidates descending by score, picking the higher-damage line first", () => {
    const results = searchBestActionSequence(
      state(),
      [
        { label: "one buster", actions: [playAction(0, BUSTER)] },
        { label: "two busters", actions: [playAction(0, BUSTER), playAction(0, BUSTER)] },
      ],
      CONSTANTS,
      () => 1,
      damageDealtAtSlot(0),
    );
    expect(results[0]?.label).toBe("two busters");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? Infinity);
  });

  it("returns an empty array for an empty candidate list", () => {
    expect(searchBestActionSequence(state(), [], CONSTANTS, () => 1, negativeRemainingHpAtSlot(0))).toEqual([]);
  });

  it("prunes a candidate whose action is unavailable without hiding other valid candidates", () => {
    const unavailableNp: Action = {
      type: "castNp",
      servantId: 1,
      targetNpcId: 9001,
      context: { ...BUSTER_CONTEXT, isNP: true, npDamageMultiplier: 4.5 },
      chainCards: [{ type: BUSTER, servantId: 1, isNp: true }, { type: BUSTER, servantId: 1 }, { type: ARTS, servantId: 1 }],
      chainPosition: 1,
    };
    const results = searchBestActionSequence(
      state({ servants: [servant({ currentNpGauge: 0 })] }),
      [
        { label: "unavailable NP", actions: [unavailableNp] },
        { label: "available face card", actions: [playAction(0, BUSTER)] },
      ],
      CONSTANTS,
      () => 1,
      damageDealtAtSlot(0),
    );
    expect(results.map((result) => result.label)).toEqual(["available face card"]);
  });
});

describe("objectives", () => {
  it("damageDealtAtSlot credits the broken bar's full starting HP across a shift (npcId change at the same slot)", () => {
    const before = state();
    const after = state({ enemies: [enemy({ npcId: 9002, currentHp: 40000, maxHp: 40000 })] });
    expect(damageDealtAtSlot(0)(after, before)).toBe(50000);
  });

  it("damageDealtAtSlot credits the slot's full HP when the enemy is gone entirely (cleared, no shift target)", () => {
    const before = state();
    const after = state({ enemies: [] });
    expect(damageDealtAtSlot(0)(after, before)).toBe(50000);
  });

  it("negativeRemainingHpAtSlot scores a fully-cleared slot at 0 (the maximum)", () => {
    expect(negativeRemainingHpAtSlot(0)(state({ enemies: [] }), state())).toBe(0);
  });
});
