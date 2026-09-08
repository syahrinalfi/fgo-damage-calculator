import type { Card, NoblePhantasm } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { EnemyInstance, HandCard, ServantInstance } from "./battleState.js";
import { resolveCardHitContext } from "./hitContextResolver.js";

const BUSTER = "2" as Card;
const ARTS = "1" as Card;
const QUICK = "3" as Card;
const EXTRA = "4" as Card;
const NP_STUB = "5" as Card;

function servant(overrides: Partial<ServantInstance> = {}): ServantInstance {
  return {
    servantId: 1,
    isFrontLine: true,
    cardTypes: [BUSTER, BUSTER, ARTS, ARTS, QUICK],
    npLevel: 2,
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
    serverMod: { tdRate: 1200, tdAttackRate: 1200, starRate: 800 },
    ...overrides,
  };
}

const NP_GAIN: NoblePhantasm.NoblePhantasmGain = {
  buster: [50, 55, 60, 65, 70],
  arts: [69, 74, 79, 84, 89],
  quick: [40, 45, 50, 55, 60],
  extra: [30, 35, 40, 45, 50],
  defence: [0, 0, 0, 0, 0],
  np: [0, 0, 0, 0, 0],
};

function handCard(card: Card): HandCard {
  return { card, servantId: 1 };
}

describe("resolveCardHitContext", () => {
  it("resolves offensiveNPRate from npGain.buster at the servant's NP level (1-indexed)", () => {
    const result = resolveCardHitContext(handCard(BUSTER), servant({ npLevel: 2 }), NP_GAIN, enemy(), () => 0);
    expect(result.offensiveNPRate).toBe(55); // buster[1] for npLevel 2
    expect(result.card).toEqual({ type: BUSTER, position: 1 });
  });

  it("picks the arts/quick/extra field to match the card type", () => {
    expect(resolveCardHitContext(handCard(ARTS), servant({ npLevel: 1 }), NP_GAIN, enemy(), () => 0).offensiveNPRate).toBe(69);
    expect(resolveCardHitContext(handCard(QUICK), servant({ npLevel: 1 }), NP_GAIN, enemy(), () => 0).offensiveNPRate).toBe(40);
    expect(resolveCardHitContext(handCard(EXTRA), servant({ npLevel: 1 }), NP_GAIN, enemy(), () => 0).offensiveNPRate).toBe(30);
  });

  it("rolls randomModifier within the sourced 0.90-1.10 band from randomFn", () => {
    expect(resolveCardHitContext(handCard(BUSTER), servant(), NP_GAIN, enemy(), () => 0).randomModifier).toBeCloseTo(0.9, 10);
    expect(resolveCardHitContext(handCard(BUSTER), servant(), NP_GAIN, enemy(), () => 1).randomModifier).toBeCloseTo(1.1, 10);
    expect(resolveCardHitContext(handCard(BUSTER), servant(), NP_GAIN, enemy(), () => 0.5).randomModifier).toBeCloseTo(1.0, 10);
  });

  it("reads npEnemyServerMod/starEnemyServerMod straight off the target enemy's serverMod", () => {
    const result = resolveCardHitContext(handCard(BUSTER), servant(), NP_GAIN, enemy({ serverMod: { tdRate: 1500, tdAttackRate: 1000, starRate: 300 } }), () => 0);
    expect(result.npEnemyServerMod).toBe(1500);
    expect(result.starEnemyServerMod).toBe(300);
  });

  it("reads baseStarRate straight off the acting servant's starGen", () => {
    const result = resolveCardHitContext(handCard(BUSTER), servant({ starGen: 42 }), NP_GAIN, enemy(), () => 0);
    expect(result.baseStarRate).toBe(42);
  });

  it("leaves npDamageMultiplier/isNP/isSuperEffective/superEffectiveModifier at their fixed non-NP, unsourced-superEffective defaults", () => {
    const result = resolveCardHitContext(handCard(BUSTER), servant(), NP_GAIN, enemy(), () => 0);
    expect(result.npDamageMultiplier).toBe(1);
    expect(result.isNP).toBe(false);
    expect(result.isSuperEffective).toBe(false);
    expect(result.superEffectiveModifier).toBe(1);
  });

  it("throws for the NP card stub (never a real hand slot)", () => {
    expect(() => resolveCardHitContext(handCard(NP_STUB), servant(), NP_GAIN, enemy(), () => 0)).toThrow(RangeError);
  });

  it("throws when npGain has no entry for the servant's NP level", () => {
    const shortGain: NoblePhantasm.NoblePhantasmGain = { ...NP_GAIN, buster: [50] };
    expect(() => resolveCardHitContext(handCard(BUSTER), servant({ npLevel: 5 }), shortGain, enemy(), () => 0)).toThrow(RangeError);
  });
});
