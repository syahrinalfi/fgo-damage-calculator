import { Card, Func, type Buff, type DataVal, type NoblePhantasm } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { BattleState, EnemyInstance, ServantInstance } from "../battle/battleState.js";
import { resolveNpAttackOption } from "./npActivationResolver.js";

function dataVals(values: readonly Partial<DataVal.DataVal>[]): DataVal.DataVal[] {
  return values as DataVal.DataVal[];
}

function buff(type: Buff.BuffType = "upNpdamage" as Buff.BuffType): Buff.Buff {
  return { type, buffGroup: 0, vals: [], ckSelfIndv: [], ckOpIndv: [] } as unknown as Buff.Buff;
}

function func(overrides: Partial<Func.Func>): Func.Func {
  return {
    funcId: 1,
    funcType: Func.FuncType.NONE,
    funcTargetType: Func.FuncTargetType.SELF,
    funcTargetTeam: Func.FuncTargetTeam.PLAYER,
    functvals: [],
    funcquestTvals: [],
    overWriteTvalsList: [],
    funcPopupText: "",
    buffs: [],
    svals: dataVals([{}]),
    ...overrides,
  } as unknown as Func.Func;
}

function np(overrides: Partial<NoblePhantasm.NoblePhantasm> = {}): NoblePhantasm.NoblePhantasm {
  return {
    id: 1001,
    num: 1,
    npNum: 1,
    card: Card.BUSTER,
    name: "Test NP",
    originalName: "Test NP",
    ruby: "",
    rank: "A",
    type: "antiUnit",
    effectFlags: ["attackEnemyOne" as NoblePhantasm.NoblePhantasmEffectFlag],
    npGain: { buster: [50], arts: [50], quick: [50], extra: [50], defence: [50], np: [80] },
    npDistribution: [30, 70],
    strengthStatus: 0,
    priority: 0,
    condQuestId: 0,
    condQuestPhase: 0,
    individuality: [],
    script: {},
    functions: [],
    ...overrides,
  } as unknown as NoblePhantasm.NoblePhantasm;
}

function servant(overrides: Partial<ServantInstance> = {}): ServantInstance {
  return {
    servantId: 1,
    isFrontLine: true,
    cardTypes: [Card.BUSTER, Card.BUSTER, Card.ARTS, Card.ARTS, Card.QUICK],
    npLevel: 1,
    atk: 10000,
    className: "saber" as ServantInstance["className"],
    attribute: "human" as ServantInstance["attribute"],
    traits: new Set(),
    currentHp: 15000,
    maxHp: 15000,
    currentNpGauge: 15000,
    activeBuffs: [],
    skillCooldowns: [0, 0, 0],
    criticalWeight: 100,
    starGen: 60,
    ...overrides,
  };
}

function enemy(npcId: number, overrides: Partial<EnemyInstance> = {}): EnemyInstance {
  return {
    npcId,
    atk: 1000,
    className: "lancer" as EnemyInstance["className"],
    attribute: "earth" as EnemyInstance["attribute"],
    traits: new Set(),
    currentHp: 100000,
    maxHp: 100000,
    activeBuffs: [],
    currentNpTurns: 0,
    npTurnLimit: 5,
    deathRate: 1000,
    readyToNp: false,
    serverMod: { tdRate: 1000, tdAttackRate: 1000, starRate: 1000 },
    ...overrides,
  };
}

function state(enemies: readonly EnemyInstance[] = [enemy(9001)]): BattleState {
  return {
    waves: [],
    currentWaveIndex: 0,
    currentTurn: 1,
    servants: [servant()],
    enemies,
    handCards: [],
    cardBag: [],
    starsCarried: 0,
    handCardStars: [],
    critChanceBonusCarried: 0,
    activeCritChanceBonus: 0,
    fieldTraits: new Set(),
    costSpent: 0,
    costBudget: 100,
    commandSealsRemaining: 0,
    consecutiveNpChainCount: 0,
    mysticCodeSkillCooldowns: [0, 0, 0],
  };
}

describe("resolveNpAttackOption", () => {
  it("splits damage by hit distribution and preserves modeled pre/post-damage function order", () => {
    const pre = func({ funcType: Func.FuncType.ADD_STATE_SHORT, funcTargetType: Func.FuncTargetType.SELF, buffs: [buff()], svals: dataVals([{ Value: 200, Turn: 1 }]), svals2: dataVals([{ Value: 300, Turn: 1 }]), svals3: dataVals([{ Value: 300, Turn: 1 }]) });
    const damage = func({ funcType: Func.FuncType.DAMAGE_NP, funcTargetType: Func.FuncTargetType.ENEMY, svals: dataVals([{ Value: 4500 }]), svals2: dataVals([{ Value: 6000 }]), svals3: dataVals([{ Value: 6000 }]) });
    const post = func({ funcType: Func.FuncType.GAIN_NP, funcTargetType: Func.FuncTargetType.SELF, svals: dataVals([{ Value: 1000 }]), svals2: dataVals([{ Value: 2000 }]), svals3: dataVals([{ Value: 2000 }]) });
    const option = resolveNpAttackOption(state(), 1, np({ functions: [pre, damage, post] }), 9001, () => 0.5);
    expect(option).toBeDefined();
    expect(option?.hitContexts?.[0]?.npDamageMultiplier).toBeCloseTo(1.35);
    expect(option?.hitContexts?.[1]?.npDamageMultiplier).toBeCloseTo(3.15);
    expect(option?.effectsBeforeDamage).toHaveLength(1);
    expect(option?.effects).toEqual([{ kind: "gainNp", rawAmount: 1000, targetType: "self" }]);

    const oc2 = option?.resolveForNpChainBonus?.(1);
    expect(oc2?.hitContexts?.[0]?.npDamageMultiplier).toBeCloseTo(1.8);
    expect(oc2?.hitContexts?.[1]?.npDamageMultiplier).toBeCloseTo(4.2);
    expect(oc2?.effects).toEqual([{ kind: "gainNp", rawAmount: 2000, targetType: "self" }]);
  });

  it("builds target-specific hit contexts for an AoE NP", () => {
    const damage = func({ funcType: Func.FuncType.DAMAGE_NP, funcTargetType: Func.FuncTargetType.ENEMY_ALL, svals: dataVals([{ Value: 3000 }]), svals2: dataVals([{ Value: 3000 }]), svals3: dataVals([{ Value: 3000 }]) });
    const option = resolveNpAttackOption(
      state([enemy(9001, { serverMod: { tdRate: 800, tdAttackRate: 1000, starRate: 900 } }), enemy(9002, { serverMod: { tdRate: 1200, tdAttackRate: 1000, starRate: 1100 } })]),
      1,
      np({ effectFlags: ["attackEnemyAll" as NoblePhantasm.NoblePhantasmEffectFlag], npDistribution: [100], functions: [damage] }),
      9001,
      () => 0.5,
    );
    expect(option?.targetNpcIds).toEqual([9001, 9002]);
    expect(option?.targetHitContexts?.map((target) => target.hitContexts[0]?.npEnemyServerMod)).toEqual([0.8, 1.2]);
    expect(option?.targetHitContexts?.map((target) => target.hitContexts[0]?.starEnemyServerMod)).toEqual([0.9, 1.1]);
  });

  it("marks damageNpPierce hit contexts to ignore ordinary defense", () => {
    const damage = func({
      funcType: Func.FuncType.DAMAGE_NP_PIERCE,
      funcTargetType: Func.FuncTargetType.ENEMY,
      svals: dataVals([{ Value: 4500 }]),
      svals2: dataVals([{ Value: 4500 }]),
      svals3: dataVals([{ Value: 4500 }]),
    });
    const option = resolveNpAttackOption(state(), 1, np({ functions: [damage] }), 9001, () => 0.5);
    expect(option?.context.ignoreDefense).toBe(true);
    expect(option?.hitContexts?.every((context) => context.ignoreDefense)).toBe(true);
  });

  it("resolves damageNpIndividual super-effective damage independently per target and OC stage", () => {
    const damage = func({
      funcType: Func.FuncType.DAMAGE_NP_INDIVIDUAL,
      funcTargetType: Func.FuncTargetType.ENEMY_ALL,
      svals: dataVals([{ Value: 3000, Target: 2002, Correction: 1500 }]),
      svals2: dataVals([{ Value: 3000, Target: 2002, Correction: 2000 }]),
      svals3: dataVals([{ Value: 3000, Target: 2002, Correction: 2000 }]),
    });
    const option = resolveNpAttackOption(
      state([
        enemy(9001, { traits: new Set([2002]) }),
        enemy(9002, { traits: new Set([1000]) }),
      ]),
      1,
      np({ effectFlags: ["attackEnemyAll" as NoblePhantasm.NoblePhantasmEffectFlag], npDistribution: [100], functions: [damage] }),
      9001,
      () => 0.5,
    );
    expect(option?.targetHitContexts?.map((target) => ({
      targetNpcId: target.targetNpcId,
      isSuperEffective: target.hitContexts[0]?.isSuperEffective,
      modifier: target.hitContexts[0]?.superEffectiveModifier,
    }))).toEqual([
      { targetNpcId: 9001, isSuperEffective: true, modifier: 1.5 },
      { targetNpcId: 9002, isSuperEffective: false, modifier: 1.5 },
    ]);
    expect(option?.resolveForNpChainBonus?.(1).targetHitContexts?.[0]?.hitContexts[0]?.superEffectiveModifier).toBe(2);
  });

  it("scales damageNpHpratioLow linearly from the caster's current HP ratio", () => {
    const damage = func({
      funcType: Func.FuncType.DAMAGE_NP_HPRATIO_LOW,
      funcTargetType: Func.FuncTargetType.ENEMY,
      svals: dataVals([{ Value: 6000, Target: 4000 }]),
      svals2: dataVals([{ Value: 6000, Target: 6000 }]),
      svals3: dataVals([{ Value: 6000, Target: 6000 }]),
    });
    const halfHpState = { ...state(), servants: [servant({ currentHp: 7500, maxHp: 15000 })] };
    const option = resolveNpAttackOption(
      halfHpState,
      1,
      np({ npDistribution: [100], functions: [damage] }),
      9001,
      () => 0.5,
    );
    expect(option?.context.npDamageMultiplier).toBe(8);
    expect(option?.resolveForNpChainBonus?.(1).context.npDamageMultiplier).toBe(9);
  });

  it("rejects conditional damage variants with missing condition parameters", () => {
    const individualWithoutTarget = func({
      funcType: Func.FuncType.DAMAGE_NP_INDIVIDUAL,
      funcTargetType: Func.FuncTargetType.ENEMY,
      svals: dataVals([{ Value: 4500 }]),
      svals2: dataVals([{ Value: 4500 }]),
      svals3: dataVals([{ Value: 4500 }]),
    });
    const lowHpWithoutMaximumBonus = func({
      funcType: Func.FuncType.DAMAGE_NP_HPRATIO_LOW,
      funcTargetType: Func.FuncTargetType.ENEMY,
      svals: dataVals([{ Value: 6000 }]),
      svals2: dataVals([{ Value: 6000 }]),
      svals3: dataVals([{ Value: 6000 }]),
    });
    expect(resolveNpAttackOption(state(), 1, np({ functions: [individualWithoutTarget] }), 9001, () => 0.5)).toBeUndefined();
    expect(resolveNpAttackOption(state(), 1, np({ functions: [lowHpWithoutMaximumBonus] }), 9001, () => 0.5)).toBeUndefined();
  });

  it("supports a non-damaging support NP as an effect-only attack slot", () => {
    const partyCharge = func({ funcType: Func.FuncType.GAIN_NP, funcTargetType: Func.FuncTargetType.PT_ALL, svals: dataVals([{ Value: 1000 }]), svals2: dataVals([{ Value: 1000 }]), svals3: dataVals([{ Value: 1000 }]) });
    const option = resolveNpAttackOption(
      state(),
      1,
      np({ card: Card.ARTS, effectFlags: ["support" as NoblePhantasm.NoblePhantasmEffectFlag], npDistribution: [], functions: [partyCharge] }),
      9001,
      () => 0.5,
    );
    expect(option?.hitContexts).toEqual([]);
    expect(option?.effectsBeforeDamage).toEqual([{ kind: "gainNp", rawAmount: 1000, targetType: "ptAll" }]);
  });

  it("skips an NP whose damage function is not yet modeled instead of approximating it", () => {
    const unsupported = func({ funcType: Func.FuncType.DAMAGE_NP_INDIVIDUAL, funcTargetType: Func.FuncTargetType.ENEMY, svals: dataVals([{ Value: 4500 }]) });
    expect(resolveNpAttackOption(state(), 1, np({ functions: [unsupported] }), 9001, () => 0.5)).toBeUndefined();
  });

  it("rejects malformed hit distributions instead of changing total NP damage", () => {
    const damage = func({ funcType: Func.FuncType.DAMAGE_NP, funcTargetType: Func.FuncTargetType.ENEMY, svals: dataVals([{ Value: 4500 }]), svals2: dataVals([{ Value: 4500 }]), svals3: dataVals([{ Value: 4500 }]) });
    expect(resolveNpAttackOption(state(), 1, np({ npDistribution: [20, 20], functions: [damage] }), 9001, () => 0.5)).toBeUndefined();
  });
});
