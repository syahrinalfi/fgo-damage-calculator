import { Func, type Buff, type Skill, type Trait } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { resolveSkillEffects } from "./funcInterpreter.js";

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

function skill(functions: readonly Func.Func[]): Pick<Skill.Skill, "functions"> {
  return { functions: [...functions] };
}

describe("resolveSkillEffects — addState/addStateShort", () => {
  it("resolves a self-targeted addState into a BuffGrantEffect at the given skill level, defaulting an absent Count to -1 (unlimited)", () => {
    const f = func({
      funcType: Func.FuncType.ADD_STATE,
      funcTargetType: Func.FuncTargetType.SELF,
      buffs: [buff()],
      svals: [{ Value: 200, Turn: 3 }, { Value: 300, Turn: 3 }],
    });
    const result = resolveSkillEffects(skill([f]), 2);
    expect(result.unmodeled).toEqual([]);
    expect(result.effects).toEqual([
      { kind: "grantBuff", buff: { type: "upAtk", amount: 300, ckSelfIndv: [], ckOpIndv: [], buffGroup: 0, vals: new Set([100]) }, rawTurn: 3, rawCount: -1, targetType: "self" },
    ]);
  });

  it("emits one BuffGrantEffect per buff when a func grants multiple simultaneous buffs", () => {
    const f = func({
      funcType: Func.FuncType.ADD_STATE_SHORT,
      funcTargetType: Func.FuncTargetType.PT_ALL,
      buffs: [buff({ type: "upAtk" as Buff.BuffType }), buff({ type: "upDefence" as Buff.BuffType })],
      svals: [{ Value: 100, Turn: 1, Count: 1 }],
    });
    const result = resolveSkillEffects(skill([f]), 1);
    expect(result.effects).toHaveLength(2);
    expect(result.effects.map((e) => (e.kind === "grantBuff" ? e.buff.type : null))).toEqual(["upAtk", "upDefence"]);
  });

  it("flags an unsupported funcTargetType (ptOther) as unmodeled rather than guessing", () => {
    const f = func({
      funcType: Func.FuncType.ADD_STATE,
      funcTargetType: Func.FuncTargetType.PT_OTHER,
      buffs: [buff()],
      svals: [{ Value: 200, Turn: 3 }],
    });
    const result = resolveSkillEffects(skill([f]), 1);
    expect(result.effects).toEqual([]);
    expect(result.unmodeled).toEqual([Func.FuncType.ADD_STATE]);
  });
});

describe("resolveSkillEffects — subState", () => {
  it("reads the dispel trait from the func's own functvals", () => {
    const f = func({
      funcType: Func.FuncType.SUB_STATE,
      funcTargetType: Func.FuncTargetType.ENEMY,
      functvals: [trait(1000)],
      svals: [{}],
    });
    const result = resolveSkillEffects(skill([f]), 1);
    expect(result.effects).toEqual([{ kind: "removeBuff", targetTrait: 1000, targetType: "enemyOne" }]);
  });

  it("flags as unmodeled when functvals is empty (no dispel trait to target)", () => {
    const f = func({ funcType: Func.FuncType.SUB_STATE, funcTargetType: Func.FuncTargetType.ENEMY_ALL, functvals: [], svals: [{}] });
    const result = resolveSkillEffects(skill([f]), 1);
    expect(result.unmodeled).toEqual([Func.FuncType.SUB_STATE]);
  });
});

describe("resolveSkillEffects — flat numeric effects", () => {
  it("gainNp", () => {
    const f = func({ funcType: Func.FuncType.GAIN_NP, funcTargetType: Func.FuncTargetType.PT_ONE, svals: [{ Value: 3000 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "gainNp", rawAmount: 3000, targetType: "ptOne" }]);
  });

  it("gainHp", () => {
    const f = func({ funcType: Func.FuncType.GAIN_HP, funcTargetType: Func.FuncTargetType.PT_ALL, svals: [{ Value: 5000 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "gainHp", rawAmount: 5000, targetType: "ptAll" }]);
  });

  it("gainHpPer", () => {
    const f = func({ funcType: Func.FuncType.GAIN_HP_PER, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 3000 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "gainHpPercent", rawPercent: 3000, targetType: "self" }]);
  });

  it("revival", () => {
    const f = func({ funcType: Func.FuncType.REVIVAL, funcTargetType: Func.FuncTargetType.PT_ONE, svals: [{}] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "revival", targetType: "ptOne" }]);
  });

  it("gainStar (no targetType, Master-wide)", () => {
    const f = func({ funcType: Func.FuncType.GAIN_STAR, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Rate: 1000, Value: 10 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "gainStar", rawAmount: 10 }]);
  });

  it("lossStar (no targetType, Master-wide)", () => {
    const f = func({ funcType: Func.FuncType.LOSS_STAR, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 5 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "lossStar", rawAmount: 5 }]);
  });

  it("lossHpSafe", () => {
    const f = func({ funcType: Func.FuncType.LOSS_HP_SAFE, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 500 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "lossHpSafe", rawPercent: 500, targetType: "self" }]);
  });

  it("lossHp", () => {
    const f = func({ funcType: Func.FuncType.LOSS_HP, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 1000 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "lossHpPercent", rawPercent: 1000, targetType: "self" }]);
  });

  it("shortenSkill", () => {
    const f = func({ funcType: Func.FuncType.SHORTEN_SKILL, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 1 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "shortenSkill", rawTurns: 1, targetType: "self" }]);
  });
});

describe("resolveSkillEffects — lossNp (ally-real, enemy-no-op)", () => {
  it("resolves a self-targeted lossNp into a LossNpEffect", () => {
    const f = func({ funcType: Func.FuncType.LOSS_NP, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 1000 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "lossNp", rawAmount: 1000, targetType: "self" }]);
  });

  it("flags an enemy-targeted lossNp as unmodeled — confirmed a no-op, not a gap", () => {
    const f = func({ funcType: Func.FuncType.LOSS_NP, funcTargetType: Func.FuncTargetType.ENEMY, svals: [{ Value: 2000 }] });
    const result = resolveSkillEffects(skill([f]), 1);
    expect(result.effects).toEqual([]);
    expect(result.unmodeled).toEqual([Func.FuncType.LOSS_NP]);
  });
});

describe("resolveSkillEffects — delayNpturn (enemy-real, self-no-op)", () => {
  it("resolves an enemy-targeted delayNpturn into a DelayNpTurnEffect", () => {
    const f = func({ funcType: Func.FuncType.DELAY_NPTURN, funcTargetType: Func.FuncTargetType.ENEMY_ALL, svals: [{ Value: 1 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "delayNpTurn", rawTurns: 1, targetType: "enemyAll" }]);
  });

  it("flags a self-targeted delayNpturn as unmodeled — confirmed a no-op, not a gap", () => {
    const f = func({ funcType: Func.FuncType.DELAY_NPTURN, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 1 }] });
    const result = resolveSkillEffects(skill([f]), 1);
    expect(result.effects).toEqual([]);
    expect(result.unmodeled).toEqual([Func.FuncType.DELAY_NPTURN]);
  });
});

describe("resolveSkillEffects — out-of-scope funcTypes and malformed input", () => {
  it("flags an out-of-scope FuncType (e.g. damage) as unmodeled", () => {
    const f = func({ funcType: Func.FuncType.DAMAGE, funcTargetType: Func.FuncTargetType.ENEMY, svals: [{ Value: 1000 }] });
    const result = resolveSkillEffects(skill([f]), 1);
    expect(result.effects).toEqual([]);
    expect(result.unmodeled).toEqual([Func.FuncType.DAMAGE]);
  });

  it("flags a func with no svals entry at the requested skill level as unmodeled, without throwing", () => {
    const f = func({ funcType: Func.FuncType.GAIN_NP, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 1000 }] });
    const result = resolveSkillEffects(skill([f]), 5);
    expect(result.effects).toEqual([]);
    expect(result.unmodeled).toEqual([Func.FuncType.GAIN_NP]);
  });

  it("resolves multiple functions independently, mixing modeled and unmodeled results", () => {
    const gainNpFunc = func({ funcType: Func.FuncType.GAIN_NP, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 1000 }] });
    const damageFunc = func({ funcType: Func.FuncType.DAMAGE, funcTargetType: Func.FuncTargetType.ENEMY, svals: [{ Value: 1000 }] });
    const result = resolveSkillEffects(skill([gainNpFunc, damageFunc]), 1);
    expect(result.effects).toEqual([{ kind: "gainNp", rawAmount: 1000, targetType: "self" }]);
    expect(result.unmodeled).toEqual([Func.FuncType.DAMAGE]);
  });
});
