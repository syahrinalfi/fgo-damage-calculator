import { Func, type Buff, type Skill, type Trait } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { BattleState, ServantInstance } from "./battleState.js";
import { resolveSkillActivationOptions, type ServantSkillSource, type SkillSlotSource } from "./skillActivationResolver.js";

function trait(id: number): Trait.Trait {
  return { id, name: `trait${id}` } as unknown as Trait.Trait;
}

function func(overrides: Partial<Func.Func> = {}): Func.Func {
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
    svals: [],
    ...overrides,
  } as unknown as Func.Func;
}

function buff(overrides: Partial<Buff.Buff> = {}): Buff.Buff {
  return {
    type: "upAtk" as Buff.BuffType,
    buffGroup: 0,
    vals: [trait(100)],
    ckSelfIndv: [],
    ckOpIndv: [],
    ...overrides,
  } as unknown as Buff.Buff;
}

function skillSlot(functions: readonly Func.Func[], coolDown: readonly number[] = [7, 6, 5, 5, 4, 4, 3, 3, 2, 2], level = 1): SkillSlotSource {
  return { skill: { functions: [...functions], coolDown: [...coolDown] } as Pick<Skill.Skill, "functions" | "coolDown">, level };
}

const EMPTY_SLOT = skillSlot([]);

function servant(servantId: number, overrides: Partial<ServantInstance> = {}): ServantInstance {
  return {
    servantId,
    isFrontLine: true,
    cardTypes: [],
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

function state(servants: readonly ServantInstance[]): BattleState {
  return {
    waves: [],
    currentWaveIndex: 0,
    currentTurn: 1,
    servants,
    enemies: [],
    handCards: [],
    cardBag: [],
    starsCarried: 0,
    handCardStars: [],
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

const SELF_BUFF_FUNC = func({ funcType: Func.FuncType.ADD_STATE, funcTargetType: Func.FuncTargetType.SELF, buffs: [buff()], svals: [{ Value: 200, Turn: 3 }] });
const PT_ONE_BUFF_FUNC = func({ funcType: Func.FuncType.ADD_STATE, funcTargetType: Func.FuncTargetType.PT_ONE, buffs: [buff()], svals: [{ Value: 200, Turn: 3 }] });
const UNMODELED_FUNC = func({ funcType: Func.FuncType.ADD_STATE, funcTargetType: Func.FuncTargetType.PT_OTHER, buffs: [buff()], svals: [{ Value: 200, Turn: 3 }] });
const ENEMY_DISPEL_FUNC = func({ funcType: Func.FuncType.SUB_STATE, funcTargetType: Func.FuncTargetType.ENEMY, functvals: [trait(300)] });

describe("resolveSkillActivationOptions", () => {
  it("resolves a self-targeted skill on cooldown 0 with no targetServantId needed", () => {
    const source: ServantSkillSource = { servantId: 1, skills: [skillSlot([SELF_BUFF_FUNC]), EMPTY_SLOT, EMPTY_SLOT] };
    const result = resolveSkillActivationOptions(state([servant(1)]), [source]);
    expect(result).toEqual([
      { type: "useSkill", servantId: 1, skillSlot: 1, effects: expect.any(Array), cooldownTurns: 7 },
    ]);
  });

  it("skips a skill slot whose cooldown is not yet 0", () => {
    const source: ServantSkillSource = { servantId: 1, skills: [skillSlot([SELF_BUFF_FUNC]), EMPTY_SLOT, EMPTY_SLOT] };
    const result = resolveSkillActivationOptions(state([servant(1, { skillCooldowns: [3, 0, 0] })]), [source]);
    expect(result).toEqual([]);
  });

  it("skips a benched (non-front-line) servant's source entirely", () => {
    const source: ServantSkillSource = { servantId: 1, skills: [skillSlot([SELF_BUFF_FUNC]), EMPTY_SLOT, EMPTY_SLOT] };
    const result = resolveSkillActivationOptions(state([servant(1, { isFrontLine: false })]), [source]);
    expect(result).toEqual([]);
  });

  it("skips a skill with any unmodeled function rather than partially representing it", () => {
    const source: ServantSkillSource = { servantId: 1, skills: [skillSlot([UNMODELED_FUNC]), EMPTY_SLOT, EMPTY_SLOT] };
    const result = resolveSkillActivationOptions(state([servant(1)]), [source]);
    expect(result).toEqual([]);
  });

  it("skips a skill with an enemy-targeted removeBuff effect (no target enemy in scope)", () => {
    const source: ServantSkillSource = { servantId: 1, skills: [skillSlot([ENEMY_DISPEL_FUNC]), EMPTY_SLOT, EMPTY_SLOT] };
    const result = resolveSkillActivationOptions(state([servant(1)]), [source]);
    expect(result).toEqual([]);
  });

  it("defaults a ptOne effect's targetServantId to the acting servant itself", () => {
    const source: ServantSkillSource = { servantId: 1, skills: [skillSlot([PT_ONE_BUFF_FUNC]), EMPTY_SLOT, EMPTY_SLOT] };
    const result = resolveSkillActivationOptions(state([servant(1)]), [source]);
    expect(result[0]?.type === "useSkill" && result[0]?.targetServantId).toBe(1);
  });

  it("honors a caller-supplied defaultTargetServantId override for ptOne effects", () => {
    const source: ServantSkillSource = { servantId: 1, skills: [skillSlot([PT_ONE_BUFF_FUNC]), EMPTY_SLOT, EMPTY_SLOT] };
    const result = resolveSkillActivationOptions(state([servant(1), servant(2)]), [source], { defaultTargetServantId: () => 2 });
    expect(result[0]?.type === "useSkill" && result[0]?.targetServantId).toBe(2);
  });

  it("resolves all 3 off-cooldown slots for a servant, in slot order", () => {
    const source: ServantSkillSource = { servantId: 1, skills: [skillSlot([SELF_BUFF_FUNC]), skillSlot([SELF_BUFF_FUNC]), skillSlot([SELF_BUFF_FUNC])] };
    const result = resolveSkillActivationOptions(state([servant(1)]), [source]);
    expect(result).toHaveLength(3);
    expect(result.map((r) => (r.type === "useSkill" ? r.skillSlot : null))).toEqual([1, 2, 3]);
  });

  it("resolves across multiple servants", () => {
    const sourceA: ServantSkillSource = { servantId: 1, skills: [skillSlot([SELF_BUFF_FUNC]), EMPTY_SLOT, EMPTY_SLOT] };
    const sourceB: ServantSkillSource = { servantId: 2, skills: [skillSlot([SELF_BUFF_FUNC]), EMPTY_SLOT, EMPTY_SLOT] };
    const result = resolveSkillActivationOptions(state([servant(1), servant(2)]), [sourceA, sourceB]);
    expect(result.map((r) => (r.type === "useSkill" ? r.servantId : null))).toEqual([1, 2]);
  });
});
