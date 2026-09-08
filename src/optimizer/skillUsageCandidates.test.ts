import { describe, expect, it } from "vitest";
import type { Action } from "../battle/action.js";
import { buildSkillAndCardOrderCandidates, type SkillActivation } from "./skillUsageCandidates.js";
import type { ActionSequenceCandidate } from "./turnSearch.js";

function cardCandidate(label: string): ActionSequenceCandidate {
  return { label, actions: [{ type: "endTurn" }] };
}

const skillA: SkillActivation = { type: "useSkill", servantId: 1, skillSlot: 1, effects: [], cooldownTurns: 5 };
const skillB: SkillActivation = { type: "useMysticCodeSkill", slot: 2, effects: [], cooldownTurns: 3 };

describe("buildSkillAndCardOrderCandidates", () => {
  it("crosses every skill-usage subset with every card-order candidate", () => {
    const result = buildSkillAndCardOrderCandidates([skillA, skillB], [cardCandidate("cards1"), cardCandidate("cards2")]);
    // 2^2 skill subsets * 2 card candidates
    expect(result).toHaveLength(8);
  });

  it("prepends the chosen skill subset's actions before the card-order candidate's own actions", () => {
    const result = buildSkillAndCardOrderCandidates([skillA], [cardCandidate("cards1")]);
    const withSkill = result.find((r) => r.label.startsWith("useSkill"));
    expect(withSkill?.actions).toEqual<readonly Action[]>([skillA, { type: "endTurn" }]);
  });

  it("includes a no-skills candidate whose actions equal the card-order candidate's own actions", () => {
    const result = buildSkillAndCardOrderCandidates([skillA], [cardCandidate("cards1")]);
    const noSkills = result.find((r) => r.label === "noSkills|cards1");
    expect(noSkills?.actions).toEqual<readonly Action[]>([{ type: "endTurn" }]);
  });

  it("preserves relative order within a subset rather than permuting it", () => {
    const result = buildSkillAndCardOrderCandidates([skillA, skillB], [cardCandidate("cards1")]);
    const both = result.find((r) => r.actions.length === 3);
    expect(both?.actions).toEqual<readonly Action[]>([skillA, skillB, { type: "endTurn" }]);
  });

  it("returns no candidates when there are no card-order candidates to cross with", () => {
    expect(buildSkillAndCardOrderCandidates([skillA], [])).toEqual([]);
  });
});
