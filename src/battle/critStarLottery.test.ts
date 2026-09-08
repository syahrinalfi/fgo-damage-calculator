import type { Card } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { HandCard, ServantInstance } from "./battleState.js";
import { shuffleCards } from "./cardBag.js";
import { allocateCritStars, critChanceForStars, rollIsCrit } from "./critStarLottery.js";

const BUSTER = "2" as Card;

function servant(servantId: number, criticalWeight: number): ServantInstance {
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
    criticalWeight,
  };
}

function handCard(servantId: number): HandCard {
  return { card: BUSTER, servantId };
}

describe("allocateCritStars", () => {
  it("allocates every star to the single first positive-weight slot when randomFn always returns 0", () => {
    const servants = [servant(1, 0), servant(2, 0)];
    const hand = [handCard(1), handCard(1), handCard(2), handCard(2), handCard(2)];
    const stars = allocateCritStars(hand, servants, 7, () => 0);

    // With every servant's own criticalWeight at 0, only the shuffled +50/+20/+20/0/0 slot bonus matters.
    const bonuses = shuffleCards([50, 20, 20, 0, 0], () => 0);
    const firstPositiveSlot = bonuses.findIndex((w) => w > 0);

    expect(stars.reduce((a, b) => a + b, 0)).toBe(7);
    expect(stars[firstPositiveSlot]).toBe(7);
    stars.forEach((count, index) => {
      if (index !== firstPositiveSlot) {
        expect(count).toBe(0);
      }
    });
  });

  it("weights allocation heavily toward the hand slot of the servant with the highest criticalWeight", () => {
    const servants = [servant(1, 1000), servant(2, 0)];
    const hand = [handCard(2), handCard(2), handCard(2), handCard(2), handCard(1)];
    // randomFn = 0.9999 makes shuffleCards's Fisher-Yates a no-op (every swap index equals itself),
    // so the slot bonuses stay [50, 20, 20, 0, 0] and weights become [50, 20, 20, 0, 1000] (total 1090).
    // roll = 0.9999 * 1090 ≈ 1089.89, which only exceeds the cumulative weight at the last (index 4) slot.
    const stars = allocateCritStars(hand, servants, 50, () => 0.9999);
    expect(stars).toEqual([0, 0, 0, 0, 50]);
  });

  it("returns one count per hand slot, summing to starCount", () => {
    const servants = [servant(1, 30)];
    const hand = Array.from({ length: 5 }, () => handCard(1));
    const stars = allocateCritStars(hand, servants, 12, Math.random);
    expect(stars).toHaveLength(5);
    expect(stars.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it("throws for an empty hand", () => {
    expect(() => allocateCritStars([], [], 5)).toThrow(RangeError);
  });

  it("throws for a negative starCount", () => {
    expect(() => allocateCritStars([handCard(1)], [servant(1, 50)], -1)).toThrow(RangeError);
  });

  it("throws when a hand card's servantId isn't in the servants list", () => {
    expect(() => allocateCritStars([handCard(999)], [servant(1, 50)], 3)).toThrow(RangeError);
  });

  it("throws when the hand's total critical weight is not positive", () => {
    const servants = [servant(1, -20)];
    const hand = Array.from({ length: 5 }, () => handCard(1));
    // total = (50 + 20 + 20 + 0 + 0) + 5 * (-20) = 90 - 100 = -10
    expect(() => allocateCritStars(hand, servants, 3, () => 0)).toThrow(RangeError);
  });
});

describe("critChanceForStars", () => {
  it("is 10% per star", () => {
    expect(critChanceForStars(0)).toBe(0);
    expect(critChanceForStars(3)).toBeCloseTo(0.3);
  });

  it("caps at 100%, never exceeding certain-crit", () => {
    expect(critChanceForStars(10)).toBe(1);
    expect(critChanceForStars(15)).toBe(1);
  });
});

describe("rollIsCrit", () => {
  it("crits when the roll lands below the chance", () => {
    expect(rollIsCrit(0.5, () => 0.49)).toBe(true);
  });

  it("does not crit when the roll lands at or above the chance", () => {
    expect(rollIsCrit(0.5, () => 0.5)).toBe(false);
  });
});
