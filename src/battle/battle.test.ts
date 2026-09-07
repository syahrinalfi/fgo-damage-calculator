import type { Attribute as AttributeModule, Buff, Card, CardDetail, ClassName } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ActiveBuffInstance } from "../buffs/types.js";
import { BUFF_ACTION_KEYS } from "./buffActionKeys.js";
import { resolveCardTerm } from "./cardTerm.js";
import { resolveDamageInput, type DamageResolutionContext } from "./damageInput.js";
import type { BattleConstants } from "./gameConstants.js";
import { resolveUnitActionModifier, resolveUnitFlatActionTotal } from "./modifiers.js";
import { resolveAttackingNpGainInput, resolveDefendingNpGainInput } from "./npGainInput.js";
import { resolveStarDropInput } from "./starDropInput.js";
import { resolveAttributeTriangleModifier, resolveClassAttackBonus, resolveClassTriangleModifier } from "./triangle.js";
import { servantAtkAtLevel, traitIdSet, type BattleUnit } from "./unit.js";

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

function flatAction(plusType: string, minusType: string): Buff.BuffConstant {
  return {
    limit: "none" as Buff.BuffLimit,
    plusTypes: [plusType] as Buff.BuffType[],
    minusTypes: [minusType] as Buff.BuffType[],
    baseParam: 0,
    baseValue: 0,
    isRec: true,
    plusAction: 0,
    maxRate: [0],
  };
}

const BUFF_CONSTANTS = {
  [BUFF_ACTION_KEYS.ATK]: percentAction("upAtk", "downAtk"),
  [BUFF_ACTION_KEYS.DEFENCE]: percentAction("upDefence", "downDefence"),
  [BUFF_ACTION_KEYS.COMMAND_ATK]: percentAction("upCommandatk", "downCommandatk"),
  [BUFF_ACTION_KEYS.COMMAND_DEF]: percentAction("upDefenceCommanddamage", "downDefenceCommanddamage"),
  [BUFF_ACTION_KEYS.SPECIAL_DEFENCE]: percentAction("upSpecialdefence", "downSpecialdefence"),
  [BUFF_ACTION_KEYS.DAMAGE]: percentAction("upDamage", "downDamage", 1000),
  [BUFF_ACTION_KEYS.DAMAGE_INDIVIDUALITY]: percentAction("upDamageIndividuality", "downDamageIndividuality", 1000),
  [BUFF_ACTION_KEYS.DAMAGE_INDIVIDUALITY_ACTIVEONLY]: percentAction(
    "upDamageIndividualityActiveonly",
    "downDamageIndividualityActiveonly",
    1000,
  ),
  [BUFF_ACTION_KEYS.SELF_DAMAGE]: percentAction("upSelfdamage", "downSelfdamage", 1000),
  [BUFF_ACTION_KEYS.CRITICAL_DAMAGE]: percentAction("upCriticaldamage", "downCriticaldamage", 1000),
  [BUFF_ACTION_KEYS.NP_DAMAGE]: percentAction("upNpdamage", "downNpdamage", 1000),
  [BUFF_ACTION_KEYS.GIVEN_DAMAGE]: flatAction("addDamage", "subDamage"),
  [BUFF_ACTION_KEYS.RECEIVE_DAMAGE]: flatAction("addSelfdamage", "subSelfdamage"),
  [BUFF_ACTION_KEYS.COMMAND_NP_ATK]: percentAction("upCommandnp", "downCommandnp"),
  [BUFF_ACTION_KEYS.COMMAND_NP_DEF]: percentAction("upDefenceCommandnp", "downDefenceCommandnp"),
  [BUFF_ACTION_KEYS.DROP_NP]: percentAction("upDropnp", "downDropnp"),
  [BUFF_ACTION_KEYS.DROP_NP_DAMAGE]: percentAction("upDamagedropnp", "downDamagedropnp"),
  [BUFF_ACTION_KEYS.COMMAND_STAR_ATK]: percentAction("upCommandstar", "downCommandstar"),
  [BUFF_ACTION_KEYS.COMMAND_STAR_DEF]: percentAction("upDefenceCommandstar", "downDefenceCommandstar"),
  [BUFF_ACTION_KEYS.CRITICAL_POINT]: percentAction("upCriticalpoint", "downCriticalpoint", 1000),
} as unknown as Buff.BuffConstantMap;

const CARD_CONSTANTS = {
  "1": {
    1: {
      individuality: [],
      adjustAtk: 1000,
      adjustTdGauge: 3000,
      adjustCritical: 0,
      addAtk: 0,
      addTdGauge: 1000,
      addCritical: 0,
    },
  },
  "2": {
    1: {
      individuality: [],
      adjustAtk: 1200,
      adjustTdGauge: 1000,
      adjustCritical: 1400,
      addAtk: 300,
      addTdGauge: 0,
      addCritical: 50,
    },
  },
} as unknown as CardDetail.CardConstantMap;

const CONSTANTS: BattleConstants = {
  buff: BUFF_CONSTANTS,
  card: CARD_CONSTANTS,
  classAttack: { saber: 1000, archer: 1100 } as BattleConstants["classAttack"],
  classAffinity: { saber: { archer: 1500 }, archer: { saber: 500 } } as BattleConstants["classAffinity"],
  attribute: { human: { human: 1000, sky: 900 } } as BattleConstants["attribute"],
};

function makeUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    atk: 2000,
    className: "saber" as BattleUnit["className"],
    attribute: "human" as BattleUnit["attribute"],
    traits: new Set(),
    activeBuffs: [],
    ...overrides,
  };
}

function makeBuff(overrides: Partial<ActiveBuffInstance> = {}): ActiveBuffInstance {
  return {
    type: "upAtk" as ActiveBuffInstance["type"],
    amount: 200,
    ckSelfIndv: [],
    ckOpIndv: [],
    buffGroup: 0,
    ...overrides,
  };
}

const BUSTER = "2" as Card;
const ARTS = "1" as Card;
const SABER = "saber" as ClassName;
const ARCHER = "archer" as ClassName;
const RIDER = "rider" as ClassName;

describe("triangle helpers", () => {
  it("resolves a class's baseline attack rate from the live table", () => {
    expect(resolveClassAttackBonus(CONSTANTS, SABER)).toBeCloseTo(1.0, 10);
    expect(resolveClassAttackBonus(CONSTANTS, ARCHER)).toBeCloseTo(1.1, 10);
  });

  it("falls back to neutral 1.0 for a class absent from the table", () => {
    expect(resolveClassAttackBonus(CONSTANTS, RIDER)).toBe(1.0);
  });

  it("resolves the class triangle modifier directionally (advantage vs. disadvantage)", () => {
    expect(resolveClassTriangleModifier(CONSTANTS, SABER, ARCHER)).toBeCloseTo(1.5, 10);
    expect(resolveClassTriangleModifier(CONSTANTS, ARCHER, SABER)).toBeCloseTo(0.5, 10);
  });

  it("resolves the attribute triangle modifier", () => {
    const human = "human" as AttributeModule.Attribute;
    const sky = "sky" as AttributeModule.Attribute;
    expect(resolveAttributeTriangleModifier(CONSTANTS, human, sky)).toBeCloseTo(0.9, 10);
  });
});

describe("resolveCardTerm", () => {
  it("divides every NiceCard.json field down to the decimal-fraction convention", () => {
    const term = resolveCardTerm(CONSTANTS, BUSTER, 1);
    expect(term).toEqual({
      atkAdjust: 1.2,
      atkAdd: 0.3,
      npGaugeAdjust: 1.0,
      npGaugeAdd: 0,
      criticalAdjust: 1.4,
      criticalAdd: 0.05,
    });
  });

  it("throws for an unlisted type/position combination rather than silently zeroing the card term", () => {
    expect(() => resolveCardTerm(CONSTANTS, BUSTER, 3)).toThrow(RangeError);
  });
});

describe("unit helpers", () => {
  it("reads leveled ATK straight from atkGrowth", () => {
    expect(servantAtkAtLevel({ atkGrowth: [100, 200, 300] }, 2)).toBe(200);
  });

  it("throws for a level outside the atkGrowth array", () => {
    expect(() => servantAtkAtLevel({ atkGrowth: [100] }, 5)).toThrow(RangeError);
  });

  it("builds a trait-id set from a trait list", () => {
    expect(traitIdSet([{ id: 1 }, { id: 2 }])).toEqual(new Set([1, 2]));
  });
});

describe("resolveUnitActionModifier / resolveUnitFlatActionTotal", () => {
  const context = { holderTraits: new Set<number>(), targetTraits: new Set<number>() };

  it("returns 0 when the action key isn't in the constants map", () => {
    expect(resolveUnitActionModifier({} as Buff.BuffConstantMap, BUFF_ACTION_KEYS.ATK, [], context)).toBe(0);
    expect(resolveUnitFlatActionTotal({} as Buff.BuffConstantMap, BUFF_ACTION_KEYS.GIVEN_DAMAGE, [], context)).toBe(0);
  });

  it("resolves a percentage action to a decimal fraction", () => {
    const buffs = [makeBuff({ amount: 300 })];
    expect(resolveUnitActionModifier(BUFF_CONSTANTS, BUFF_ACTION_KEYS.ATK, buffs, context)).toBeCloseTo(0.3, 10);
  });

  it("sums a flat action's raw amount without any /1000 scaling", () => {
    const buffs = [makeBuff({ type: "addDamage" as ActiveBuffInstance["type"], amount: 3000 })];
    expect(resolveUnitFlatActionTotal(BUFF_CONSTANTS, BUFF_ACTION_KEYS.GIVEN_DAMAGE, buffs, context)).toBe(3000);
  });

  it("nets a flat action's minus type as a subtraction, allowing a negative total", () => {
    const buffs = [makeBuff({ type: "subSelfdamage" as ActiveBuffInstance["type"], amount: 500 })];
    expect(resolveUnitFlatActionTotal(BUFF_CONSTANTS, BUFF_ACTION_KEYS.RECEIVE_DAMAGE, buffs, context)).toBe(-500);
  });
});

describe("resolveDamageInput", () => {
  const baseContext: DamageResolutionContext = {
    card: { type: BUSTER, position: 1 },
    npDamageMultiplier: 1,
    randomModifier: 1,
    isCrit: false,
    extraCardChainType: "none",
    isSuperEffective: false,
    superEffectiveModifier: 1,
    isNP: false,
    isBusterChain: false,
  };

  it("assembles a DamageInput matching manual calculation with no active buffs", () => {
    const attacker = makeUnit();
    const defender = makeUnit({ className: ARCHER });
    const input = resolveDamageInput(attacker, defender, CONSTANTS, baseContext);

    expect(input.servantAtk).toBe(2000);
    expect(input.cardDamageValue).toBeCloseTo(1.2, 10);
    expect(input.firstCardBonus).toBeCloseTo(0.3, 10);
    expect(input.cardMod).toBe(0);
    expect(input.classAtkBonus).toBeCloseTo(1.0, 10);
    expect(input.triangleModifier).toBeCloseTo(1.5, 10);
    expect(input.attributeModifier).toBeCloseTo(1.0, 10);
    expect(input.atkMod).toBe(0);
    expect(input.defMod).toBe(0);
    expect(input.powerMod).toBe(0);
    expect(input.dmgPlusAdd).toBe(0);
    expect(input.selfDmgCutAdd).toBe(0);
  });

  it("nets the attacker's commandAtk against the defender's commandDef into cardMod", () => {
    const attacker = makeUnit({
      activeBuffs: [makeBuff({ type: "upCommandatk" as ActiveBuffInstance["type"], amount: 300 })],
    });
    const defender = makeUnit({
      activeBuffs: [makeBuff({ type: "downDefenceCommanddamage" as ActiveBuffInstance["type"], amount: 100 })],
    });
    const input = resolveDamageInput(attacker, defender, CONSTANTS, baseContext);
    expect(input.cardMod).toBeCloseTo(0.4, 10);
  });

  it("sums all three powerMod sub-actions on the attacker's side", () => {
    const attacker = makeUnit({
      activeBuffs: [
        makeBuff({ type: "upDamage" as ActiveBuffInstance["type"], amount: 100 }),
        makeBuff({ type: "upDamageIndividuality" as ActiveBuffInstance["type"], amount: 200 }),
        makeBuff({ type: "upDamageIndividualityActiveonly" as ActiveBuffInstance["type"], amount: 50 }),
      ],
    });
    const input = resolveDamageInput(attacker, makeUnit(), CONSTANTS, baseContext);
    expect(input.powerMod).toBeCloseTo(0.35, 10);
  });

  it("keeps dmgPlusAdd/selfDmgCutAdd as raw flat totals, not divided by 1000", () => {
    const attacker = makeUnit({
      activeBuffs: [makeBuff({ type: "addDamage" as ActiveBuffInstance["type"], amount: 3000 })],
    });
    const defender = makeUnit({
      activeBuffs: [makeBuff({ type: "subSelfdamage" as ActiveBuffInstance["type"], amount: 500 })],
    });
    const input = resolveDamageInput(attacker, defender, CONSTANTS, baseContext);
    expect(input.dmgPlusAdd).toBe(3000);
    expect(input.selfDmgCutAdd).toBe(-500);
  });

  it("excludes a buff whose ckOpIndv trait gate the defender doesn't satisfy", () => {
    const attacker = makeUnit({ activeBuffs: [makeBuff({ ckOpIndv: [{ id: 2002, name: "dragon" }] })] });
    const input = resolveDamageInput(attacker, makeUnit(), CONSTANTS, baseContext);
    expect(input.atkMod).toBe(0);
  });
});

describe("resolveAttackingNpGainInput / resolveDefendingNpGainInput", () => {
  it("assembles the attacking NP-gain input, nesting commandNpAtk against commandNpDef", () => {
    const attacker = makeUnit({
      activeBuffs: [makeBuff({ type: "upCommandnp" as ActiveBuffInstance["type"], amount: 200 })],
    });
    const defender = makeUnit();
    const input = resolveAttackingNpGainInput(attacker, defender, CONSTANTS, {
      card: { type: ARTS, position: 1 },
      offensiveNPRate: 69,
      enemyServerMod: 1,
      isCrit: false,
      isOverkill: false,
    });

    expect(input.offensiveNPRate).toBe(69);
    expect(input.firstCardBonus).toBeCloseTo(1.0, 10);
    expect(input.cardNpValue).toBeCloseTo(3.0, 10);
    expect(input.cardMod).toBeCloseTo(0.2, 10);
    expect(input.npChargeRateMod).toBe(0);
  });

  it("assembles the defending NP-gain input from the defender's own dropNp/dropNpDamage buffs", () => {
    const defender = makeUnit({
      activeBuffs: [
        makeBuff({ type: "upDropnp" as ActiveBuffInstance["type"], amount: 200 }),
        makeBuff({ type: "upDamagedropnp" as ActiveBuffInstance["type"], amount: 100 }),
      ],
    });
    const input = resolveDefendingNpGainInput(defender, makeUnit(), CONSTANTS, {
      defensiveNPRate: 500,
      enemyServerMod: 1,
    });
    expect(input.defensiveNPRate).toBe(500);
    expect(input.npChargeRateMod).toBeCloseTo(0.2, 10);
    expect(input.defensiveChargeRateMod).toBeCloseTo(0.1, 10);
  });
});

describe("resolveStarDropInput", () => {
  it("assembles the star-drop input, nesting commandStarAtk against commandStarDef", () => {
    const attacker = makeUnit({
      activeBuffs: [makeBuff({ type: "upCommandstar" as ActiveBuffInstance["type"], amount: 300 })],
    });
    const defender = makeUnit();
    const input = resolveStarDropInput(attacker, defender, CONSTANTS, {
      card: { type: BUSTER, position: 1 },
      baseStarRate: 0.06,
      serverRate: 0,
      isCrit: false,
      isOverkill: false,
    });

    expect(input.baseStarRate).toBe(0.06);
    expect(input.firstCardBonus).toBeCloseTo(0.05, 10);
    expect(input.cardStarValue).toBeCloseTo(1.4, 10);
    expect(input.cardMod).toBeCloseTo(0.3, 10);
  });

  it("resolves starDropMod/enemyStarDropMod from each side's own criticalPoint buffs", () => {
    const attacker = makeUnit({
      activeBuffs: [makeBuff({ type: "upCriticalpoint" as ActiveBuffInstance["type"], amount: 50 })],
    });
    const defender = makeUnit({
      activeBuffs: [makeBuff({ type: "downCriticalpoint" as ActiveBuffInstance["type"], amount: 20 })],
    });
    const input = resolveStarDropInput(attacker, defender, CONSTANTS, {
      card: { type: BUSTER, position: 1 },
      baseStarRate: 0.06,
      serverRate: 0,
      isCrit: false,
      isOverkill: false,
    });
    expect(input.starDropMod).toBeCloseTo(0.05, 10);
    expect(input.enemyStarDropMod).toBeCloseTo(-0.02, 10);
  });
});
