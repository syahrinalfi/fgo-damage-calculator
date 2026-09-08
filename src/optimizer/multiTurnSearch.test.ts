import type { Buff, Card, CardDetail } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { Action, DerivedHitContext } from "../battle/action.js";
import type { BattleState, EnemyInstance, HandCard, ServantInstance } from "../battle/battleState.js";
import { BUFF_ACTION_KEYS } from "../battle/buffActionKeys.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { damageDealtAtSlot } from "./objectives.js";
import { searchMultiTurnActionSequences, type PerTurnCandidateBuilder } from "./multiTurnSearch.js";
import type { ActionSequenceCandidate } from "./turnSearch.js";

const BUSTER = "2" as Card;
const ARTS = "1" as Card;
const QUICK = "3" as Card;
const FIVE_CARD_DECK: readonly Card[] = [BUSTER, BUSTER, ARTS, ARTS, QUICK];

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

function servant(servantId: number, overrides: Partial<ServantInstance> = {}): ServantInstance {
  return {
    servantId,
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

// A 3-front-line-servant state is required: `resolveEndTurn` (fired by every turn this
// module simulates) rebuilds the combined 15-card deck via `buildCombinedCardDeck`, which
// throws unless exactly `FRONT_LINE_SERVANT_COUNT` front-line servants are present.
function state(overrides: Partial<BattleState> = {}): BattleState {
  const servants = [servant(1), servant(2), servant(3)];
  return {
    waves: [],
    currentWaveIndex: 0,
    currentTurn: 1,
    servants,
    enemies: [enemy()],
    handCards: servants.flatMap((s) => s.cardTypes.map((card): HandCard => ({ card, servantId: s.servantId }))).slice(0, 5),
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

function playAction(handCardIndex: number, servantId: number, cardType: Card): Action {
  return {
    type: "playCard",
    servantId,
    handCardIndex,
    targetNpcId: 9001,
    context: { ...BUSTER_CONTEXT, card: { type: cardType, position: 1 } },
    chainCards: [
      { type: BUSTER, servantId },
      { type: BUSTER, servantId },
      { type: ARTS, servantId },
    ],
    chainPosition: 1,
  };
}

function oneBusterCandidate(label: string): ActionSequenceCandidate {
  return { label, actions: [playAction(0, 1, BUSTER)] };
}

function passCandidate(): ActionSequenceCandidate {
  return { label: "pass", actions: [] };
}

describe("searchMultiTurnActionSequences", () => {
  it("simulates every turn's endTurn between candidates, advancing currentTurn across the horizon", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => [passCandidate()];
    const results = searchMultiTurnActionSequences(state(), 2, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0));
    expect(results).toHaveLength(1);
    expect(results[0]?.finalState.currentTurn).toBe(3);
  });

  it("scores only the final state, crediting a setup-then-burst line even when turn 1 deals no damage", () => {
    const buildCandidates: PerTurnCandidateBuilder = (_state, turnIndex) => (turnIndex === 0 ? [passCandidate()] : [oneBusterCandidate("burst")]);
    const results = searchMultiTurnActionSequences(state(), 2, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0));
    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBeGreaterThan(0);
    expect(results[0]?.turnActions).toEqual([[], [playAction(0, 1, BUSTER)]]);
  });

  it("cross-multiplies every turn's candidates (2 turns x 2 candidates = 4 full lines)", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => [passCandidate(), oneBusterCandidate("buster")];
    const results = searchMultiTurnActionSequences(state(), 2, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0));
    expect(results).toHaveLength(4);
  });

  it("ranks descending by final score — the line that bursts on the last turn scores highest", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => [passCandidate(), oneBusterCandidate("buster")];
    const results = searchMultiTurnActionSequences(state(), 2, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0));
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]?.score).toBeGreaterThanOrEqual(results[i]?.score ?? -Infinity);
    }
    expect(results[0]?.label).toBe("buster>>buster");
  });

  it("prunes a branch entirely when a turn has no candidates at all", () => {
    const buildCandidates: PerTurnCandidateBuilder = (_state, turnIndex) => (turnIndex === 1 ? [] : [passCandidate()]);
    expect(searchMultiTurnActionSequences(state(), 2, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0))).toEqual([]);
  });

  it("returns a single result with an empty turnActions array for a 0-turn horizon", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => {
      throw new Error("should not be called for a 0-turn horizon");
    };
    const results = searchMultiTurnActionSequences(state(), 0, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0));
    expect(results).toHaveLength(1);
    expect(results[0]?.turnActions).toEqual([]);
    expect(results[0]?.finalState.currentTurn).toBe(1);
  });

  it("throws rather than recursing forever for a negative turnCount", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => [passCandidate()];
    expect(() => searchMultiTurnActionSequences(state(), -1, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0))).toThrow(RangeError);
  });
});
