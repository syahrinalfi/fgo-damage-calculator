import { describe, expect, it } from "vitest";
import { calculateStarDropChance, type StarDropInput } from "./starDrop.js";

function makeInput(overrides: Partial<StarDropInput> = {}): StarDropInput {
  return {
    baseStarRate: 0.06,
    firstCardBonus: 0,
    cardStarValue: 0.1,
    cardMod: 0,
    serverRate: 0,
    starDropMod: 0,
    enemyStarDropMod: 0,
    isCrit: false,
    isOverkill: false,
    ...overrides,
  };
}

describe("calculateStarDropChance", () => {
  it("sums the neutral baseline terms", () => {
    expect(calculateStarDropChance(makeInput())).toBeCloseTo(0.16, 10);
  });

  it("adds the flat crit-generation bonus only on a critical hit", () => {
    expect(calculateStarDropChance(makeInput({ isCrit: true }))).toBeCloseTo(0.36, 10);
    expect(calculateStarDropChance(makeInput({ isCrit: false }))).toBeCloseTo(0.16, 10);
  });

  it("applies the Overkill rate multiplier (no-op) and flat add together", () => {
    expect(calculateStarDropChance(makeInput({ isOverkill: true }))).toBeCloseTo(0.46, 10);
  });

  it("subtracts the defender's star-drop resistance", () => {
    expect(calculateStarDropChance(makeInput({ enemyStarDropMod: 0.05 }))).toBeCloseTo(0.11, 10);
  });

  it("adds the attacker's own star-drop-up buff-action total", () => {
    expect(calculateStarDropChance(makeInput({ starDropMod: 0.05 }))).toBeCloseTo(0.21, 10);
  });

  it("adds the server-supplied per-hit star-rate modifier", () => {
    expect(calculateStarDropChance(makeInput({ serverRate: 0.04 }))).toBeCloseTo(0.2, 10);
  });

  it("floors the card term's (1 + cardMod) factor at 0 under a heavy debuff", () => {
    expect(calculateStarDropChance(makeInput({ cardMod: -2 }))).toBeCloseTo(0.06, 10);
  });
});
