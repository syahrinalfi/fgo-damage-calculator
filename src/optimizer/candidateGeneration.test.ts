import { describe, expect, it } from "vitest";
import { enumerateCeAssignments, enumerateOrderedSelections, enumerateServantSubsets, enumerateSkillUsageSubsets } from "./candidateGeneration.js";

describe("enumerateServantSubsets", () => {
  it("enumerates every unordered combination of the requested size", () => {
    const result = enumerateServantSubsets(["a", "b", "c"], 2);
    expect(result).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
  });

  it("returns a single empty subset for size 0", () => {
    expect(enumerateServantSubsets(["a", "b"], 0)).toEqual([[]]);
  });

  it("returns no subsets when the requested size exceeds the shortlist", () => {
    expect(enumerateServantSubsets(["a"], 2)).toEqual([]);
  });

  it("returns the full list itself as the only subset when size equals the shortlist length", () => {
    expect(enumerateServantSubsets(["a", "b"], 2)).toEqual([["a", "b"]]);
  });
});

describe("enumerateCeAssignments", () => {
  it("produces every assignment where a pool item is never reused across slots, each slot optionally empty", () => {
    const result = enumerateCeAssignments(["A", "B"], 2);
    // sum(k=0..2) C(2,k)*P(2,k) = 1 + 4 + 2 = 7
    expect(result).toHaveLength(7);
    expect(result).toContainEqual([undefined, undefined]);
    expect(result).toContainEqual(["A", "B"]);
    expect(result).toContainEqual(["B", "A"]);
    expect(result).toContainEqual(["A", undefined]);
    expect(result).toContainEqual([undefined, "A"]);
    // Never both slots holding the same pool item
    expect(result).not.toContainEqual(["A", "A"]);
    expect(result).not.toContainEqual(["B", "B"]);
  });

  it("returns only the all-empty assignment when the pool is empty", () => {
    expect(enumerateCeAssignments([], 2)).toEqual([[undefined, undefined]]);
  });

  it("returns a single empty-array assignment when slotCount is 0", () => {
    expect(enumerateCeAssignments(["A"], 0)).toEqual([[]]);
  });
});

describe("enumerateOrderedSelections", () => {
  it("produces every nPr ordered selection", () => {
    const result = enumerateOrderedSelections(["a", "b", "c"], 2);
    expect(result).toHaveLength(6);
    expect(result).toContainEqual(["a", "b"]);
    expect(result).toContainEqual(["b", "a"]);
    expect(result).toContainEqual(["a", "c"]);
    expect(result).toContainEqual(["c", "a"]);
    expect(result).toContainEqual(["b", "c"]);
    expect(result).toContainEqual(["c", "b"]);
  });

  it("returns a single empty selection for selectCount 0", () => {
    expect(enumerateOrderedSelections(["a", "b"], 0)).toEqual([[]]);
  });

  it("returns no selections when selectCount exceeds the item count", () => {
    expect(enumerateOrderedSelections(["a"], 2)).toEqual([]);
  });

  it("returns every full permutation when selectCount equals the item count", () => {
    const result = enumerateOrderedSelections(["a", "b"], 2);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(["a", "b"]);
    expect(result).toContainEqual(["b", "a"]);
  });
});

describe("enumerateSkillUsageSubsets", () => {
  it("enumerates every subset (power set) including the empty one", () => {
    const result = enumerateSkillUsageSubsets(["a", "b"]);
    expect(result).toHaveLength(4);
    expect(result).toContainEqual([]);
    expect(result).toContainEqual(["a"]);
    expect(result).toContainEqual(["b"]);
    expect(result).toContainEqual(["a", "b"]);
  });

  it("never varies relative order within a subset", () => {
    const result = enumerateSkillUsageSubsets(["a", "b", "c"]);
    expect(result).not.toContainEqual(["b", "a"]);
    expect(result).not.toContainEqual(["c", "a"]);
    expect(result).toContainEqual(["a", "b", "c"]);
  });

  it("returns a single empty subset for an empty input", () => {
    expect(enumerateSkillUsageSubsets([])).toEqual([[]]);
  });

  it("returns 2^n subsets for n options", () => {
    expect(enumerateSkillUsageSubsets(["a", "b", "c", "d"])).toHaveLength(16);
  });
});
