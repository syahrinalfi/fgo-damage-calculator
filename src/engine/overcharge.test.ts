import { describe, expect, it } from "vitest";
import { overchargeStage } from "./overcharge.js";

describe("overchargeStage", () => {
  it("buckets each 100-499% bracket into its stage", () => {
    expect(overchargeStage(100)).toBe(1);
    expect(overchargeStage(199)).toBe(1);
    expect(overchargeStage(200)).toBe(2);
    expect(overchargeStage(299)).toBe(2);
    expect(overchargeStage(300)).toBe(3);
    expect(overchargeStage(399)).toBe(3);
    expect(overchargeStage(400)).toBe(4);
    expect(overchargeStage(499)).toBe(4);
  });

  it("buckets exactly 500% into stage 5", () => {
    expect(overchargeStage(500)).toBe(5);
  });

  it("clamps out-of-range input defensively rather than returning an invalid stage", () => {
    expect(overchargeStage(50)).toBe(1);
    expect(overchargeStage(600)).toBe(5);
  });
});
