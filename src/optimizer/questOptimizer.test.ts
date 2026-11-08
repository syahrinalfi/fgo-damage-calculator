import { Func, type Buff, type Card, type CardDetail, type CraftEssence, type NoblePhantasm, type Servant as ServantModule, type Skill } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { DerivedHitContext } from "../battle/action.js";
import type { BattleState, EquippedCraftEssence, HandCard } from "../battle/battleState.js";
import { BUFF_ACTION_KEYS } from "../battle/buffActionKeys.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import type { ServantSkillSource } from "../battle/skillActivationResolver.js";
import { isQuestCleared } from "../battle/turnLoop.js";
import type { ServantBuild } from "../account/types.js";
import type { Wave, WaveEnemy } from "../quest/types.js";
import { optimizeQuest, optimizeQuestMinimumTurns, type ServantCandidate } from "./questOptimizer.js";
import { estimateQuestCandidateReliability } from "./reliability.js";
import type { NpAttackOption } from "./cardOrderCandidates.js";
import type { SkillActivation } from "./skillUsageCandidates.js";
import { npStrengtheningKey } from "./npVersionSelection.js";
import { supportBattleId } from "./battleStateBuilder.js";
import { selectDiverseQuestCandidates } from "./resultRanking.js";
import { buildUpgradeScenarios, findClearUpgradeRecommendations } from "./upgradeAdvisor.js";

function niceServant(overrides: Partial<ServantModule.Servant> = {}): ServantModule.Servant {
  return {
    atkGrowth: [0, 1000, 2000],
    hpGrowth: [0, 500, 1000],
    className: "saber" as ServantModule.Servant["className"],
    attribute: "human" as ServantModule.Servant["attribute"],
    traits: [{ id: 100 }],
    cards: ["2", "2", "1", "1", "3"],
    starAbsorb: 90,
    starGen: 60,
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
    serverMod: { tdRate: 1000, tdAttackRate: 1000, starRate: 1000 },
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
  "4": cardPositionEntries({ adjustAtk: 1000, adjustTdGauge: 1000, adjustCritical: 1000 }),
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

function damagingNp(id: number, multipliers: readonly number[]): NoblePhantasm.NoblePhantasm {
  const values = multipliers.map((Value) => ({ Value }));
  const damage = {
    funcId: id + 1,
    funcType: Func.FuncType.DAMAGE_NP,
    funcTargetType: Func.FuncTargetType.ENEMY,
    funcTargetTeam: Func.FuncTargetTeam.ENEMY,
    functvals: [],
    funcquestTvals: [],
    overWriteTvalsList: [],
    funcPopupText: "",
    buffs: [],
    svals: values,
    svals2: values,
    svals3: values,
  } as unknown as Func.Func;
  return {
    id,
    num: 1,
    npNum: 1,
    priority: 101,
    condQuestId: 0,
    condQuestPhase: 0,
    strengthStatus: 1,
    card: "2",
    name: "Upgrade Test NP",
    effectFlags: ["attackEnemyOne"],
    npGain: { buster: [50, 50, 50, 50, 50], arts: [50, 50, 50, 50, 50], quick: [50, 50, 50, 50, 50], extra: [50, 50, 50, 50, 50], defence: [50, 50, 50, 50, 50], np: [80, 80, 80, 80, 80] },
    npDistribution: [100],
    functions: [damage],
  } as unknown as NoblePhantasm.NoblePhantasm;
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

  it("targets the rightmost enemy slot by default", () => {
    const left = waveEnemy({ npcId: 9001 });
    const middle = waveEnemy({ npcId: 9002 });
    const right = waveEnemy({ npcId: 9003 });
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave({ initialEnemies: [left, middle, right], enemyPool: [left, middle, right] })],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    const firstAttack = results[0]?.best.actions.find((action) => action.type === "playCard" || action.type === "castNp");
    expect(firstAttack?.targetNpcId).toBe(9003);
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

  it("finds a legal charge-skill into NP line while pruning the same NP without enough gauge", () => {
    const resolveSkillOptions = (initialState: BattleState): readonly SkillActivation[] => {
      const actor = initialState.servants[0];
      if (actor === undefined) return [];
      return [
        {
          type: "useSkill",
          servantId: actor.servantId,
          skillSlot: 1,
          effects: [{ kind: "gainNp", rawAmount: 10000, targetType: "self" }],
          cooldownTurns: 5,
        },
      ];
    };
    const resolveNpOptions = (state: BattleState): readonly NpAttackOption[] => {
      const actor = state.servants[0];
      if (actor === undefined) return [];
      return [
        {
          servantId: actor.servantId,
          cardType: "2" as Card,
          context: { ...resolveHitContext({ card: "2" as Card, servantId: actor.servantId }), isNP: true, npDamageMultiplier: 100 },
          targetNpcIds: [9001],
          label: `NP:${actor.servantId}`,
        },
      ];
    };

    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      resolveSkillOptions,
      resolveNpOptions,
      randomFn: () => 0,
    });

    expect(results[0]?.best.actions[0]?.type).toBe("useSkill");
    expect(results[0]?.best.actions.some((action) => action.type === "castNp")).toBe(true);
  });

  it("auto-resolves a selected raw NiceNp through npByServantId", () => {
    const damageFunc = {
      funcId: 1,
      funcType: Func.FuncType.DAMAGE_NP,
      funcTargetType: Func.FuncTargetType.ENEMY,
      funcTargetTeam: Func.FuncTargetTeam.ENEMY,
      functvals: [],
      funcquestTvals: [],
      overWriteTvalsList: [],
      funcPopupText: "",
      buffs: [],
      svals: [{ Value: 100000 }],
      svals2: [{ Value: 100000 }],
      svals3: [{ Value: 100000 }],
    } as unknown as Func.Func;
    const selectedNp = {
      id: 1001,
      num: 1,
      card: "2",
      name: "Selected NP",
      effectFlags: ["attackEnemyOne"],
      npGain: { buster: [50], arts: [50], quick: [50], extra: [50], defence: [50], np: [80] },
      npDistribution: [100],
      functions: [damageFunc],
    } as unknown as NoblePhantasm.NoblePhantasm;
    const resolveSkillOptions = (initialState: BattleState): readonly SkillActivation[] => {
      const actor = initialState.servants[0];
      return actor === undefined
        ? []
        : [{ type: "useSkill", servantId: actor.servantId, skillSlot: 1, effects: [{ kind: "gainNp", rawAmount: 10000, targetType: "self" }], cooldownTurns: 5 }];
    };
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      resolveSkillOptions,
      npByServantId: () => selectedNp,
      randomFn: () => 0.5,
    });
    expect(results[0]?.best.actions.some((action) => action.type === "castNp")).toBe(true);
  });

  it("selects the account-unlocked NP strengthening from the shortlisted servant data", () => {
    const damageFunc = (value: number) => ({
      funcId: value,
      funcType: Func.FuncType.DAMAGE_NP,
      funcTargetType: Func.FuncTargetType.ENEMY,
      funcTargetTeam: Func.FuncTargetTeam.ENEMY,
      functvals: [],
      funcquestTvals: [],
      overWriteTvalsList: [],
      funcPopupText: "",
      buffs: [],
      svals: [{ Value: value }],
      svals2: [{ Value: value }],
      svals3: [{ Value: value }],
    }) as unknown as Func.Func;
    const npBase = {
      id: 1101,
      num: 1,
      npNum: 1,
      priority: 101,
      condQuestId: 0,
      condQuestPhase: 0,
      strengthStatus: 1,
      card: "2",
      name: "Base NP",
      effectFlags: ["attackEnemyOne"],
      npGain: { buster: [50], arts: [50], quick: [50], extra: [50], defence: [50], np: [80] },
      npDistribution: [100],
      functions: [damageFunc(1000)],
    } as unknown as NoblePhantasm.NoblePhantasm;
    const npStrengthened = {
      ...npBase,
      id: 1102,
      priority: 102,
      condQuestId: 900001,
      condQuestPhase: 2,
      strengthStatus: 99,
      name: "Strengthened NP",
      functions: [damageFunc(100000)],
    } as NoblePhantasm.NoblePhantasm;
    const attacker: ServantCandidate = {
      niceServant: niceServant({ noblePhantasms: [npBase, npStrengthened] }),
      build: {
        ...build(1),
        selectedNpId: npBase.id,
        unlockedStrengthenings: [npStrengtheningKey(npStrengthened)],
      },
    };
    const resolveSkillOptions = (initialState: BattleState): readonly SkillActivation[] => {
      const actor = initialState.servants.find((servant) => servant.servantId === 1);
      return actor === undefined
        ? []
        : [{ type: "useSkill", servantId: actor.servantId, skillSlot: 1, effects: [{ kind: "gainNp", rawAmount: 10000, targetType: "self" }], cooldownTurns: 5 }];
    };
    const results = optimizeQuest({
      shortlist: [attacker, candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      resolveSkillOptions,
      randomFn: () => 0.5,
    });
    const cast = results[0]?.best.actions.find((action) => action.type === "castNp");
    expect(cast?.context.npDamageMultiplier).toBe(100);
  });

  it("wires resolveOrderChangeOptions through without changing results when it resolves to no available swaps", () => {
    // optimizeQuest only ever fields exactly-3-front-line parties (no bench axis, see this
    // function's own scope note) — with no benched sub-member present in any built
    // BattleState, a realistic resolveOrderChangeOptions has nothing to offer; this confirms
    // the option is accepted and degenerates to the same search as omitting it entirely.
    const options = {
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    } as const;
    const withoutOption = optimizeQuest(options);
    const withEmptyOrderChangeOptions = optimizeQuest({ ...options, resolveOrderChangeOptions: () => [] });
    expect(withEmptyOrderChangeOptions.map((r) => ({ score: r.best.score, actions: r.best.actions }))).toEqual(
      withoutOption.map((r) => ({ score: r.best.score, actions: r.best.actions })),
    );
  });

  it("defaults maxBenchCount to 0, producing exactly the same results as before the option existed", () => {
    const options = {
      shortlist: [candidate(1), candidate(2), candidate(3), candidate(4)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    } as const;
    const withoutOption = optimizeQuest(options);
    const withExplicitZero = optimizeQuest({ ...options, maxBenchCount: 0 });
    expect(withExplicitZero).toEqual(withoutOption);
    // C(4,3) = 4 front-line-only combinations, no bench.
    expect(withoutOption).toHaveLength(4);
    expect(withoutOption.every((r) => r.party.every((m) => m.isFrontLine))).toBe(true);
  });

  it("fields benched sub-members when maxBenchCount > 0, each still tagged isFrontLine: false", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3), candidate(4)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      maxBenchCount: 1,
      randomFn: () => 0,
    });
    // C(4,3) size-3 (no bench) + C(4,4)*C(4,3) size-4 (1 benched) = 4 + 4 = 8.
    expect(results).toHaveLength(8);
    const withBench = results.filter((r) => r.party.length === 4);
    expect(withBench).toHaveLength(4);
    for (const result of withBench) {
      const benched = result.party.filter((m) => !m.isFrontLine);
      expect(benched).toHaveLength(1);
      expect(result.party.filter((m) => m.isFrontLine)).toHaveLength(3);
    }
  });

  it("assigns CEs to benched slots too, not just front-line", () => {
    const ce: CraftEssence.CraftEssence = { atkGrowth: [0, 0, 300], hpGrowth: [0, 0, 150], cost: 12 } as unknown as CraftEssence.CraftEssence;
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3), candidate(4)],
      cePool: [{ data: ce, level: 3 }],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      maxBenchCount: 1,
      randomFn: () => 0,
    });
    const ceOnBench = results.some((r) => r.party.some((m) => !m.isFrontLine && m.equippedCe !== undefined));
    expect(ceOnBench).toBe(true);
  });

  it("omitting turnCount keeps the original single-turn result shape (no endTurn appended)", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    expect(results[0]?.best.actions.some((a) => a.type === "endTurn")).toBe(false);
    expect(results[0]?.best.finalState.currentTurn).toBe(1);
  });

  it("searches a multi-turn horizon when turnCount is supplied, applying one endTurn per turn", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      turnCount: 2,
      randomFn: () => 0,
    });
    expect(results).toHaveLength(1);
    const endTurnCount = results[0]?.best.actions.filter((a) => a.type === "endTurn").length;
    expect(endTurnCount).toBe(2);
    expect(results[0]?.best.finalState.currentTurn).toBe(3);
  });

  it("carries a multi-turn search into the next wave after the current wave is cleared", () => {
    const firstEnemy = waveEnemy({ npcId: 9001, hp: 1 });
    const secondEnemy = waveEnemy({ npcId: 9101, hp: 1 });
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [
        wave({ waveNumber: 1, initialEnemies: [firstEnemy], enemyPool: [firstEnemy] }),
        wave({ waveNumber: 2, initialEnemies: [secondEnemy], enemyPool: [secondEnemy] }),
      ],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      turnCount: 2,
      randomFn: () => 0,
      allowFaceCardFinishes: true,
    });

    expect(results[0]?.best.finalState.currentWaveIndex).toBe(1);
    expect(results[0]?.best.finalState.enemies[0]).toMatchObject({ npcId: 9101, currentHp: 0 });
    expect(isQuestCleared(results[0]?.best.finalState as BattleState)).toBe(true);
  });

  it("credits a multi-turn line's total damage across the whole horizon, at least as much as a single turn alone", () => {
    const oneTurn = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    const twoTurns = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      turnCount: 2,
      randomFn: () => 0,
    });
    expect(twoTurns[0]?.best.score).toBeGreaterThanOrEqual(oneTurn[0]?.best.score ?? Infinity);
  });

  it("throws when neither resolveHitContext nor npGainByServantId is supplied", () => {
    expect(() =>
      optimizeQuest({
        shortlist: [candidate(1), candidate(2), candidate(3)],
        cePool: [],
        waves: [wave()],
        costBudget: 1000,
        constants: CONSTANTS,
        randomFn: () => 0,
      } as unknown as Parameters<typeof optimizeQuest>[0]),
    ).toThrow(RangeError);
  });

  it("auto-resolves hit context from npGainByServantId when resolveHitContext is omitted", () => {
    const npGain: NoblePhantasm.NoblePhantasmGain = { buster: [500], arts: [500], quick: [500], extra: [500], np: [500], superSuccess: [500] } as unknown as NoblePhantasm.NoblePhantasmGain;
    const manual = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    const auto = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      npGainByServantId: () => npGain,
      randomFn: () => 0,
    });
    expect(auto).toHaveLength(1);
    expect(auto[0]?.best.score).toBeGreaterThan(0);
    // resolveCardHitContext rolls its own randomModifier (0.9-1.10) rather than the manual
    // resolver's fixed 1, so scores are close but not required to match exactly — this just
    // confirms the auto path actually deals real damage, on the same order of magnitude.
    expect(manual[0]?.best.score).toBeGreaterThan(0);
  });

  it("prefers an explicit resolveHitContext over npGainByServantId when both are supplied", () => {
    const npGain: NoblePhantasm.NoblePhantasmGain = { buster: [999999], arts: [999999], quick: [999999], extra: [999999], np: [500], superSuccess: [500] } as unknown as NoblePhantasm.NoblePhantasmGain;
    const withBoth = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      npGainByServantId: () => npGain,
      randomFn: () => 0,
    });
    const manual = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    // If npGainByServantId's absurd offensiveNPRate had been used, the score would differ.
    expect(withBoth[0]?.best.score).toBe(manual[0]?.best.score);
  });

  it("auto-resolves the skill-usage-plan axis from skillSources when resolveSkillOptions is omitted", () => {
    const selfAtkUpFunc: Func.Func = {
      funcId: 1,
      funcType: Func.FuncType.ADD_STATE,
      funcTargetType: Func.FuncTargetType.SELF,
      funcTargetTeam: Func.FuncTargetTeam.PLAYER,
      functvals: [],
      funcquestTvals: [],
      overWriteTvalsList: [],
      funcPopupText: "",
      buffs: [{ type: "upAtk" as Buff.BuffType, buffGroup: 0, vals: [], ckSelfIndv: [], ckOpIndv: [] } as unknown as Buff.Buff],
      svals: [{ Value: 500, Turn: 3 }],
    } as unknown as Func.Func;
    const emptySkill: Skill.Skill["functions"] = [];
    const skillSources: readonly ServantSkillSource[] = [
      {
        servantId: 1,
        skills: [
          { skill: { functions: [selfAtkUpFunc], coolDown: [5] }, level: 1 },
          { skill: { functions: emptySkill, coolDown: [5] }, level: 1 },
          { skill: { functions: emptySkill, coolDown: [5] }, level: 1 },
        ],
      },
    ];

    const withoutSkill = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    const withSkill = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      skillSources,
      randomFn: () => 0,
    });

    expect(withSkill).toHaveLength(1);
    expect(withSkill[0]?.best.score).toBeGreaterThan(withoutSkill[0]?.best.score ?? Infinity);
    expect(withSkill[0]?.best.actions[0]?.type).toBe("useSkill");
  });

  it("tries each front-line ally as the target of a single-ally skill instead of only the caster", () => {
    const allyAtkUpFunc = {
      funcId: 2,
      funcType: Func.FuncType.ADD_STATE,
      funcTargetType: Func.FuncTargetType.PT_ONE,
      funcTargetTeam: Func.FuncTargetTeam.PLAYER,
      functvals: [],
      funcquestTvals: [],
      overWriteTvalsList: [],
      funcPopupText: "",
      buffs: [{ type: "upAtk" as Buff.BuffType, buffGroup: 0, vals: [], ckSelfIndv: [], ckOpIndv: [] } as unknown as Buff.Buff],
      svals: [{ Value: 1000, Turn: 3 }],
    } as unknown as Func.Func;
    const none: Skill.Skill["functions"] = [];
    const skillSources: readonly ServantSkillSource[] = [{
      servantId: 2,
      skills: [{ skill: { functions: [allyAtkUpFunc], coolDown: [5] }, level: 1 }, { skill: { functions: none, coolDown: [5] }, level: 1 }, { skill: { functions: none, coolDown: [5] }, level: 1 }],
    }];
    const strong: ServantCandidate = { niceServant: niceServant({ atkGrowth: [0, 20000, 40000] }), build: build(1) };
    const tough = wave({ initialEnemies: [waveEnemy({ hp: 50_000_000 })], enemyPool: [waveEnemy({ hp: 50_000_000 })] });
    const options = { shortlist: [strong, candidate(2), candidate(3)], cePool: [], waves: [tough], costBudget: 1000, constants: CONSTANTS, resolveHitContext, skillSources, randomFn: () => 0 } as const;

    const casterOnly = optimizeQuest({ ...options, defaultTargetServantId: (id) => id });
    const searched = optimizeQuest(options);
    const skill = searched[0]?.best.actions.find((action) => action.type === "useSkill");

    expect(skill).toMatchObject({ servantId: 2, targetServantId: 1 });
    expect(searched[0]?.best.score).toBeGreaterThan(casterOnly[0]?.best.score ?? Infinity);
  });

  it("searches Order Change with single-ally skills without targeting a servant who was swapped out", () => {
    const allyAtkUpFunc = {
      funcId: 3,
      funcType: Func.FuncType.ADD_STATE,
      funcTargetType: Func.FuncTargetType.PT_ONE,
      funcTargetTeam: Func.FuncTargetTeam.PLAYER,
      functvals: [],
      funcquestTvals: [],
      overWriteTvalsList: [],
      funcPopupText: "",
      buffs: [{ type: "upAtk" as Buff.BuffType, buffGroup: 0, vals: [], ckSelfIndv: [], ckOpIndv: [] } as unknown as Buff.Buff],
      svals: [{ Value: 500, Turn: 3 }],
    } as unknown as Func.Func;
    const none: Skill.Skill["functions"] = [];
    const source = (servantId: number): ServantSkillSource => ({
      servantId,
      skills: [{ skill: { functions: [allyAtkUpFunc], coolDown: [5] }, level: 1 }, { skill: { functions: none, coolDown: [5] }, level: 1 }, { skill: { functions: none, coolDown: [5] }, level: 1 }],
    });
    const run = () => optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3), candidate(4)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      skillSources: [source(1), source(2), source(3), source(4)],
      hasOrderChangeMysticCodeSkill: true,
      maxBenchCount: 1,
      turnCount: 2,
      randomFn: () => 0,
    });
    expect(run).not.toThrow();
    expect(run().some((result) => result.best.actions.some((action) => action.type === "orderChange"))).toBe(true);
  });

  describe('searchLevel "quick"', () => {
    const allyAtkUpFunc = {
      funcId: 4,
      funcType: Func.FuncType.ADD_STATE,
      funcTargetType: Func.FuncTargetType.PT_ONE,
      funcTargetTeam: Func.FuncTargetTeam.PLAYER,
      functvals: [],
      funcquestTvals: [],
      overWriteTvalsList: [],
      funcPopupText: "",
      buffs: [{ type: "upAtk" as Buff.BuffType, buffGroup: 0, vals: [], ckSelfIndv: [], ckOpIndv: [] } as unknown as Buff.Buff],
      svals: [{ Value: 500, Turn: 3 }],
    } as unknown as Func.Func;
    const none: Skill.Skill["functions"] = [];
    const source = (servantId: number): ServantSkillSource => ({
      servantId,
      skills: [{ skill: { functions: [allyAtkUpFunc], coolDown: [5] }, level: 1 }, { skill: { functions: none, coolDown: [5] }, level: 1 }, { skill: { functions: none, coolDown: [5] }, level: 1 }],
    });
    const ce = (inventoryId: string): EquippedCraftEssence => ({ data: { id: 1, cost: 0, atkGrowth: [0], hpGrowth: [0], skills: [] } as unknown as EquippedCraftEssence["data"], level: 1, limitBreakCount: 0, inventoryId });
    const base = {
      shortlist: [candidate(1), candidate(2), candidate(3), candidate(4)],
      cePool: [ce("a")],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      skillSources: [source(1), source(2), source(3), source(4)],
      randomFn: () => 0,
      attributionPoolSize: 50,
    } as const;

    it("needs a preferred attacker", () => {
      expect(() => optimizeQuest({ ...base, searchLevel: "quick" })).toThrow(RangeError);
    });

    it("fields only parties with the attacker in front, gives it the CE and aims single-ally skills at it", () => {
      const results = optimizeQuest({ ...base, searchLevel: "quick", preferences: { preferredAttackerId: 3 } });
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.party.find((member) => member.build.servantId === 3)?.isFrontLine).toBe(true);
        expect(result.party.filter((member) => member.equippedCe !== undefined).every((member) => member.build.servantId === 3)).toBe(true);
        for (const action of result.best.actions) if (action.type === "useSkill") expect(action.targetServantId).toBe(3);
      }
    });
  });

  it("searches the equipped Mystic Code's skills and aims a single-ally one at the attacker", () => {
    const allyAtkUpFunc = {
      funcId: 5, funcType: Func.FuncType.ADD_STATE, funcTargetType: Func.FuncTargetType.PT_ONE, funcTargetTeam: Func.FuncTargetTeam.PLAYER,
      functvals: [], funcquestTvals: [], overWriteTvalsList: [], funcPopupText: "",
      buffs: [{ type: "upAtk" as Buff.BuffType, buffGroup: 0, vals: [], ckSelfIndv: [], ckOpIndv: [] } as unknown as Buff.Buff],
      svals: [{ Value: 1000, Turn: 1 }],
    } as unknown as Func.Func;
    const none: Skill.Skill["functions"] = [];
    const noSkills = (servantId: number): ServantSkillSource => ({ servantId, skills: [{ skill: { functions: none, coolDown: [5] }, level: 1 }, { skill: { functions: none, coolDown: [5] }, level: 1 }, { skill: { functions: none, coolDown: [5] }, level: 1 }] });
    const strong: ServantCandidate = { niceServant: niceServant({ atkGrowth: [0, 20000, 40000] }), build: build(1) };
    const tough = wave({ initialEnemies: [waveEnemy({ hp: 50_000_000 })], enemyPool: [waveEnemy({ hp: 50_000_000 })] });
    const results = optimizeQuest({
      shortlist: [strong, candidate(2), candidate(3)], cePool: [], waves: [tough], costBudget: 1000, constants: CONSTANTS, resolveHitContext,
      skillSources: [noSkills(1), noSkills(2), noSkills(3)],
      mysticCode: { skills: [{ functions: [allyAtkUpFunc], coolDown: [10] }], level: 1 },
      randomFn: () => 0,
    });
    expect(results[0]?.best.actions.find((action) => action.type === "useMysticCodeSkill")).toMatchObject({ slot: 1, targetServantId: 1 });
  });

  it("wires hasOrderChangeMysticCodeSkill through without changing results when there is no benched sub-member to swap in", () => {
    const options = {
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    } as const;
    const withoutOption = optimizeQuest(options);
    const withAutoOrderChange = optimizeQuest({ ...options, hasOrderChangeMysticCodeSkill: true });
    expect(withAutoOrderChange.map((r) => ({ score: r.best.score, actions: r.best.actions }))).toEqual(
      withoutOption.map((r) => ({ score: r.best.score, actions: r.best.actions })),
    );
  });

  it("integrates the bench axis with the auto Order-Change resolver: a benched sub-member is a real swap target the search can find and prefer", () => {
    // servant 4's cards deal far more damage than anyone else's — strictly dominant, so the
    // best line for the {1,2,3} front-line / {4} bench formation must swap 4 in and actually
    // play at least one of its cards, not just carry a no-op orderChange in the candidate list.
    const highDamageForFour = (handCard: HandCard): DerivedHitContext => ({
      ...resolveHitContext(handCard),
      npDamageMultiplier: handCard.servantId === 4 ? 100 : 1,
    });

    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3), candidate(4)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext: highDamageForFour,
      maxBenchCount: 1,
      hasOrderChangeMysticCodeSkill: true,
      randomFn: () => 0,
    });

    const benchedFour = results.find((r) => r.party.length === 4 && r.party.some((m) => m.build.servantId === 4 && !m.isFrontLine));
    expect(benchedFour).toBeDefined();
    expect(benchedFour?.best.actions.some((a) => a.type === "orderChange")).toBe(true);
    expect(benchedFour?.best.actions.some((a) => (a.type === "playCard" || a.type === "castNp") && a.servantId === 4)).toBe(true);
  });
});

describe("optimizeQuestMinimumTurns", () => {
  it("enforces the offensive-only product cap of 1 through 6 turns", () => {
    const base = {
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    } as const;
    expect(() => optimizeQuestMinimumTurns({ ...base, maxTurns: 0 })).toThrow(RangeError);
    expect(() => optimizeQuestMinimumTurns({ ...base, maxTurns: 7 })).toThrow(RangeError);
    expect(() => optimizeQuestMinimumTurns({ ...base, reliability: { trialCount: 0, seed: 1 } })).toThrow(RangeError);
    expect(() => optimizeQuestMinimumTurns({ ...base, reliability: { trialCount: 1, seed: 1.5 } })).toThrow(RangeError);
  });

  it("stops at the first horizon that clears every configured wave", () => {
    const firstEnemy = waveEnemy({ npcId: 9001, hp: 1 });
    const secondEnemy = waveEnemy({ npcId: 9101, hp: 1 });
    const result = optimizeQuestMinimumTurns({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [
        wave({ waveNumber: 1, initialEnemies: [firstEnemy], enemyPool: [firstEnemy] }),
        wave({ waveNumber: 2, initialEnemies: [secondEnemy], enemyPool: [secondEnemy] }),
      ],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      maxTurns: 6,
      randomFn: () => 0,
      allowFaceCardFinishes: true,
    });
    expect(result.minimumTurns).toBe(2);
    expect(result.attackerLimitUsed).toBe(2);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((candidate) => isQuestCleared(candidate.best.finalState))).toBe(true);
    expect(result.candidates.every((candidate) => candidate.attribution.attackerIds.length <= 2)).toBe(true);
  });

  it("returns at most five strategy-diverse finalists", () => {
    const target = waveEnemy({ hp: 1 });
    const result = optimizeQuestMinimumTurns({
      shortlist: [candidate(1), candidate(2), candidate(3), candidate(4), candidate(5)],
      cePool: [],
      waves: [wave({ initialEnemies: [target], enemyPool: [target] })],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      maxTurns: 1,
      randomFn: () => 0,
      allowFaceCardFinishes: true,
    });
    expect(result.attackerLimitUsed).toBe(1);
    expect(result.candidates.length).toBeLessThanOrEqual(5);
    expect(result.candidates.every((candidate) => candidate.attribution.attackerIds.length > 0)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.attribution.primaryAttackerId !== undefined)).toBe(true);
    expect(new Set(result.candidates.map((candidate) => candidate.strategyKey)).size).toBe(result.candidates.length);
  });

  it("estimates finalist reliability with reproducible seeded trials", () => {
    const target = waveEnemy({ hp: 1 });
    const options = {
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave({ initialEnemies: [target], enemyPool: [target] })],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      maxTurns: 1,
      allowFaceCardFinishes: true,
      reliability: { trialCount: 8, seed: 42 },
    } as const;
    const first = optimizeQuestMinimumTurns(options);
    const second = optimizeQuestMinimumTurns(options);
    expect(first.candidates[0]?.reliability?.trialCount).toBe(8);
    expect(first.candidates[0]?.reliability).toEqual(second.candidates[0]?.reliability);
    expect(first.candidates.map((candidate) => candidate.strategyKey)).toEqual(
      second.candidates.map((candidate) => candidate.strategyKey),
    );
  });

  it("replays finalists on fresh hands with the same skills and NPs, so an NP clear is reliable however the cards fall", () => {
    const damageFunc = {
      funcId: 1,
      funcType: Func.FuncType.DAMAGE_NP,
      funcTargetType: Func.FuncTargetType.ENEMY,
      funcTargetTeam: Func.FuncTargetTeam.ENEMY,
      functvals: [],
      funcquestTvals: [],
      overWriteTvalsList: [],
      funcPopupText: "",
      buffs: [],
      svals: [{ Value: 100000 }],
      svals2: [{ Value: 100000 }],
      svals3: [{ Value: 100000 }],
    } as unknown as Func.Func;
    const np = {
      id: 1001, num: 1, card: "2", name: "NP", effectFlags: ["attackEnemyOne"],
      npGain: { buster: [50], arts: [50], quick: [50], extra: [50], defence: [50], np: [80] },
      npDistribution: [100], functions: [damageFunc], individuality: [],
    } as unknown as NoblePhantasm.NoblePhantasm;
    const charge = (state: BattleState): readonly SkillActivation[] => {
      const actor = state.servants.find((servant) => servant.servantId === 1);
      return actor === undefined || actor.skillCooldowns[0] !== 0 ? [] : [{ type: "useSkill", servantId: 1, skillSlot: 1, effects: [{ kind: "gainNp", rawAmount: 10000, targetType: "self" }], cooldownTurns: 5 }];
    };
    const result = optimizeQuestMinimumTurns({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave({ initialEnemies: [waveEnemy({ hp: 10000 })], enemyPool: [waveEnemy({ hp: 10000 })] })],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      resolveSkillOptions: charge,
      npByServantId: () => np,
      maxTurns: 1,
      randomFn: () => 0.5,
      reliability: { trialCount: 20, seed: 7 },
    });
    const finalist = result.candidates[0];
    expect(result.minimumTurns).toBe(1);
    expect(finalist?.best.actions.some((action) => action.type === "castNp")).toBe(true);
    expect(finalist?.reliability?.clearProbability).toBe(1);
    expect(estimateQuestCandidateReliability(finalist!, CONSTANTS, { trialCount: 20, seed: 7 }).clearProbability).toBeLessThan(1);
    const attacks = finalist?.best.actions.filter((action) => action.type === "playCard" || action.type === "castNp") ?? [];
    expect(attacks[0]?.type).toBe("castNp");
    const chainTypes = attacks[0] !== undefined && "chainCards" in attacks[0] ? attacks[0].chainCards.map((card) => card.type) : [];
    expect(chainTypes.every((type) => type === "1")).toBe(false);
  });

  it("can search every attack at the minimum damage roll", () => {
    const base = { shortlist: [candidate(1), candidate(2), candidate(3)], cePool: [], waves: [wave()], costBudget: 1000, constants: CONSTANTS, resolveHitContext, turnCount: 1, randomFn: () => 0.5 } as const;
    const rolls = (minimumDamageRoll: boolean) =>
      optimizeQuest({ ...base, minimumDamageRoll })[0]?.best.actions.flatMap((action) => ("context" in action ? [action.context.randomModifier] : []));
    expect(rolls(true)?.length).toBeGreaterThan(0);
    expect(rolls(true)?.every((roll) => roll === 0.9)).toBe(true);
    expect(rolls(false)?.some((roll) => roll !== 0.9)).toBe(true);
  });

  it("plans charge without face-card refund unless face-card finishes are allowed", () => {
    const base = { shortlist: [candidate(1), candidate(2), candidate(3)], cePool: [], waves: [wave()], costBudget: 1000, constants: CONSTANTS, resolveHitContext, turnCount: 1, randomFn: () => 0.5 } as const;
    const faceCardRates = (allowFaceCardFinishes: boolean) =>
      optimizeQuest({ ...base, allowFaceCardFinishes })[0]?.best.actions.flatMap((action) => (action.type === "playCard" || action.type === "playExtraCard" ? [action.context.offensiveNPRate] : []));
    expect(faceCardRates(false)?.length).toBeGreaterThan(0);
    expect(faceCardRates(false)?.every((rate) => rate === 0)).toBe(true);
    expect(faceCardRates(true)?.some((rate) => rate > 0)).toBe(true);
  });

  it("uses Event CE preference to choose among otherwise equivalent strategies", () => {
    const eventCe = {
      data: { id: 777, atkGrowth: [0, 0], hpGrowth: [0, 0], cost: 1 } as unknown as CraftEssence.CraftEssence,
      level: 1,
    };
    const target = waveEnemy({ hp: 1 });
    const result = optimizeQuestMinimumTurns({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [eventCe],
      waves: [wave({ initialEnemies: [target], enemyPool: [target] })],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      maxTurns: 1,
      preferences: { eventCeIds: [777] },
      randomFn: () => 0,
      allowFaceCardFinishes: true,
    });
    expect(result.candidates[0]?.party.some((member) => member.equippedCe?.data.id === 777)).toBe(true);
  });

  it("returns closest max-horizon candidates when no clear exists", () => {
    const boss = waveEnemy({ npcId: 9001, hp: 999999999 });
    const result = optimizeQuestMinimumTurns({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [],
      waves: [wave({ initialEnemies: [boss], enemyPool: [boss] })],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      maxTurns: 1,
      randomFn: () => 0,
      allowFaceCardFinishes: true,
    });
    expect(result.minimumTurns).toBeNull();
    expect(result.searchedThroughTurn).toBe(1);
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

describe("upgrade advisor integration", () => {
  it("finds the smallest NP-level increase that turns an actual failed search into a clear", () => {
    const noblePhantasm = damagingNp(7001, [1000, 100000, 110000, 120000, 130000]);
    const attacker: ServantCandidate = {
      niceServant: niceServant({ noblePhantasms: [noblePhantasm] }),
      build: { ...build(1), selectedNpId: noblePhantasm.id },
    };
    const boss = waveEnemy({ hp: 30000 });
    const report = findClearUpgradeRecommendations({
      shortlist: [attacker, candidate(2), candidate(3)],
      cePool: [],
      waves: [wave({ initialEnemies: [boss], enemyPool: [boss] })],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      resolveSkillOptions: (initialState) => {
        const actor = initialState.servants.find((servant) => servant.servantId === 1);
        return actor === undefined
          ? []
          : [{ type: "useSkill", servantId: 1, skillSlot: 1, effects: [{ kind: "gainNp", rawAmount: 10000, targetType: "self" }], cooldownTurns: 5 }];
      },
      maxTurns: 1,
      maxAttackers: 1,
      randomFn: () => 0.5,
      allowFaceCardFinishes: true,
    });
    expect(report.baseline.minimumTurns).toBeNull();
    expect(report.recommendations[0]).toMatchObject({ kind: "npLevel", servantId: 1, from: 1, to: 2 });
    expect(report.recommendations[0]?.result.minimumTurns).toBe(1);
  });

  it("proves a feasible MLB CE can unlock its stronger starting-NP passive and clear", () => {
    const noblePhantasm = damagingNp(7101, [100000, 100000, 100000, 100000, 100000]);
    const attacker: ServantCandidate = {
      niceServant: niceServant({ noblePhantasms: [noblePhantasm] }),
      build: { ...build(1), selectedNpId: noblePhantasm.id },
    };
    const gainNp = (Value: number) => ({
      funcType: Func.FuncType.GAIN_NP,
      funcTargetType: Func.FuncTargetType.SELF,
      svals: [{ Value }],
      buffs: [],
    }) as unknown as Func.Func;
    const ceData = {
      id: 9400710,
      name: "MLB Starting NP Test CE",
      cost: 12,
      lvMax: 100,
      atkGrowth: Array.from({ length: 100 }, () => 0),
      hpGrowth: Array.from({ length: 100 }, () => 0),
      ascensionAdd: { lvMax: { ascension: { 0: 20, 1: 40, 2: 60, 3: 80, 4: 100 }, costume: {} } },
      skills: [
        { num: 1, priority: 1, condLimitCount: 0, functions: [gainNp(8000)] },
        { num: 1, priority: 2, condLimitCount: 4, functions: [gainNp(10000)] },
      ],
    } as unknown as CraftEssence.CraftEssence;
    const cePool = ["target", "donor-1", "donor-2", "donor-3", "donor-4"].map((inventoryId) => ({
      data: ceData,
      level: 1,
      inventoryId,
      limitBreakCount: 0 as const,
    }));
    const boss = waveEnemy({ hp: 30000 });
    const options = {
      shortlist: [attacker, candidate(2), candidate(3)],
      cePool,
      waves: [wave({ initialEnemies: [boss], enemyPool: [boss] })],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      maxTurns: 1,
      maxAttackers: 1,
      randomFn: () => 0.5,
      allowFaceCardFinishes: true,
    };
    const scenarios = buildUpgradeScenarios(options).filter((scenario) =>
      scenario.kind === "ceMlb" && scenario.inventoryId === "target",
    );
    const report = findClearUpgradeRecommendations(options, { scenarios });

    expect(report.baseline.minimumTurns).toBeNull();
    expect(report.recommendations[0]).toMatchObject({
      kind: "ceMlb",
      craftEssenceId: ceData.id,
      inventoryId: "target",
      consumedInventoryIds: ["donor-1", "donor-2", "donor-3", "donor-4"],
    });
    expect(report.recommendations[0]?.result.minimumTurns).toBe(1);
  });

  it("proves an owned CE level-cap upgrade can flip a failed search into a clear", () => {
    const ceData = {
      id: 9400999,
      name: "Advisor Test CE",
      cost: 12,
      lvMax: 20,
      atkGrowth: Array.from({ length: 20 }, (_, index) => index * 10000),
      hpGrowth: Array.from({ length: 20 }, () => 0),
      ascensionAdd: { lvMax: { ascension: { 0: 20 }, costume: {} } },
    } as unknown as CraftEssence.CraftEssence;
    const boss = waveEnemy({ hp: 30000 });
    const report = findClearUpgradeRecommendations({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [{ data: ceData, level: 1, inventoryId: "owned-ce", limitBreakCount: 0 }],
      waves: [wave({ initialEnemies: [boss], enemyPool: [boss] })],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      maxTurns: 1,
      maxAttackers: 3,
      randomFn: () => 0,
      allowFaceCardFinishes: true,
    });
    expect(report.baseline.minimumTurns).toBeNull();
    expect(report.recommendations[0]).toMatchObject({
      kind: "ceLevel",
      craftEssenceId: ceData.id,
      inventoryId: "owned-ce",
      from: 1,
      to: 20,
    });
    expect(report.recommendations[0]?.result.minimumTurns).toBe(1);
  });

  it("finds an underbuilt owned servant outside the shortlist that can clear at natural-max potential", () => {
    const noblePhantasm = damagingNp(7201, [100000, 100000, 100000, 100000, 100000]);
    const owned: ServantCandidate = {
      niceServant: niceServant({
        lvMax: 2,
        atkGrowth: [0, 2000],
        hpGrowth: [0, 1000],
        noblePhantasms: [noblePhantasm],
      }),
      build: {
        ...build(4),
        level: 1,
        ascension: 0,
        skillLevels: [1, 1, 1],
        npLevel: 4,
        selectedNpId: noblePhantasm.id,
      },
    };
    const startingNpCe = {
      id: 9400720,
      name: "Owned Roster Test CE",
      cost: 12,
      lvMax: 20,
      atkGrowth: Array.from({ length: 20 }, () => 0),
      hpGrowth: Array.from({ length: 20 }, () => 0),
      skills: [{
        num: 1,
        priority: 1,
        condLimitCount: 0,
        functions: [{
          funcType: Func.FuncType.GAIN_NP,
          funcTargetType: Func.FuncTargetType.SELF,
          svals: [{ Value: 10000 }],
          buffs: [],
        }],
      }],
    } as unknown as CraftEssence.CraftEssence;
    const boss = waveEnemy({ hp: 30000 });
    const optimizerOptions = {
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [{ data: startingNpCe, level: 1, inventoryId: "starting-np", limitBreakCount: 0 as const }],
      waves: [wave({ initialEnemies: [boss], enemyPool: [boss] })],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      maxTurns: 1,
      maxAttackers: 3,
      randomFn: () => 0.5,
      allowFaceCardFinishes: true,
    };
    const report = findClearUpgradeRecommendations(optimizerOptions, { ownedServantCandidates: [owned] });

    expect(report.baseline.minimumTurns).toBeNull();
    expect(report.recommendations[0]).toMatchObject({ kind: "ownedServantBuild", servantId: 4 });
    expect(report.recommendations[0]?.options.shortlist.find((entry) => entry.build.servantId === 4)?.build).toMatchObject({
      level: 2,
      npLevel: 4,
    });
    expect(report.recommendations[0]?.result.minimumTurns).toBe(1);
  });
});

describe("borrowed support", () => {
  const ce: CraftEssence.CraftEssence = { atkGrowth: [0, 0, 300], hpGrowth: [0, 0, 150], cost: 12 } as unknown as CraftEssence.CraftEssence;

  it("fields at most one borrowed support and never equips it with a Craft Essence", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2)],
      supportCandidates: [candidate(3)],
      cePool: [{ data: ce, level: 1 }],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      const supports = result.party.filter((member) => member.isSupport === true);
      expect(supports).toHaveLength(1);
      expect(supports[0]?.equippedCe).toBeUndefined();
    }
    expect(results.some((result) => result.party.some((member) => member.equippedCe !== undefined))).toBe(true);
  });

  it("still searches parties without a support, and adds none when no support candidates are given", () => {
    const withSupport = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      supportCandidates: [candidate(4)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    expect(withSupport.some((result) => result.party.every((member) => member.isSupport !== true))).toBe(true);
    expect(withSupport.some((result) => result.party.some((member) => member.isSupport === true))).toBe(true);
  });

  it("leaves the borrowed support out of the Cost check", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2)],
      supportCandidates: [candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 32,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.initialState.costSpent === 32)).toBe(true);
  });

  it("lets a borrowed support share the field with the owned copy of the same servant", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      supportCandidates: [candidate(1)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    const doubled = results.find((result) => result.party.filter((member) => member.build.servantId === 1).length === 2);
    expect(doubled).toBeDefined();
    expect(doubled?.initialState.servants.map((servant) => servant.servantId)).toEqual(expect.arrayContaining([1, supportBattleId(1)]));
  });

  it("resolves the support's own NP gain and skills on the automatic paths, keyed by its battle id", () => {
    const npGain = { buster: [500], arts: [500], quick: [500], extra: [500], np: [500], defence: [500] } as unknown as NoblePhantasm.NoblePhantasmGain;
    const selfAtkUp = {
      funcId: 1,
      funcType: Func.FuncType.ADD_STATE,
      funcTargetType: Func.FuncTargetType.SELF,
      funcTargetTeam: Func.FuncTargetTeam.PLAYER,
      functvals: [],
      funcquestTvals: [],
      overWriteTvalsList: [],
      funcPopupText: "",
      buffs: [{ type: "upAtk" as Buff.BuffType, buffGroup: 0, vals: [], ckSelfIndv: [], ckOpIndv: [] } as unknown as Buff.Buff],
      svals: Array.from({ length: 10 }, () => ({ Value: 500, Turn: 3 })),
    } as unknown as Func.Func;
    const skill = (num: number, functions: readonly Func.Func[]): Skill.Skill =>
      ({ id: 900 + num, num, condQuestId: 0, condQuestPhase: 0, functions, coolDown: Array.from({ length: 10 }, () => 5) }) as unknown as Skill.Skill;
    const support: ServantCandidate = {
      niceServant: niceServant({
        id: 3,
        noblePhantasms: [{ ...damagingNp(700, [100]), npGain }],
        skills: [skill(1, [selfAtkUp]), skill(2, []), skill(3, [])],
      } as Partial<ServantModule.Servant>),
      build: { ...build(3), skillLevels: [10, 10, 10] },
    };
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2)],
      supportCandidates: [support],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      npGainByServantId: (servantId) => {
        if (servantId === 1 || servantId === 2) return npGain;
        throw new RangeError(`owned lookup asked for ${servantId}`);
      },
      skillSources: [],
      // A fixed draw deals no support card on turn 1; three turns bring the support's cards into hand.
      turnCount: 3,
      randomFn: () => 0,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.best.actions.some((action) => action.type === "useSkill" && action.servantId === supportBattleId(3)))).toBe(true);
  });

  it("attributes a support's damage to its battle id", () => {
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2)],
      supportCandidates: [candidate(3)],
      cePool: [],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      turnCount: 3,
      randomFn: () => 0,
    });
    const supportAttacked = results.find((result) => result.attribution.attackerIds.includes(supportBattleId(3)));
    expect(supportAttacked).toBeDefined();
    expect(supportAttacked?.strategyKey).toContain(String(supportBattleId(3)));
  });
});

describe("optimizeQuestMinimumTurns equivalence with a turn-by-turn reference", () => {
  // The original iterative deepening: one full optimizeQuest per (turn, attacker limit) pair.
  function reference(options: Parameters<typeof optimizeQuestMinimumTurns>[0]) {
    const { maxTurns = 6, maxAttackers = 3 + (options.maxBenchCount ?? 0), maxResults = 5, ...questOptions } = options;
    let closest: ReturnType<typeof optimizeQuest> = [];
    for (let turnCount = 1; turnCount <= maxTurns; turnCount += 1) {
      for (let attackerLimit = 1; attackerLimit <= maxAttackers; attackerLimit += 1) {
        const candidates = optimizeQuest({ ...questOptions, turnCount, maxAttackerCount: attackerLimit });
        const cleared = candidates.filter((candidate) => isQuestCleared(candidate.best.finalState));
        if (cleared.length > 0) {
          return { minimumTurns: turnCount, searchedThroughTurn: turnCount, attackerLimitUsed: attackerLimit, candidates: selectDiverseQuestCandidates(cleared, options.preferences, maxResults) };
        }
        if (attackerLimit === maxAttackers) closest = candidates;
      }
    }
    return { minimumTurns: null, searchedThroughTurn: maxTurns, attackerLimitUsed: null, candidates: selectDiverseQuestCandidates(closest, options.preferences, maxResults) };
  }

  const fingerprint = (result: ReturnType<typeof optimizeQuestMinimumTurns>) => ({
    minimumTurns: result.minimumTurns,
    searchedThroughTurn: result.searchedThroughTurn,
    attackerLimitUsed: result.attackerLimitUsed,
    candidates: result.candidates.map((candidate) => ({
      strategyKey: candidate.strategyKey,
      score: candidate.best.score,
      actions: candidate.best.actions,
      party: candidate.party.map((member) => [member.build.servantId, member.isSupport === true, member.isFrontLine]),
    })),
  });

  const firstEnemy = waveEnemy({ npcId: 9001, hp: 1 });
  const secondEnemy = waveEnemy({ npcId: 9101, hp: 1 });
  const twoWaves = [
    wave({ waveNumber: 1, initialEnemies: [firstEnemy], enemyPool: [firstEnemy] }),
    wave({ waveNumber: 2, initialEnemies: [secondEnemy], enemyPool: [secondEnemy] }),
  ];
  const boss = waveEnemy({ npcId: 9001, hp: 999999999 });
  const cases: readonly [string, Parameters<typeof optimizeQuestMinimumTurns>[0]][] = [
    ["a clear on turn 2 with two attackers", {
      shortlist: [candidate(1), candidate(2), candidate(3), candidate(4)], cePool: [], waves: twoWaves,
      costBudget: 1000, constants: CONSTANTS, resolveHitContext, maxTurns: 4, randomFn: () => 0,
    }],
    ["no clear within the turn limit", {
      shortlist: [candidate(1), candidate(2), candidate(3), candidate(4)], cePool: [], waves: [wave({ initialEnemies: [boss], enemyPool: [boss] })],
      costBudget: 1000, constants: CONSTANTS, resolveHitContext, maxTurns: 2, randomFn: () => 0,
    }],
    ["a borrowed support and a bench slot", {
      shortlist: [candidate(1), candidate(2), candidate(3)], supportCandidates: [candidate(1)], cePool: [], waves: twoWaves, maxBenchCount: 1,
      costBudget: 1000, constants: CONSTANTS, resolveHitContext, maxTurns: 3, randomFn: () => 0,
    }],
  ];

  for (const [name, options] of cases) {
    it(`matches the reference for ${name}`, () => {
      expect(fingerprint(optimizeQuestMinimumTurns(options))).toEqual(fingerprint(reference(options)));
    });
  }
});

describe("interchangeable CE copies", () => {
  it("searches each arrangement of identical copies once", () => {
    const data = { id: 9400340, atkGrowth: [0, 0, 300], hpGrowth: [0, 0, 150], cost: 12 } as unknown as CraftEssence.CraftEssence;
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [{ data, level: 1, limitBreakCount: 0, inventoryId: "a" }, { data, level: 1, limitBreakCount: 0, inventoryId: "b" }],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    // No CE (1) + one copy on any of 3 slots (3) + both copies on any 2 of 3 slots (3); 13 if copies were told apart.
    expect(results).toHaveLength(7);
    expect(results.filter((result) => result.party.filter((member) => member.equippedCe !== undefined).length === 2)
      .every((result) => new Set(result.party.map((member) => member.equippedCe?.inventoryId).filter(Boolean)).size === 2)).toBe(true);
  });

  it("still tells copies apart when their level or limit break differs", () => {
    const data = { id: 9400340, atkGrowth: [0, 0, 300], hpGrowth: [0, 0, 150], cost: 12 } as unknown as CraftEssence.CraftEssence;
    const results = optimizeQuest({
      shortlist: [candidate(1), candidate(2), candidate(3)],
      cePool: [{ data, level: 1, limitBreakCount: 0, inventoryId: "a" }, { data, level: 2, limitBreakCount: 0, inventoryId: "b" }],
      waves: [wave()],
      costBudget: 1000,
      constants: CONSTANTS,
      resolveHitContext,
      randomFn: () => 0,
    });
    expect(results).toHaveLength(13);
  });
});
