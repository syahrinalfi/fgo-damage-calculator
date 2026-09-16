import type { SupportedRegion } from "../data/region.js";
import type { ManualEnemyInput, ManualQuestDraft, ManualWaveInput } from "./manualQuest.js";

function defaultEnemy(): ManualEnemyInput {
  return {
    className: "saber" as ManualEnemyInput["className"],
    attribute: "human" as ManualEnemyInput["attribute"],
    hp: 100000,
  };
}

function defaultWave(): ManualWaveInput {
  return { enemies: [defaultEnemy()] };
}

function waveAt(draft: ManualQuestDraft, waveIndex: number): ManualWaveInput {
  const wave = draft.waves[waveIndex];
  if (wave === undefined) throw new RangeError(`Invalid wave index ${waveIndex}`);
  return wave;
}

export function createManualQuestDraft(region: SupportedRegion, id: string): ManualQuestDraft {
  if (id.length === 0) throw new RangeError("Manual quest id is required");
  return { id, name: "New Quest", region, waves: [defaultWave()] };
}

export function renameManualQuest(draft: ManualQuestDraft, name: string): ManualQuestDraft {
  return { ...draft, name };
}

export function addManualWave(draft: ManualQuestDraft): ManualQuestDraft {
  return { ...draft, waves: [...draft.waves, defaultWave()] };
}

export function removeManualWave(draft: ManualQuestDraft, waveIndex: number): ManualQuestDraft {
  waveAt(draft, waveIndex);
  if (draft.waves.length === 1) throw new RangeError("A manual quest requires at least one wave");
  return { ...draft, waves: draft.waves.filter((_, index) => index !== waveIndex) };
}

export function addManualEnemy(draft: ManualQuestDraft, waveIndex: number): ManualQuestDraft {
  const wave = waveAt(draft, waveIndex);
  if (wave.enemies.length >= 3) throw new RangeError(`Wave ${waveIndex + 1} supports at most 3 enemies`);
  return {
    ...draft,
    waves: draft.waves.map((candidate, index) => index === waveIndex
      ? { ...candidate, enemies: [...candidate.enemies, defaultEnemy()] }
      : candidate),
  };
}

export function removeManualEnemy(draft: ManualQuestDraft, waveIndex: number, enemyIndex: number): ManualQuestDraft {
  const wave = waveAt(draft, waveIndex);
  if (wave.enemies[enemyIndex] === undefined) throw new RangeError(`Invalid enemy index ${enemyIndex} in wave ${waveIndex + 1}`);
  if (wave.enemies.length === 1) throw new RangeError(`Wave ${waveIndex + 1} requires at least one enemy`);
  return {
    ...draft,
    waves: draft.waves.map((candidate, index) => index === waveIndex
      ? { ...candidate, enemies: candidate.enemies.filter((_, slot) => slot !== enemyIndex) }
      : candidate),
  };
}

export function updateManualEnemy(
  draft: ManualQuestDraft,
  waveIndex: number,
  enemyIndex: number,
  patch: Partial<ManualEnemyInput>,
): ManualQuestDraft {
  const wave = waveAt(draft, waveIndex);
  if (wave.enemies[enemyIndex] === undefined) throw new RangeError(`Invalid enemy index ${enemyIndex} in wave ${waveIndex + 1}`);
  return {
    ...draft,
    waves: draft.waves.map((candidate, index) => index === waveIndex
      ? {
          ...candidate,
          enemies: candidate.enemies.map((enemy, slot) => slot === enemyIndex ? { ...enemy, ...patch } : enemy),
        }
      : candidate),
  };
}
