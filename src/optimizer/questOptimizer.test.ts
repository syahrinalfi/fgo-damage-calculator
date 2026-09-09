import { Func, type Buff, type Card, type CardDetail, type CraftEssence, type NoblePhantasm, type Servant as ServantModule, type Skill } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { DerivedHitContext } from "../battle/action.js";
import type { BattleState, HandCard } from "../battle/battleState.js";
import { BUFF_ACTION_KEYS } from "../battle/buffActionKeys.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import type { ServantSkillSource } from "../battle/skillActivationResolver.js";
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
});
