import { describe, expect, it } from "vitest";
import { createSeededRandom, estimateClearReliability } from "./reliability.js";

describe("optimizer reliability", () => {
  it("produces the same bounded estimate for the same seed", () => {
    const estimate = () => estimateClearReliability({
      trialCount: 100,
      seed: 12345,
      runTrial: (randomFn) => randomFn() < 0.6,
    });
    expect(estimate()).toEqual(estimate());
    expect(estimate().clearCount).toBeGreaterThan(0);
    expect(estimate().clearCount).toBeLessThan(100);
    expect(estimate().confidence95.lower).toBeGreaterThanOrEqual(0);
    expect(estimate().confidence95.upper).toBeLessThanOrEqual(1);
  });

  it("counts an exception as a failed trial", () => {
    const result = estimateClearReliability({
      trialCount: 4,
      seed: 7,
      runTrial: (_randomFn, trialIndex) => {
        if (trialIndex === 2) throw new Error("illegal replay");
        return true;
      },
    });
    expect(result).toMatchObject({ trialCount: 4, clearCount: 3, clearProbability: 0.75 });
  });

  it("validates trial count and seed", () => {
    expect(() => estimateClearReliability({ trialCount: 0, seed: 1, runTrial: () => true })).toThrow(RangeError);
    expect(() => estimateClearReliability({ trialCount: 10_001, seed: 1, runTrial: () => true })).toThrow(RangeError);
    expect(() => estimateClearReliability({ trialCount: 1, seed: 1.5, runTrial: () => true })).toThrow(RangeError);
    expect(createSeededRandom(9)()).toBe(createSeededRandom(9)());
  });
});
