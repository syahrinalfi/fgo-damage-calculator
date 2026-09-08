import type { Buff, Card, CardDetail, CraftEssence, Servant as ServantModule } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { DerivedHitContext } from "../battle/action.js";
import type { BattleState, HandCard } from "../battle/battleState.js";
import { BUFF_ACTION_KEYS } from "../battle/buffActionKeys.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import type { ServantBuild } from "../account/types.js";
import type { Wave, WaveEnemy } from "../quest/types.js";
import { optimizeQuest, type ServantCandidate } from "./questOptimizer.js";
import type { SkillActivation } from "./skillUsageCandidates.js";

function niceServant(overrides: Partial<ServantModule.Servant> = {}): ServantModule.Servant {
  return {
    atkGrowth: [0, 1000, 2000],
    hpGrowth: [0, 500, 1000],
    className: "saber" as ServantModule.Servant["className"],
    attribute: "human" as ServantModule.Servant["attribute"],
    traits: [{ id: 100 }],
    cards: ["2", "2", "1", "1", "3"],
    starAbsorb: 90,
    cost: 16,
    ...overrides,
  } as unknown as ServantModule.Servant;
}

function build(servantId: number): ServantBuild {
  return {
    servantId,
    level: 2,
    ascension: 1,
    skillLevels: [1, 1, 1],
    appendSkillLevels: {},
    npLevel: 1,
    fou: { atk: 0, hp: 0 },
    commandCodeIds: [],
  };
}

function candidate(servantId: number): ServantCandidate {
  return { niceServant: niceServant(), build: build(servantId) };
}

function waveEnemy(overrides: Partial<WaveEnemy> = {}): WaveEnemy {
  return {
    npcId: 9001,
    atk: 8000,
    hp: 50000,
    deathRate: 500,
    chargeTurn: 4,
    traits: [{ id: 200 }],
    svt: { className: "lancer", attribute: "earth" },
    enemyScript: {},
    ...overrides,
  } as unknown as WaveEnemy;
}

function wave(overrides: Partial<Wave> = {}): Wave {
  return { waveNumber: 1, initialEnemies: [waveEnemy()], enemyPool: [waveEnemy()], ...overrides };
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

const CARD_POSITIONS = { 1: { addAtk: 500, addTdGauge: 0, addCritical: 0 }, 2: { addAtk: 0, addTdGauge: 0, addCritical: 0 }, 3: { addAtk: 0, addTdGauge: 0, addCritical: 0 } };
function cardPositionEntries(base: { adjustAtk: number; adjustTdGauge: number; adjustCritical: number }) {
  return Object.fromEntries(Object.entries(CARD_POSITIONS).map(([position, bonus]) => [position, { individuality: [], ...base, ...bonus }]));
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

function resolveHitContext(handCard: HandCard): DerivedHitContext {
  return {
    card: { type: handCard.card, position: 1 },
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

describe("optimizeQuest", () => {
  it("returns exactly one result for a 3-servant shortlist with an empty CE pool (1 subset x 1 all-empty CE assignment)", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.party).toHaveLength(3);
    expect(results[0]?.best.score).toBeGreaterThan(0);
  });

  it("tries every 3-of-4 servant subset (C(4,3) = 4) and ranks them descending by score", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3), candidate(4)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    expect(results).toHaveLength(4);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]?.best.score).toBeGreaterThanOrEqual(results[i]?.best.score ?? -Infinity);
    }
  });

  it("skips a combination whose costSpent exceeds costBudget", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1, // each servant alone costs 16 -> costSpent 48 > 1
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    expect(results).toEqual([]);
  });

  it("skips a combination when there is no enemy to target (empty waves)", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    expect(results).toEqual([]);
  });

  it("assigns CEs into the party per enumerateCeAssignments (a real CE shows up equipped on some result)", () => {
    const ce: CraftEssence.CraftEssence = { atkGrowth: [0, 0, 300], hpGrowth: [0, 0, 150], cost: 12 } as unknown as CraftEssence.CraftEssence;
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [{ data: ce, level: 3 }],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    // enumerateCeAssignments(pool of 1, 3 slots) = 1 (all empty) + 3 (one slot gets the CE) = 4 combinations
    expect(results).toHaveLength(4);
    expect(results.some((r) => r.party.some((m) => m.equippedCe !== undefined))).toBe(true);
  });

  it("searches the skill-usage-plan axis and picks a beneficial ATK-up skill when resolveSkillOptions is supplied", () => {
    const withoutSkill = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });

    const resolveSkillOptions = (initialState: BattleState): readonly SkillActivation[] => {
      const actor = initialState.servants[0];
      if (actor === undefined) return [];
      const atkUp: SkillActivation = {
        type: "useSkill",
        servantId: actor.servantId,
        skillSlot: 1,
        effects: [{ kind: "grantBuff", buff: { type: "upAtk" as Buff.BuffType, amount: 500, ckSelfIndv: [], ckOpIndv: [], buffGroup: 0 }, rawTurn: 3, rawCount: -1, targetType: "self" }],
        cooldownTurns: 5,
      };
      return [atkUp];
    };

    const withSkill = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      resolveSkillOptions,
      randomFn: () => 0,
    });

    expect(withSkill).toHaveLength(1);
    expect(withSkill[0]?.best.score).toBeGreaterThan(withoutSkill[0]?.best.score ?? Infinity);
    expect(withSkill[0]?.best.actions[0]?.type).toBe("useSkill");
  });
});
