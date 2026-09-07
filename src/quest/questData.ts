import { QuestEnemy as QuestEnemyModule, type Quest } from "@atlasacademy/api-connector";
import type { GameDataClient } from "../data/gameDataClient.js";
import type { QuestData, Wave } from "./types.js";

/**
 * Assumes only deck === ENEMY records are present on the field when a wave starts, with
 * every other deck type (shift/call/change/skillShift/aiNpc/svtFollower/...) reachable
 * only via a transition from an ENEMY record. Confirmed against the two live quests
 * research/08 cites (1000001/1, 94061636/1), both plain ENEMY-only waves — not yet
 * checked against a wave whose starting deck includes svtFollower (a support-slot NPC)
 * or another non-ENEMY type, so treat this as an open assumption until one is found.
 */
function toWave(stage: Quest.Stage): Wave {
  return {
    waveNumber: stage.wave,
    initialEnemies: stage.enemies.filter((enemy) => enemy.deck === QuestEnemyModule.DeckType.ENEMY),
    enemyPool: stage.enemies,
  };
}

/** Normalizes a raw NiceQuestPhase into the wave-oriented shape the engine consumes. */
export function toQuestData(questPhase: Quest.QuestPhase): QuestData {
  return {
    questId: questPhase.id,
    phase: questPhase.phase,
    waves: questPhase.stages.map(toWave),
  };
}

/** Fetches one quest phase's enemy/wave data (research/01-data-sources.md §4) and normalizes it. */
export async function getQuestData(client: GameDataClient, questId: number, phase: number): Promise<QuestData> {
  const questPhase = await client.questPhase(questId, phase);
  return toQuestData(questPhase);
}
