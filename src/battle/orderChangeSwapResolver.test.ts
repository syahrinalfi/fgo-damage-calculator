import { describe, expect, it } from "vitest";
import type { BattleState, ServantInstance } from "./battleState.js";
import { resolveOrderChangeSwapOptions } from "./orderChangeSwapResolver.js";

function servant(servantId: number, isFrontLine: boolean): ServantInstance {
  return {
    servantId,
    isFrontLine,
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
    criticalWeight: 99,
    starGen: 60,
  };
}

function state(servants: readonly ServantInstance[], mysticCodeSkillCooldowns: readonly [number, number, number] = [0, 0, 0]): BattleState {
  return {
    waves: [],
    currentWaveIndex: 0,
    currentTurn: 1,
    servants,
    enemies: [],
    handCards: [],
    cardBag: [],
    starsCarried: 0,
    handCardStars: [],
    critChanceBonusCarried: 0,
    activeCritChanceBonus: 0,
    fieldTraits: new Set(),
    costSpent: 0,
    costBudget: 100,
    commandSealsRemaining: 3,
    consecutiveNpChainCount: 0,
    mysticCodeSkillCooldowns,
  };
}

describe("resolveOrderChangeSwapOptions", () => {
  it("returns no swaps when hasOrderChangeMysticCodeSkill is false, regardless of state", () => {
    const s = state([servant(1, true), servant(2, false)]);
    expect(resolveOrderChangeSwapOptions(s, false)).toEqual([]);
  });

  it("returns no swaps when the 3rd Mystic Code skill slot is still on cooldown", () => {
    const s = state([servant(1, true), servant(2, false)], [0, 0, 5]);
    expect(resolveOrderChangeSwapOptions(s, true)).toEqual([]);
  });

  it("enumerates every front-line x bench pair when off cooldown", () => {
    const s = state([servant(1, true), servant(2, true), servant(3, false), servant(4, false)]);
    const result = resolveOrderChangeSwapOptions(s, true);
    expect(result).toHaveLength(4);
    expect(result).toContainEqual({ type: "orderChange", outgoingServantId: 1, incomingServantId: 3 });
    expect(result).toContainEqual({ type: "orderChange", outgoingServantId: 1, incomingServantId: 4 });
    expect(result).toContainEqual({ type: "orderChange", outgoingServantId: 2, incomingServantId: 3 });
    expect(result).toContainEqual({ type: "orderChange", outgoingServantId: 2, incomingServantId: 4 });
  });

  it("returns no swaps when there is no benched servant to swap in", () => {
    const s = state([servant(1, true), servant(2, true), servant(3, true)]);
    expect(resolveOrderChangeSwapOptions(s, true)).toEqual([]);
  });
});
