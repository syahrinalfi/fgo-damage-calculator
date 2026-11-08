import { describe, expect, it } from "vitest";
import type { Action } from "../battle/action.js";
import type { HandCard } from "../battle/battleState.js";
import { buildOrderChangeCandidates, buildOrderChangeGroups, reassignHandCardOwnership, type OrderChangeSwap } from "./orderChangeCandidates.js";
import type { ActionSequenceCandidate } from "./turnSearch.js";

const swap: OrderChangeSwap = { type: "orderChange", outgoingServantId: 1, incomingServantId: 4 };

const skillAction: Action = { type: "useSkill", servantId: 2, skillSlot: 1, effects: [], cooldownTurns: 5 };
function playCardAction(servantId: number): Action {
  return { type: "playCard", servantId, handCardIndex: 0 } as unknown as Action;
}

function hand(servantIds: readonly number[]): readonly HandCard[] {
  return servantIds.map((servantId) => ({ card: "buster", servantId }) as unknown as HandCard);
}

describe("reassignHandCardOwnership", () => {
  it("reassigns only the outgoing servant's slots to the incoming servant", () => {
    const result = reassignHandCardOwnership(hand([1, 2, 1]), swap);
    expect(result.map((h) => h.servantId)).toEqual([4, 2, 4]);
  });

  it("leaves the hand untouched when no slot belongs to the outgoing servant", () => {
    const original = hand([2, 3]);
    expect(reassignHandCardOwnership(original, swap)).toEqual(original);
  });
});

describe("buildOrderChangeCandidates", () => {
  function candidatesForHand(h: readonly HandCard[]): readonly ActionSequenceCandidate[] {
    return [{ label: `cards[${h.map((c) => c.servantId).join(",")}]`, actions: [playCardAction(h[0]?.servantId as number)] }];
  }

  it("includes a no-swap candidate whose hand/actions are untouched", () => {
    const result = buildOrderChangeCandidates([swap], hand([1]), candidatesForHand);
    const noSwap = result.find((r) => r.label.startsWith("noOrderChange|"));
    expect(noSwap?.actions).toEqual([playCardAction(1)]);
  });

  it("plays the outgoing servant's skills just before a before-skills swap in factored groups", () => {
    const outgoing: Action = { type: "useSkill", servantId: 1, skillSlot: 2, effects: [], cooldownTurns: 5 };
    const groups = buildOrderChangeGroups([swap], hand([1]), (h) => ({ setups: [{ label: "noSkills", actions: [] }, { label: "s", actions: [skillAction] }], chains: candidatesForHand(h) }), {
      afterSkillsTiming: false,
      beforeSwap: () => ({ label: "useSkill:1.2", actions: [outgoing] }),
    });
    expect(groups.map((group) => group.setups.map((setup) => [setup.label, setup.actions]))).toEqual([
      [["noOrderChange|noSkills", []], ["noOrderChange|s", [skillAction]]],
      [["useSkill:1.2|orderChange:1->4@beforeSkills|noSkills", [outgoing, swap]], ["useSkill:1.2|orderChange:1->4@beforeSkills|s", [outgoing, swap, skillAction]]],
    ]);
  });

  it("can leave out the after-skills timing", () => {
    const result = buildOrderChangeCandidates([swap], hand([1]), candidatesForHand, { afterSkillsTiming: false });
    expect(result.map((r) => r.label.split("|")[0])).toEqual(["noOrderChange", "orderChange:1->4@beforeSkills"]);
  });

  it("tells the builder which swap and timing each candidate set is for", () => {
    const seen: string[] = [];
    buildOrderChangeCandidates([swap], hand([1]), (h, choice) => {
      seen.push(choice === undefined ? "none" : `${choice.swap.incomingServantId}@${choice.afterSkills ? "after" : "before"}`);
      return candidatesForHand(h);
    });
    expect(seen.sort()).toEqual(["4@after", "4@before", "none"]);
  });

  it("rebuilds the hand (and therefore the card candidate's servantId) before generating candidates for a swap choice", () => {
    const result = buildOrderChangeCandidates([swap], hand([1]), candidatesForHand);
    const beforeSkills = result.find((r) => r.label.includes("beforeSkills"));
    expect(beforeSkills?.actions).toEqual([swap, playCardAction(4)]);
  });

  it("places the swap after the skill prefix but before the first card for the afterSkills timing", () => {
    function withSkill(h: readonly HandCard[]): readonly ActionSequenceCandidate[] {
      return [{ label: "withSkill", actions: [skillAction, playCardAction(h[0]?.servantId as number)] }];
    }
    const result = buildOrderChangeCandidates([swap], hand([1]), withSkill);
    const afterSkills = result.find((r) => r.label.includes("afterSkills"));
    expect(afterSkills?.actions).toEqual([skillAction, swap, playCardAction(4)]);
  });

  it("appends the swap at the end for the afterSkills timing when the candidate has no card actions", () => {
    function skillsOnly(): readonly ActionSequenceCandidate[] {
      return [{ label: "skillsOnly", actions: [skillAction] }];
    }
    const result = buildOrderChangeCandidates([swap], hand([1]), skillsOnly);
    const afterSkills = result.find((r) => r.label.includes("afterSkills"));
    expect(afterSkills?.actions).toEqual([skillAction, swap]);
  });

  it("returns 1 + 2n groups of candidates for n swap options", () => {
    const swapB: OrderChangeSwap = { type: "orderChange", outgoingServantId: 2, incomingServantId: 5 };
    const result = buildOrderChangeCandidates([swap, swapB], hand([1, 2]), candidatesForHand);
    // (1 no-swap + 2*2 timed) groups, 1 candidate per group from candidatesForHand
    expect(result).toHaveLength(5);
  });

  it("returns no candidates when buildCandidatesForHand itself returns none", () => {
    expect(buildOrderChangeCandidates([swap], hand([1]), () => [])).toEqual([]);
  });
});

