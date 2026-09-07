import { QuestEnemy as QuestEnemyModule, type Quest } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { toQuestData, getQuestData } from "./questData.js";
import { findEnemyByNpcId, resolveShiftTargets, resolveCallTargets, resolveChangeTargets } from "./types.js";
import type { GameDataClient } from "../data/gameDataClient.js";
import type { WaveEnemy } from "./types.js";

/**
 * QuestEnemy carries dozens of required fields irrelevant to wave/transition logic
 * (skills, ai, drops, limit, misc, ...) — only deck/npcId/enemyScript are exercised
 * here, so the fixture is deliberately a minimal cast rather than a fully-typed object.
 */
function makeEnemy(overrides: Partial<WaveEnemy> & Pick<WaveEnemy, "npcId" | "deck">): WaveEnemy {
  return {
    enemyScript: {},
    ...overrides,
  } as unknown as WaveEnemy;
}

function makeStage(wave: number, enemies: WaveEnemy[]): Quest.Stage {
  return { wave, enemies } as unknown as Quest.Stage;
}

describe("toQuestData", () => {
  it("splits each stage into initial (deck === ENEMY) enemies and the full pool", () => {
    const initial = makeEnemy({ npcId: 1, deck: QuestEnemyModule.DeckType.ENEMY });
    const shiftTarget = makeEnemy({ npcId: 2, deck: QuestEnemyModule.DeckType.SHIFT });
    const stage = makeStage(1, [initial, shiftTarget]);

    const data = toQuestData({ id: 1000001, phase: 1, stages: [stage] } as unknown as Quest.QuestPhase);

    expect(data.questId).toBe(1000001);
    expect(data.phase).toBe(1);
    expect(data.waves).toHaveLength(1);
    expect(data.waves[0]?.waveNumber).toBe(1);
    expect(data.waves[0]?.initialEnemies).toEqual([initial]);
    expect(data.waves[0]?.enemyPool).toEqual([initial, shiftTarget]);
  });
});

describe("findEnemyByNpcId / resolveShiftTargets / resolveCallTargets", () => {
  it("finds an enemy in the pool by npcId", () => {
    const enemy = makeEnemy({ npcId: 42, deck: QuestEnemyModule.DeckType.ENEMY });
    const wave = { waveNumber: 1, initialEnemies: [enemy], enemyPool: [enemy] };
    expect(findEnemyByNpcId(wave, 42)).toBe(enemy);
    expect(findEnemyByNpcId(wave, 99)).toBeUndefined();
  });

  it("resolves a break-bar shift transition to its target enemy record", () => {
    const shiftTarget = makeEnemy({ npcId: 2, deck: QuestEnemyModule.DeckType.SHIFT });
    const boss = makeEnemy({ npcId: 1, deck: QuestEnemyModule.DeckType.ENEMY, enemyScript: { shift: [2] } });
    const wave = { waveNumber: 1, initialEnemies: [boss], enemyPool: [boss, shiftTarget] };

    expect(resolveShiftTargets(wave, boss)).toEqual([shiftTarget]);
  });

  it("resolves a reinforcement call to its target enemy record", () => {
    const reinforcement = makeEnemy({ npcId: 3, deck: QuestEnemyModule.DeckType.CALL });
    const trigger = makeEnemy({ npcId: 1, deck: QuestEnemyModule.DeckType.ENEMY, enemyScript: { call: [3] } });
    const wave = { waveNumber: 1, initialEnemies: [trigger], enemyPool: [trigger, reinforcement] };

    expect(resolveCallTargets(wave, trigger)).toEqual([reinforcement]);
  });

  it("resolves a form change to its target enemy record", () => {
    const changeTarget = makeEnemy({ npcId: 4, deck: QuestEnemyModule.DeckType.CHANGE });
    const trigger = makeEnemy({ npcId: 1, deck: QuestEnemyModule.DeckType.ENEMY, enemyScript: { change: [4] } });
    const wave = { waveNumber: 1, initialEnemies: [trigger], enemyPool: [trigger, changeTarget] };

    expect(resolveChangeTargets(wave, trigger)).toEqual([changeTarget]);
  });

  it("silently drops shift/call targets missing from the pool (a data-coverage gap, not an error)", () => {
    const trigger = makeEnemy({ npcId: 1, deck: QuestEnemyModule.DeckType.ENEMY, enemyScript: { shift: [999] } });
    const wave = { waveNumber: 1, initialEnemies: [trigger], enemyPool: [trigger] };

    expect(resolveShiftTargets(wave, trigger)).toEqual([]);
  });
});

describe("getQuestData", () => {
  it("fetches via the client's questPhase and normalizes the result", async () => {
    const enemy = makeEnemy({ npcId: 1, deck: QuestEnemyModule.DeckType.ENEMY });
    const stage = makeStage(1, [enemy]);
    const questPhase = { id: 1000001, phase: 1, stages: [stage] } as unknown as Quest.QuestPhase;
    const client = { questPhase: () => Promise.resolve(questPhase) } as unknown as GameDataClient;

    const data = await getQuestData(client, 1000001, 1);

    expect(data.questId).toBe(1000001);
    expect(data.waves[0]?.initialEnemies).toEqual([enemy]);
  });
});
