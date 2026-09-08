import type { CraftEssence, Servant as ServantModule } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ServantBuild } from "../account/types.js";
import type { EquippedCraftEssence } from "../battle/battleState.js";
import type { Wave, WaveEnemy } from "../quest/types.js";
import { buildInitialBattleState, type PartyMemberSpec } from "./battleStateBuilder.js";

function niceServant(overrides: Partial<ServantModule.Servant> = {}): ServantModule.Servant {
  return {
    atkGrowth: [0, 1000, 2000],
    hpGrowth: [0, 500, 1000],
    className: "saber" as ServantModule.Servant["className"],
    attribute: "human" as ServantModule.Servant["attribute"],
    traits: [{ id: 100 }],
    cards: ["2", "2", "1", "1", "3"],
    starAbsorb: 90,
    cost: 16,
    ...overrides,
  } as unknown as ServantModule.Servant;
}

function craftEssence(overrides: Partial<CraftEssence.CraftEssence> = {}): CraftEssence.CraftEssence {
  return {
    atkGrowth: [0, 0, 300],
    hpGrowth: [0, 0, 150],
    cost: 12,
    ...overrides,
  } as unknown as CraftEssence.CraftEssence;
}

function build(overrides: Partial<ServantBuild> = {}): ServantBuild {
  return {
    servantId: 100,
    level: 2,
    ascension: 1,
    skillLevels: [1, 1, 1],
    appendSkillLevels: {},
    npLevel: 1,
    fou: { atk: 0, hp: 0 },
    commandCodeIds: [],
    ...overrides,
  };
}

function member(servantId: number, isFrontLine: boolean, equippedCe?: EquippedCraftEssence): PartyMemberSpec {
  const base = { niceServant: niceServant(), build: build({ servantId }), isFrontLine };
  return equippedCe === undefined ? base : { ...base, equippedCe };
}

function waveEnemy(overrides: Partial<WaveEnemy> = {}): WaveEnemy {
  return {
    npcId: 9001,
    atk: 8000,
    hp: 50000,
    deathRate: 500,
    chargeTurn: 4,
    traits: [{ id: 200 }],
    svt: { className: "lancer", attribute: "earth" },
    enemyScript: {},
    ...overrides,
  } as unknown as WaveEnemy;
}

function wave(overrides: Partial<Wave> = {}): Wave {
  return { waveNumber: 1, initialEnemies: [waveEnemy()], enemyPool: [waveEnemy()], ...overrides };
}

describe("buildInitialBattleState", () => {
  const party = [member(1, true), member(2, true), member(3, true)];

  it("assembles a valid turn-1 BattleState: 3 servants, dealt hand, remaining bag, enemies from wave 0", () => {
    const state = buildInitialBattleState(party, [wave()], { costBudget: 100 });
    expect(state.currentTurn).toBe(1);
    expect(state.currentWaveIndex).toBe(0);
    expect(state.servants).toHaveLength(3);
    expect(state.handCards).toHaveLength(5);
    expect(state.cardBag).toHaveLength(10); // 15-card deck - 5 dealt
    expect(state.handCardStars).toEqual([0, 0, 0, 0, 0]); // starsCarried starts at 0
    expect(state.starsCarried).toBe(0);
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]?.npcId).toBe(9001);
    expect(state.enemies[0]?.deathRate).toBe(500);
    expect(state.enemies[0]?.npTurnLimit).toBe(4);
  });

  it("computes costSpent from niceServant.cost, ignoring ServantInstance (which carries no cost field)", () => {
    const state = buildInitialBattleState(party, [wave()], { costBudget: 100 });
    expect(state.costSpent).toBe(16 * 3); // each member's niceServant.cost, no CE equipped
  });

  it("adds the equipped CE's own cost on top of the servant's", () => {
    const withCe = [member(1, true, { data: craftEssence(), level: 3 }), member(2, true), member(3, true)];
    const state = buildInitialBattleState(withCe, [wave()], { costBudget: 100 });
    expect(state.costSpent).toBe(16 * 3 + 12);
  });

  it("defaults commandSealsRemaining to 0 and fieldTraits to empty, overridable via options", () => {
    const defaulted = buildInitialBattleState(party, [wave()], { costBudget: 100 });
    expect(defaulted.commandSealsRemaining).toBe(0);
    expect(defaulted.fieldTraits.size).toBe(0);

    const overridden = buildInitialBattleState(party, [wave()], { costBudget: 100, commandSealsRemaining: 2, fieldTraits: new Set([1234]) });
    expect(overridden.commandSealsRemaining).toBe(2);
    expect(overridden.fieldTraits).toEqual(new Set([1234]));
  });

  it("produces an empty enemies array when the waves list is empty", () => {
    const state = buildInitialBattleState(party, [], { costBudget: 100 });
    expect(state.enemies).toEqual([]);
  });

  it("propagates buildCombinedCardDeck's error when the party doesn't have exactly 3 front-line servants", () => {
    const tooFew = [member(1, true), member(2, true)];
    expect(() => buildInitialBattleState(tooFew, [wave()], { costBudget: 100 })).toThrow(RangeError);
  });

  it("is deterministic given an explicit randomFn", () => {
    const a = buildInitialBattleState(party, [wave()], { costBudget: 100, randomFn: () => 0.5 });
    const b = buildInitialBattleState(party, [wave()], { costBudget: 100, randomFn: () => 0.5 });
    expect(a.handCards).toEqual(b.handCards);
    expect(a.cardBag).toEqual(b.cardBag);
  });
});
