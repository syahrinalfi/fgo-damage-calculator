import { describe, expect, it } from "vitest";
import { calculateHitDamage, type DamageInput } from "./damage.js";

function makeInput(overrides: Partial<DamageInput> = {}): DamageInput {
  return {
    servantAtk: 2000,
    npDamageMultiplier: 1,
    firstCardBonus: 0,
    cardDamageValue: 1,
    cardMod: 0,
    classAtkBonus: 1,
    triangleModifier: 1,
    attributeModifier: 1,
    randomModifier: 1,
    atkMod: 0,
    defMod: 0,
    isCrit: false,
    extraCardChainType: "none",
    specialDefMod: 0,
    powerMod: 0,
    selfDamageMod: 0,
    critDamageMod: 0,
    isNP: false,
    npDamageMod: 0,
    superEffectiveModifier: 1,
    isSuperEffective: false,
    dmgPlusAdd: 0,
    selfDmgCutAdd: 0,
    isBusterChain: false,
    ...overrides,
  };
}

describe("calculateHitDamage", () => {
  it("computes a fully-neutral hit as servantAtk * ATTACK_RATE", () => {
    expect(calculateHitDamage(makeInput())).toBe(460);
  });

  it("doubles the neutral hit on a critical (term 10)", () => {
    expect(calculateHitDamage(makeInput({ isCrit: true }))).toBe(920);
  });

  it("floors the atk/def term at 0 rather than going negative (term 09)", () => {
    expect(calculateHitDamage(makeInput({ atkMod: -2 }))).toBe(0);
  });

  it("floors the term-13 bucket at 0.001, not 0, under heavy debuffs", () => {
    expect(calculateHitDamage(makeInput({ powerMod: -2 }))).toBe(0);
  });

  it("applies the Grand Extra Attack multiplier (term 11)", () => {
    expect(calculateHitDamage(makeInput({ extraCardChainType: "grand" }))).toBe(1610);
  });

  it("adds the flat Buster-chain bonus (term 17) on top of the per-card formula", () => {
    expect(calculateHitDamage(makeInput({ isBusterChain: true }))).toBe(860);
  });

  it("applies the super-effective bonus only when isSuperEffective is true (term 14)", () => {
    expect(calculateHitDamage(makeInput({ superEffectiveModifier: 1.5, isSuperEffective: true }))).toBe(690);
    expect(calculateHitDamage(makeInput({ superEffectiveModifier: 1.5, isSuperEffective: false }))).toBe(460);
  });

  it("adds flat additive terms 15/16 after the multiplicative chain", () => {
    expect(calculateHitDamage(makeInput({ dmgPlusAdd: 100, selfDmgCutAdd: -50 }))).toBe(510);
  });

  it("never returns negative damage even under a maximally-debuffed hit", () => {
    expect(calculateHitDamage(makeInput({ atkMod: -10, selfDmgCutAdd: -100000 }))).toBe(0);
  });
});
