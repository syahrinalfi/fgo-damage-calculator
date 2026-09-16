import type { CraftEssence } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { BattleState, EquippedCraftEssence } from "../battle/battleState.js";
import type { RankedQuestCandidate } from "./resultRanking.js";
import { rankQuestCandidates, selectDiverseQuestCandidates } from "./resultRanking.js";

function clearedState(costSpent: number): BattleState {
  return {
    waves: [{}],
    currentWaveIndex: 0,
    enemies: [{ currentHp: 0 }],
    costSpent,
  } as unknown as BattleState;
}

function ce(id: number): EquippedCraftEssence {
  return { data: { id } as unknown as CraftEssence.CraftEssence, level: 1 };
}

function candidate(
  strategyKey: string,
  attackerIds: readonly number[],
  primaryAttackerId: number | undefined,
  options: { readonly cost?: number; readonly ceId?: number; readonly reliability?: number } = {},
): RankedQuestCandidate {
  const state = clearedState(options.cost ?? 100);
  return {
    party: [{
      niceServant: {} as RankedQuestCandidate["party"][number]["niceServant"],
      build: { servantId: primaryAttackerId ?? 1 } as RankedQuestCandidate["party"][number]["build"],
      isFrontLine: true,
      ...(options.ceId === undefined ? {} : { equippedCe: ce(options.ceId) }),
    }],
    initialState: state,
    best: { label: strategyKey, actions: [], finalState: state, score: 1 },
    attribution: {
      attackerIds,
      ...(primaryAttackerId === undefined ? {} : { primaryAttackerId }),
      coreServantIds: attackerIds,
    },
    strategyKey,
    ...(options.reliability === undefined
      ? {}
      : {
          reliability: {
            trialCount: 100,
            clearCount: Math.round(options.reliability * 100),
            clearProbability: options.reliability,
            confidence95: { lower: 0, upper: 1 },
          },
        }),
  };
}

describe("quest result ranking", () => {
  it("keeps fewer necessary attackers ahead of a preferred-attacker tie breaker", () => {
    const oneAttacker = candidate("one", [1], 1);
    const preferredButTwo = candidate("two", [2, 3], 2);
    expect(rankQuestCandidates([preferredButTwo, oneAttacker], { preferredAttackerId: 2 })[0]).toBe(oneAttacker);
  });

  it("ranks reliability before attacker-count simplicity", () => {
    const fragileOneAttacker = candidate("fragile", [1], 1, { reliability: 0.6 });
    const reliableTwoAttackers = candidate("reliable", [2, 3], 2, { reliability: 0.9 });
    expect(rankQuestCandidates([fragileOneAttacker, reliableTwoAttackers])[0]).toBe(reliableTwoAttackers);
  });

  it("ranks preferred attacker, Event CE, Bond CE, and minimum cost when higher priorities tie", () => {
    const plain = candidate("plain", [1], 1, { cost: 100 });
    const preferred = candidate("preferred", [2], 2, { cost: 100 });
    expect(rankQuestCandidates([plain, preferred], { preferredAttackerId: 2 })[0]).toBe(preferred);

    const event = candidate("event", [1], 1, { ceId: 777 });
    expect(rankQuestCandidates([plain, event], { eventCeIds: [777] })[0]).toBe(event);

    const bond = candidate("bond", [1], 1, { ceId: 888 });
    expect(rankQuestCandidates([plain, bond], { bondCeIds: [888] })[0]).toBe(bond);

    const cheap = candidate("cheap", [1], 1, { cost: 50 });
    expect(rankQuestCandidates([plain, cheap], { minimizeCost: true })[0]).toBe(cheap);
  });

  it("returns one representative per strategy key before applying the result limit", () => {
    const duplicateA = candidate("same", [1], 1);
    const duplicateB = candidate("same", [1], 1);
    const distinct = candidate("distinct", [2], 2);
    expect(selectDiverseQuestCandidates([duplicateA, duplicateB, distinct], {}, 5)).toEqual([distinct, duplicateA]);
  });
});
