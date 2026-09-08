import { describe, expect, it } from "vitest";
import {
  enumerateCeAssignments,
  enumerateOrderChangeTimings,
  enumerateOrderedSelections,
  enumeratePartyFormations,
  enumerateServantSubsets,
  enumerateSkillUsageSubsets,
} from "./candidateGeneration.js";

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

describe("enumerateOrderChangeTimings", () => {
  it("returns only the no-swap option for an empty swap list", () => {
    expect(enumerateOrderChangeTimings([])).toEqual([[]]);
  });

  it("returns the no-swap option plus both timings for every swap option", () => {
    const result = enumerateOrderChangeTimings(["swapA", "swapB"]);
    expect(result).toEqual([
      [],
      [{ swap: "swapA", afterSkills: false }],
      [{ swap: "swapA", afterSkills: true }],
      [{ swap: "swapB", afterSkills: false }],
      [{ swap: "swapB", afterSkills: true }],
    ]);
  });

  it("never combines more than one swap in a single choice", () => {
    const result = enumerateOrderChangeTimings(["swapA", "swapB", "swapC"]);
    expect(result.every((choice) => choice.length <= 1)).toBe(true);
  });

  it("returns 1 + 2n choices for n swap options", () => {
    expect(enumerateOrderChangeTimings(["a", "b", "c"])).toHaveLength(7);
  });
});

describe("enumeratePartyFormations", () => {
  it("degenerates to front-line-only enumerateServantSubsets when maxBenchCount is 0", () => {
    const result = enumeratePartyFormations(["a", "b", "c", "d"], 3, 0);
    expect(result).toEqual([
      { frontLine: ["a", "b", "c"], bench: [] },
      { frontLine: ["a", "b", "d"], bench: [] },
      { frontLine: ["a", "c", "d"], bench: [] },
      { frontLine: ["b", "c", "d"], bench: [] },
    ]);
  });

  it("includes every party size from frontLineCount up to frontLineCount + maxBenchCount", () => {
    const result = enumeratePartyFormations(["a", "b", "c", "d"], 3, 1);
    // size-3 formations (bench empty) + size-4 formations (1 benched)
    const sizes = result.map((f) => f.frontLine.length + f.bench.length);
    expect(sizes).toContain(3);
    expect(sizes).toContain(4);
    expect(sizes.every((size) => size <= 4)).toBe(true);
  });

  it("caps the max party size at maxBenchCount even with a larger shortlist", () => {
    const result = enumeratePartyFormations(["a", "b", "c", "d", "e", "f"], 3, 1);
    expect(result.every((f) => f.frontLine.length + f.bench.length <= 4)).toBe(true);
  });

  it("caps the max party size at shortlist.length when it is smaller than frontLineCount + maxBenchCount", () => {
    const result = enumeratePartyFormations(["a", "b", "c"], 3, 3);
    expect(result).toEqual([{ frontLine: ["a", "b", "c"], bench: [] }]);
  });

  it("every bench member is exactly the party subset minus the chosen front line", () => {
    const result = enumeratePartyFormations(["a", "b", "c", "d"], 3, 1);
    const fourMember = result.find((f) => f.frontLine.length + f.bench.length === 4 && f.frontLine.includes("d") === false);
    expect(fourMember).toBeDefined();
    expect(new Set([...(fourMember?.frontLine ?? []), ...(fourMember?.bench ?? [])])).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("returns no formations when the shortlist is smaller than frontLineCount", () => {
    expect(enumeratePartyFormations(["a", "b"], 3, 3)).toEqual([]);
  });
});
