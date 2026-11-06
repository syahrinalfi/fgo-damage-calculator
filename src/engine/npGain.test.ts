import { describe, expect, it } from "vitest";
import {
  calculateAttackingNpGain,
  calculateDefendingNpGain,
  rawGaugeToPercent,
  type AttackingNpGainInput,
  type DefendingNpGainInput,
} from "./npGain.js";

function makeAttackingInput(overrides: Partial<AttackingNpGainInput> = {}): AttackingNpGainInput {
  return {
    offensiveNPRate: 69,
    firstCardBonus: 1.0,
    cardNpValue: 3.0,
    cardMod: 0,
    enemyServerMod: 1,
    npChargeRateMod: 0,
    isCrit: false,
    isOverkill: false,
    ...overrides,
  };
}

describe("rawGaugeToPercent", () => {
  it("converts raw gauge units to a percentage using FULL_TD_POINT", () => {
    expect(rawGaugeToPercent(5000)).toBe(50);
    expect(rawGaugeToPercent(10000)).toBe(100);
  });
});

describe("calculateAttackingNpGain", () => {
  it("matches research/04's worked Space Ishtar example (1st-position Arts, non-crit, no Overkill)", () => {
    expect(calculateAttackingNpGain(makeAttackingInput())).toBe(276);
  });

  it("converts to the expected gauge percentage for the worked example", () => {
    expect(rawGaugeToPercent(calculateAttackingNpGain(makeAttackingInput()))).toBeCloseTo(2.76, 5);
  });

  it("applies the crit multiplier before the first floor", () => {
    expect(calculateAttackingNpGain(makeAttackingInput({ isCrit: true }))).toBe(552);
  });

  it("applies the Overkill multiplier after the first floor, as an outer step", () => {
    const base = calculateAttackingNpGain(makeAttackingInput());
    expect(calculateAttackingNpGain(makeAttackingInput({ isOverkill: true }))).toBe(Math.floor(base * 1.5));
  });

  it("floors the inner product before Overkill is applied, not after", () => {
    // offensiveNPRate/cardNpValue chosen so the inner product is 13.9: flooring before
    // applying Overkill gives floor(13) * 1.5 = 19.5 -> 19, while flooring only once at
    // the end would give floor(13.9 * 1.5) = floor(20.85) -> 20 — the two orders diverge,
    // so this actually discriminates the intermediate-floor behavior instead of just
    // happening to agree with it for a value that doesn't cross an integer boundary.
    const input = makeAttackingInput({ offensiveNPRate: 10, cardNpValue: 0.39, isOverkill: true });
    const cardTerm = 1.0 + 0.39 * 1;
    const innerProduct = 10 * cardTerm;
    expect(innerProduct).toBeCloseTo(13.9, 5);

    const flooredFirst = Math.floor(Math.floor(innerProduct) * 1.5);
    const flooredOnlyAtEnd = Math.floor(innerProduct * 1.5);
    expect(flooredFirst).not.toBe(flooredOnlyAtEnd);

    expect(calculateAttackingNpGain(input)).toBe(flooredFirst);
  });
});

function makeDefendingInput(overrides: Partial<DefendingNpGainInput> = {}): DefendingNpGainInput {
  return {
    defensiveNPRate: 500,
    enemyServerMod: 1,
    npChargeRateMod: 0,
    defensiveChargeRateMod: 0,
    isOverkill: false,
    ...overrides,
  };
}

describe("calculateDefendingNpGain", () => {
  it("computes a neutral defending hit as defensiveNPRate * enemyServerMod", () => {
    expect(calculateDefendingNpGain(makeDefendingInput())).toBe(500);
  });

  it("applies the defender's own NP-gain-up", () => {
    expect(calculateDefendingNpGain(makeDefendingInput({ npChargeRateMod: 0.5 }))).toBe(750);
  });

  it("applies Overkill as an outer step: floor, multiply by OVER_KILL_NP_RATE, floor again", () => {
    expect(calculateDefendingNpGain(makeDefendingInput({ isOverkill: true }))).toBe(750);
    const input = makeDefendingInput({ defensiveNPRate: 301, defensiveChargeRateMod: 0.003, isOverkill: true });
    const inner = 301 * 1.003; // 301.903
    expect(Math.floor(Math.floor(inner) * 1.5)).not.toBe(Math.floor(inner * 1.5));
    expect(calculateDefendingNpGain(input)).toBe(Math.floor(Math.floor(inner) * 1.5));
  });

  it("applies both the defender's own gain-up and damage-taken-based gain-up multiplicatively", () => {
    expect(
      calculateDefendingNpGain(makeDefendingInput({ npChargeRateMod: 0.2, defensiveChargeRateMod: 0.1 })),
    ).toBe(Math.floor(500 * 1.2 * 1.1));
  });
});
