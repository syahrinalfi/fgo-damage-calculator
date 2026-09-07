import type { QuestEnemy as QuestEnemyModule } from "@atlasacademy/api-connector";

export type WaveEnemy = QuestEnemyModule.QuestEnemy;

/**
 * One wave (Stage) of a quest phase, split into the enemies actually present when the
 * wave starts (deck === ENEMY) and the full enemy-record pool for that wave, which also
 * holds the shift/call/change target records referenced by enemyScript.shift and
 * enemyScript.call. Atlas Academy does not model multi-bar HP or reinforcements as a
 * nested structure — both are "swap in another already-present enemy record from this
 * same wave's pool" (research/01-data-sources.md §6.3, research/08-enemy-mechanics.md §3-4).
 */
export interface Wave {
  waveNumber: number;
  initialEnemies: WaveEnemy[];
  enemyPool: WaveEnemy[];
}

export interface QuestData {
  questId: number;
  phase: number;
  waves: Wave[];
}

/** Looks up an enemy record within one wave's pool by its npcId. */
export function findEnemyByNpcId(wave: Wave, npcId: number): WaveEnemy | undefined {
  return wave.enemyPool.find((enemy) => enemy.npcId === npcId);
}

/**
 * Resolves the enemy record(s) a break-bar transition (enemyScript.shift) switches in,
 * by npcId lookup within the same wave's enemy pool. Missing targets (a hash-coverage
 * gap in Rayshift's captured data, research/01 §6.3) are silently dropped rather than
 * thrown, since partial enemy-data coverage is an expected, non-exceptional condition.
 */
export function resolveShiftTargets(wave: Wave, enemy: WaveEnemy): WaveEnemy[] {
  return (enemy.enemyScript.shift ?? [])
    .map((npcId) => findEnemyByNpcId(wave, npcId))
    .filter((candidate): candidate is WaveEnemy => candidate !== undefined);
}

/** Resolves the enemy record(s) a reinforcement call (enemyScript.call) spawns in. */
export function resolveCallTargets(wave: Wave, enemy: WaveEnemy): WaveEnemy[] {
  return (enemy.enemyScript.call ?? [])
    .map((npcId) => findEnemyByNpcId(wave, npcId))
    .filter((candidate): candidate is WaveEnemy => candidate !== undefined);
}

/**
 * Resolves the enemy record(s) a form change (enemyScript.change) switches in — a third
 * enemy-swap trigger alongside shift (break bar) and call (reinforcement), distinct from
 * both: schema-confirmed on EnemyScript/DeckType.CHANGE but not covered by research/08's
 * live-verified examples, so no specific in-game case is cited here the way shift/call are.
 */
export function resolveChangeTargets(wave: Wave, enemy: WaveEnemy): WaveEnemy[] {
  return (enemy.enemyScript.change ?? [])
    .map((npcId) => findEnemyByNpcId(wave, npcId))
    .filter((candidate): candidate is WaveEnemy => candidate !== undefined);
}
