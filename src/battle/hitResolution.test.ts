import type { Buff, CardDetail } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ActiveBuffInstance } from "../buffs/types.js";
import { calculateHitDamage } from "../engine/damage.js";
import { BUFF_ACTION_KEYS } from "./buffActionKeys.js";
import type { BattleConstants } from "./gameConstants.js";
import { resolveDamageInput } from "./damageInput.js";
import { resolveHit, type HitResolutionContext } from "./hitResolution.js";
import type { BattleUnit } from "./unit.js";

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
  classAttack: { saber: 1000 } as BattleConstants["classAttack"],
  classAffinity: { saber: { saber: 1000 } } as BattleConstants["classAffinity"],
  attribute: { human: { human: 1000 } } as BattleConstants["attribute"],
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

const CONTEXT: HitResolutionContext = {
  card: { type: "2" as HitResolutionContext["card"]["type"], position: 1 },
  chainLeadCardType: "2" as HitResolutionContext["card"]["type"],
  isCrit: false,
  npDamageMultiplier: 1,
  randomModifier: 1,
  extraCardChainType: "none",
  isSuperEffective: false,
  superEffectiveModifier: 1,
  isNP: false,
  isBusterChain: false,
  isMightyChain: false,
  offensiveNPRate: 500,
  npEnemyServerMod: 1,
  baseStarRate: 500,
  starEnemyServerMod: 0,
};

describe("resolveHit", () => {
  it("matches resolveDamageInput/calculateHitDamage directly when unblocked", () => {
    const attacker = makeUnit();
    const defender = makeUnit();
    const result = resolveHit(attacker, defender, 100_000, 100_000, CONSTANTS, CONTEXT);

    const expectedDamage = calculateHitDamage(
      resolveDamageInput(attacker, defender, CONSTANTS, {
        card: CONTEXT.card,
        chainLeadCardType: CONTEXT.chainLeadCardType,
        npDamageMultiplier: CONTEXT.npDamageMultiplier,
        randomModifier: CONTEXT.randomModifier,
        isCrit: CONTEXT.isCrit,
        extraCardChainType: CONTEXT.extraCardChainType,
        isSuperEffective: CONTEXT.isSuperEffective,
        superEffectiveModifier: CONTEXT.superEffectiveModifier,
        isNP: CONTEXT.isNP,
        isBusterChain: CONTEXT.isBusterChain,
        isMightyChain: CONTEXT.isMightyChain,
      }),
    );

    expect(result.defense).toEqual({ blocked: false, tier: null });
    expect(result.damage).toBe(expectedDamage);
    expect(result.damage).toBeGreaterThan(0);
    expect(result.hpAfterDamage).toBe(100_000 - expectedDamage);
    expect(result.defeated).toBe(false);
  });

  it("gates damage to 0 when the defender's Evade blocks the hit, but still yields NP gain and star-drop chance normally", () => {
    const attacker = makeUnit();
    const defender = makeUnit({
      activeBuffs: [makeBuff({ type: "avoidance" as ActiveBuffInstance["type"], buffGroup: 200 })],
    });
    const result = resolveHit(attacker, defender, 100_000, 100_000, CONSTANTS, CONTEXT);

    expect(result.defense).toEqual({ blocked: true, tier: "avoidance" });
    expect(result.damage).toBe(0);
    expect(result.hpAfterDamage).toBe(100_000);
    expect(result.npGain).toBeGreaterThan(0);
    expect(result.starDropChance).toBeGreaterThan(0);
    expect(result.defeated).toBe(false);
  });

  it("marks a hit Overkill when damage exceeds the defender's remaining HP, and reflects it in NP gain", () => {
    const attacker = makeUnit();
    const defender = makeUnit();
    const lowHpResult = resolveHit(attacker, defender, 1, 100_000, CONSTANTS, CONTEXT);
    const highHpResult = resolveHit(attacker, defender, 100_000, 100_000, CONSTANTS, CONTEXT);

    expect(lowHpResult.isOverkill).toBe(true);
    expect(highHpResult.isOverkill).toBe(false);
    expect(lowHpResult.npGain).toBeGreaterThan(highHpResult.npGain);
  });

  it("does not count an exact kill (damage equal to remaining HP) as Overkill", () => {
    const attacker = makeUnit();
    const defender = makeUnit();
    const expectedDamage = calculateHitDamage(
      resolveDamageInput(attacker, defender, CONSTANTS, {
        card: CONTEXT.card,
        chainLeadCardType: CONTEXT.chainLeadCardType,
        npDamageMultiplier: CONTEXT.npDamageMultiplier,
        randomModifier: CONTEXT.randomModifier,
        isCrit: CONTEXT.isCrit,
        extraCardChainType: CONTEXT.extraCardChainType,
        isSuperEffective: CONTEXT.isSuperEffective,
        superEffectiveModifier: CONTEXT.superEffectiveModifier,
        isNP: CONTEXT.isNP,
        isBusterChain: CONTEXT.isBusterChain,
        isMightyChain: CONTEXT.isMightyChain,
      }),
    );

    const result = resolveHit(attacker, defender, expectedDamage, 100_000, CONSTANTS, CONTEXT);

    expect(result.hpAfterDamage).toBe(0);
    expect(result.isOverkill).toBe(false);
    expect(result.defeated).toBe(true);
  });

  it("revives the defender via an active Guts buff instead of marking it defeated", () => {
    const attacker = makeUnit();
    const defender = makeUnit({
      activeBuffs: [makeBuff({ type: "guts" as ActiveBuffInstance["type"], amount: 500, buffGroup: 600 })],
    });
    const result = resolveHit(attacker, defender, 1, 100_000, CONSTANTS, CONTEXT);

    expect(result.hpAfterDamage).toBeLessThanOrEqual(0);
    expect(result.guts.triggered).toBe(true);
    expect(result.defenderHpFinal).toBe(50_000);
    expect(result.defeated).toBe(false);
  });

  it("marks the defender defeated at 0-or-below HP with no active Guts", () => {
    const attacker = makeUnit();
    const defender = makeUnit();
    const result = resolveHit(attacker, defender, 1, 100_000, CONSTANTS, CONTEXT);

    expect(result.hpAfterDamage).toBeLessThanOrEqual(0);
    expect(result.guts.triggered).toBe(false);
    expect(result.defenderHpFinal).toBe(0);
    expect(result.defeated).toBe(true);
  });
});
