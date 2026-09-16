import type { KeyValueStorage } from "../account/rosterStore.js";
import type { SupportedRegion } from "../data/region.js";
import type { Wave, WaveEnemy } from "./types.js";

export interface ManualEnemyInput {
  readonly className: WaveEnemy["svt"]["className"];
  readonly attribute: WaveEnemy["svt"]["attribute"];
  readonly hp: number;
  readonly traits?: readonly number[];
  readonly rarity?: number;
  readonly deathRate?: number;
  readonly chargeTurn?: number;
  readonly serverMod?: Partial<WaveEnemy["serverMod"]>;
}

export interface ManualWaveInput {
  readonly enemies: readonly ManualEnemyInput[];
}

export interface ManualQuestDraft {
  readonly id: string;
  readonly name: string;
  readonly region: SupportedRegion;
  readonly waves: readonly ManualWaveInput[];
}

const NEUTRAL_SERVER_MOD = { tdRate: 1000, tdAttackRate: 1000, starRate: 1000 } as const;

function validateEnemy(enemy: ManualEnemyInput, waveIndex: number, enemyIndex: number): void {
  if (!Number.isFinite(enemy.hp) || enemy.hp <= 0) {
    throw new RangeError(`Wave ${waveIndex + 1} enemy ${enemyIndex + 1} HP must be positive, got ${enemy.hp}`);
  }
  if (enemy.className.length === 0 || enemy.attribute.length === 0) {
    throw new RangeError(`Wave ${waveIndex + 1} enemy ${enemyIndex + 1} requires class and attribute`);
  }
  if (enemy.traits?.some((trait) => !Number.isInteger(trait)) ?? false) {
    throw new RangeError(`Wave ${waveIndex + 1} enemy ${enemyIndex + 1} traits must be integer IDs`);
  }
}

/** Converts manual per-enemy input to the same Wave shape consumed by the optimizer. */
export function manualQuestToWaves(draft: ManualQuestDraft): readonly Wave[] {
  if (draft.waves.length === 0) throw new RangeError("A manual quest requires at least one wave");
  return draft.waves.map((wave, waveIndex): Wave => {
    if (wave.enemies.length < 1 || wave.enemies.length > 3) {
      throw new RangeError(`Wave ${waveIndex + 1} must contain 1 through 3 enemies`);
    }
    const initialEnemies = wave.enemies.map((enemy, enemyIndex): WaveEnemy => {
      validateEnemy(enemy, waveIndex, enemyIndex);
      return {
        npcId: -((waveIndex + 1) * 1000 + enemyIndex + 1),
        atk: 0,
        hp: enemy.hp,
        deathRate: enemy.deathRate ?? 1000,
        chargeTurn: enemy.chargeTurn ?? 0,
        traits: (enemy.traits ?? []).map((id) => ({ id })),
        svt: {
          className: enemy.className,
          attribute: enemy.attribute,
          ...(enemy.rarity === undefined ? {} : { rarity: enemy.rarity }),
        },
        enemyScript: {},
        serverMod: { ...NEUTRAL_SERVER_MOD, ...enemy.serverMod },
      } as unknown as WaveEnemy;
    });
    return { waveNumber: waveIndex + 1, initialEnemies, enemyPool: initialEnemies };
  });
}

interface StoredQuestEnvelope {
  readonly version: 1;
  readonly drafts: readonly ManualQuestDraft[];
}

function parseStoredDrafts(raw: string, region: SupportedRegion): readonly ManualQuestDraft[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SyntaxError(`Stored quests for ${region} contain invalid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null) throw new TypeError(`Stored quests for ${region} must be an object`);
  const envelope = parsed as Partial<StoredQuestEnvelope> & { readonly version?: unknown };
  if (envelope.version !== 1) {
    throw new RangeError(`Stored quests for ${region} use unsupported version ${String(envelope.version)}`);
  }
  if (!Array.isArray(envelope.drafts)) throw new TypeError(`Stored quests for ${region} require a drafts array`);
  for (const draft of envelope.drafts) {
    if (draft.region !== region) throw new RangeError(`Stored quests for ${region} contain region ${draft.region}`);
    manualQuestToWaves(draft);
  }
  return envelope.drafts;
}

/** Versioned, region-separated persistence for manual quest drafts. */
export class JsonManualQuestRepository {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly keyPrefix = "fgo-damage-calculator:quests:v1",
  ) {}

  private key(region: SupportedRegion): string {
    return `${this.keyPrefix}:${region}`;
  }

  async list(region: SupportedRegion): Promise<readonly ManualQuestDraft[]> {
    const raw = this.storage.getItem(this.key(region));
    return raw === null ? [] : parseStoredDrafts(raw, region);
  }

  async save(draft: ManualQuestDraft): Promise<void> {
    if (draft.id.length === 0 || draft.name.length === 0) throw new RangeError("Manual quest id and name are required");
    manualQuestToWaves(draft);
    const drafts = [...await this.list(draft.region)];
    const index = drafts.findIndex((existing) => existing.id === draft.id);
    if (index < 0) drafts.push(draft);
    else drafts[index] = draft;
    const envelope: StoredQuestEnvelope = { version: 1, drafts };
    this.storage.setItem(this.key(draft.region), JSON.stringify(envelope));
  }

  async remove(region: SupportedRegion, id: string): Promise<void> {
    const drafts = (await this.list(region)).filter((draft) => draft.id !== id);
    if (drafts.length === 0) {
      this.storage.removeItem(this.key(region));
      return;
    }
    const envelope: StoredQuestEnvelope = { version: 1, drafts };
    this.storage.setItem(this.key(region), JSON.stringify(envelope));
  }
}
