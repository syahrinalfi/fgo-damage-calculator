import { describe, expect, it } from "vitest";
import { resolveBuffAction, type BuffActionInput } from "./buffAction.js";

function makeInput(overrides: Partial<BuffActionInput>): BuffActionInput {
  return { baseParam: 0, plusTotal: 0, minusTotal: 0, baseValue: 0, maxRate: 1000, limit: "normal", ...overrides };
}

describe("resolveBuffAction", () => {
  it("sums plus/minus totals additively within an unclamped range", () => {
    expect(resolveBuffAction(makeInput({ plusTotal: 50, minusTotal: 20 }))).toBe(30);
  });

  it("floors a negative total at 0 under the normal limit", () => {
    expect(resolveBuffAction(makeInput({ minusTotal: 50 }))).toBe(0);
  });

  it("caps a total exceeding maxRate under the normal limit", () => {
    expect(resolveBuffAction(makeInput({ plusTotal: 500, maxRate: 100 }))).toBe(100);
  });

  it("subtracts baseValue after the floor check and before the ceiling check", () => {
    expect(resolveBuffAction(makeInput({ plusTotal: 50, baseValue: 10 }))).toBe(40);
  });

  it("skips the ceiling check under the lower-only limit, letting the total exceed maxRate", () => {
    expect(resolveBuffAction(makeInput({ plusTotal: 200, maxRate: 50, limit: "lower" }))).toBe(200);
  });

  it("skips the floor check under the upper-only limit, letting the total go negative", () => {
    expect(resolveBuffAction(makeInput({ minusTotal: 50, limit: "upper" }))).toBe(-50);
  });

  it("skips both checks under the none limit", () => {
    expect(resolveBuffAction(makeInput({ minusTotal: 500, maxRate: 100, limit: "none" }))).toBe(-500);
  });
});
