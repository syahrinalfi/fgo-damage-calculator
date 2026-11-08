import { Func, type Buff, type DataVal, type NoblePhantasm, type Skill, type Trait } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { resolveNpEffects, resolveSkillEffects } from "./funcInterpreter.js";

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

function np(functions: readonly Func.Func[]): Pick<NoblePhantasm.NoblePhantasm, "functions"> {
  return { functions: [...functions] };
}

/** Builds a per-NP-level array (5 entries) for one Overcharge-stage `svalsN` field — `values[i]` is that field's entry for NP level `i + 1`. */
function ocLevelArray(values: readonly Partial<DataVal.DataVal>[]): DataVal.DataVal[] {
  return values.map((v) => v as DataVal.DataVal);
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

  it("resolves an enemy-targeted addStateShort into an EnemyBuffGrantEffect carrying its Rate", () => {
    const f = func({
      funcType: Func.FuncType.ADD_STATE_SHORT,
      funcTargetType: Func.FuncTargetType.ENEMY_ALL,
      buffs: [buff({ type: "downDefence" as Buff.BuffType })],
      svals: [{ Value: 300, Turn: 3, Rate: 1000 }],
    });
    expect(resolveSkillEffects(skill([f]), 1)).toEqual({
      effects: [{ kind: "grantEnemyBuff", buff: { type: "downDefence", amount: 300, ckSelfIndv: [], ckOpIndv: [], buffGroup: 0, vals: new Set([100]) }, rawTurn: 3, rawCount: -1, rawChance: 1000, targetType: "enemyAll" }],
      unmodeled: [],
    });
  });

  it("resolves an after-attack trigger buff's attached skill at its Value2 level", () => {
    const triggered = { functions: [func({ funcType: Func.FuncType.GAIN_NP, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 500 }, { Value: 1000 }] })] };
    const f = {
      ...func({
        funcType: Func.FuncType.ADD_STATE_SHORT,
        funcTargetType: Func.FuncTargetType.PT_ONE,
        buffs: [buff({ type: "commandattackAfterFunctionMainOnly" as Buff.BuffType })],
        svals: [{ Value: 966533, Value2: 2, Turn: 3 }],
      }),
      triggerSkills: { 966533: triggered },
    } as unknown as Func.Func;
    const [effect] = resolveSkillEffects(skill([f]), 1).effects;
    expect(effect?.kind === "grantBuff" ? effect.buff.afterAttack : undefined).toEqual({ mainOnly: true, effects: [{ kind: "gainNp", rawAmount: 1000, targetType: "self" }] });
  });

  it("grants a presence buff with no Value (e.g. Invincible) at amount 0 instead of dropping the skill", () => {
    const f = func({ funcType: Func.FuncType.ADD_STATE, funcTargetType: Func.FuncTargetType.PT_ONE, buffs: [buff({ type: "invincible" as Buff.BuffType })], svals: [{ Turn: 1, Count: 1 }] });
    expect(resolveSkillEffects(skill([f]), 1)).toMatchObject({ effects: [{ kind: "grantBuff", buff: { type: "invincible", amount: 0 }, rawTurn: 1, rawCount: 1, targetType: "ptOne" }], unmodeled: [] });
  });

  it("maps ptOther and ptOtherFull to the allies other than the caster", () => {
    const grant = (funcTargetType: Func.FuncTargetType) => resolveSkillEffects(skill([func({ funcType: Func.FuncType.ADD_STATE_SHORT, funcTargetType, buffs: [buff()], svals: [{ Value: 300, Turn: 3 }] })]), 1).effects[0];
    expect(grant(Func.FuncTargetType.PT_OTHER)).toMatchObject({ kind: "grantBuff", targetType: "ptOther" });
    expect(grant(Func.FuncTargetType.PT_OTHER_FULL)).toMatchObject({ kind: "grantBuff", targetType: "ptOtherFull" });
  });

  it("drops a self NP-type switch (tdTypeChange) so the selected NP form is kept", () => {
    const keep = func({ funcType: Func.FuncType.ADD_STATE_SHORT, funcTargetType: Func.FuncTargetType.SELF, buffs: [buff({ type: "upNpdamage" as Buff.BuffType })], svals: [{ Value: 200, Turn: 3 }] });
    const change = func({ funcType: Func.FuncType.ADD_STATE_SHORT, funcTargetType: Func.FuncTargetType.COMMAND_TYPE_SELF_TREASURE_DEVICE, buffs: [buff({ type: "tdTypeChangeArts" as Buff.BuffType })], svals: [{ Turn: 3 }] });
    const result = resolveSkillEffects(skill([keep, change]), 1);
    expect(result.unmodeled).toEqual([]);
    expect(result.effects).toHaveLength(1);
  });

  it("flags an unsupported funcTargetType (ptRandom) as unmodeled rather than guessing", () => {
    const f = func({
      funcType: Func.FuncType.ADD_STATE,
      funcTargetType: Func.FuncTargetType.PT_RANDOM,
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
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "lossHpSafe", amount: 500, targetType: "self" }]);
  });

  it("lossHp", () => {
    const f = func({ funcType: Func.FuncType.LOSS_HP, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 1000 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "lossHp", amount: 1000, targetType: "self" }]);
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

  it("drops an enemy-targeted lossNp without flagging it — confirmed a no-op, not a gap", () => {
    const f = func({ funcType: Func.FuncType.LOSS_NP, funcTargetType: Func.FuncTargetType.ENEMY, svals: [{ Value: 2000 }] });
    expect(resolveSkillEffects(skill([f]), 1)).toEqual({ effects: [], unmodeled: [] });
  });
});

describe("resolveSkillEffects — delayNpturn (enemy-real, self-no-op)", () => {
  it("resolves an enemy-targeted delayNpturn into a DelayNpTurnEffect", () => {
    const f = func({ funcType: Func.FuncType.DELAY_NPTURN, funcTargetType: Func.FuncTargetType.ENEMY_ALL, svals: [{ Value: 1 }] });
    expect(resolveSkillEffects(skill([f]), 1).effects).toEqual([{ kind: "delayNpTurn", rawTurns: 1, targetType: "enemyAll" }]);
  });

  it("drops a self-targeted delayNpturn without flagging it — confirmed a no-op, not a gap", () => {
    const f = func({ funcType: Func.FuncType.DELAY_NPTURN, funcTargetType: Func.FuncTargetType.SELF, svals: [{ Value: 1 }] });
    expect(resolveSkillEffects(skill([f]), 1)).toEqual({ effects: [], unmodeled: [] });
  });
});

describe("resolveSkillEffects — hastenNpturn (ally-no-op, enemy-unmodeled)", () => {
  it("drops an ally-targeted hastenNpturn so the rest of the skill stays usable", () => {
    const gain = func({ funcType: Func.FuncType.GAIN_NP, funcTargetType: Func.FuncTargetType.PT_ONE, svals: [{ Value: 5000 }] });
    const hasten = func({ funcType: Func.FuncType.HASTEN_NPTURN, funcTargetType: Func.FuncTargetType.PT_ONE, svals: [{ Value: 1 }] });
    expect(resolveSkillEffects(skill([gain, hasten]), 1)).toEqual({ effects: [{ kind: "gainNp", rawAmount: 5000, targetType: "ptOne" }], unmodeled: [] });
  });

  it("still flags an enemy-targeted hastenNpturn, which charges the enemy's NP", () => {
    const f = func({ funcType: Func.FuncType.HASTEN_NPTURN, funcTargetType: Func.FuncTargetType.ENEMY, svals: [{ Value: 1 }] });
    expect(resolveSkillEffects(skill([f]), 1).unmodeled).toEqual([Func.FuncType.HASTEN_NPTURN]);
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

describe("resolveNpEffects — instantDeath/forceInstantDeath (NP-only, Overcharge-indexed)", () => {
  it("picks the Overcharge-stage array first, then the NP-level entry within it, reading Rate not Value", () => {
    const f = func({
      funcType: Func.FuncType.INSTANT_DEATH,
      funcTargetType: Func.FuncTargetType.ENEMY,
      svals: ocLevelArray([{ Rate: 600 }, { Rate: 600 }, { Rate: 600 }, { Rate: 600 }, { Rate: 600 }]),
      svals2: ocLevelArray([{ Rate: 700 }, { Rate: 700 }, { Rate: 700 }, { Rate: 700 }, { Rate: 700 }]),
      svals3: ocLevelArray([{ Rate: 800 }, { Rate: 800 }, { Rate: 800 }, { Rate: 800 }, { Rate: 800 }]),
    } as Partial<Func.Func>);
    const result = resolveNpEffects(np([f]), 2, 3);
    expect(result.unmodeled).toEqual([]);
    expect(result.effects).toEqual([{ kind: "instantDeath", deathRate: 800, targetType: "enemyOne" }]);
  });

  it("resolves enemyAll instantDeath at stage 1 (plain svals, not svals1)", () => {
    const f = func({
      funcType: Func.FuncType.INSTANT_DEATH,
      funcTargetType: Func.FuncTargetType.ENEMY_ALL,
      svals: ocLevelArray([{ Rate: 500 }]),
    } as Partial<Func.Func>);
    expect(resolveNpEffects(np([f]), 1, 1).effects).toEqual([{ kind: "instantDeath", deathRate: 500, targetType: "enemyAll" }]);
  });

  it("flags instantDeath as unmodeled when the requested stage's svalsN array is entirely absent", () => {
    const f = func({
      funcType: Func.FuncType.INSTANT_DEATH,
      funcTargetType: Func.FuncTargetType.ENEMY,
      svals: ocLevelArray([{ Rate: 500 }]),
      // no svals2 — stage 2 requested below
    } as Partial<Func.Func>);
    const result = resolveNpEffects(np([f]), 1, 2);
    expect(result.effects).toEqual([]);
    expect(result.unmodeled).toEqual([Func.FuncType.INSTANT_DEATH]);
  });

  it("flags instantDeath as unmodeled when a self-targeted (unsupported) funcTargetType is used", () => {
    const f = func({
      funcType: Func.FuncType.INSTANT_DEATH,
      funcTargetType: Func.FuncTargetType.SELF,
      svals: ocLevelArray([{ Rate: 500 }]),
    } as Partial<Func.Func>);
    expect(resolveNpEffects(np([f]), 1, 1).unmodeled).toEqual([Func.FuncType.INSTANT_DEATH]);
  });

  it("resolves forceInstantDeath with no numeric field, ally-only", () => {
    const f = func({
      funcType: Func.FuncType.FORCE_INSTANT_DEATH,
      funcTargetType: Func.FuncTargetType.SELF,
      svals: ocLevelArray([{ Rate: 5000 }]),
    } as Partial<Func.Func>);
    expect(resolveNpEffects(np([f]), 1, 1).effects).toEqual([{ kind: "forceInstantDeath", targetType: "self" }]);
  });
});

describe("resolveNpEffects — shared FuncType handling with resolveSkillEffects", () => {
  it("also resolves an ordinary skill-shared FuncType (gainNp) via the same OC+NP-level double index", () => {
    const f = func({
      funcType: Func.FuncType.GAIN_NP,
      funcTargetType: Func.FuncTargetType.SELF,
      svals: ocLevelArray([{ Value: 1000 }, { Value: 2000 }]),
      svals2: ocLevelArray([{ Value: 1500 }, { Value: 2500 }]),
    } as Partial<Func.Func>);
    expect(resolveNpEffects(np([f]), 2, 2).effects).toEqual([{ kind: "gainNp", rawAmount: 2500, targetType: "self" }]);
  });

  it("flags a func as unmodeled when the NP-level entry within the selected stage array is missing", () => {
    const f = func({
      funcType: Func.FuncType.GAIN_NP,
      funcTargetType: Func.FuncTargetType.SELF,
      svals: ocLevelArray([{ Value: 1000 }]),
    } as Partial<Func.Func>);
    const result = resolveNpEffects(np([f]), 3, 1);
    expect(result.effects).toEqual([]);
    expect(result.unmodeled).toEqual([Func.FuncType.GAIN_NP]);
  });
});
