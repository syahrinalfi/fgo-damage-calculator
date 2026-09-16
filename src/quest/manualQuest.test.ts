import { describe, expect, it } from "vitest";
import { Region } from "../data/region.js";
import type { KeyValueStorage } from "../account/rosterStore.js";
import {
  JsonManualQuestRepository,
  manualQuestToWaves,
  type ManualQuestDraft,
} from "./manualQuest.js";

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function draft(overrides: Partial<ManualQuestDraft> = {}): ManualQuestDraft {
  return {
    id: "raid-boss",
    name: "Raid Boss",
    region: Region.NA,
    waves: [{
      enemies: [
        { className: "lancer", attribute: "earth", hp: 100000, traits: [200], rarity: 5 },
        { className: "caster", attribute: "sky", hp: 50000 },
      ],
    }],
    ...overrides,
  };
}

describe("manualQuestToWaves", () => {
  it("maps every manually entered enemy independently with disclosed neutral defaults", () => {
    const waves = manualQuestToWaves(draft());
    expect(waves).toHaveLength(1);
    expect(waves[0]?.initialEnemies).toHaveLength(2);
    expect(waves[0]?.initialEnemies[0]).toMatchObject({
      npcId: -1001,
      hp: 100000,
      atk: 0,
      deathRate: 1000,
      chargeTurn: 0,
      svt: { className: "lancer", attribute: "earth", rarity: 5 },
      serverMod: { tdRate: 1000, tdAttackRate: 1000, starRate: 1000 },
    });
    expect(waves[0]?.initialEnemies[0]?.traits.map((trait) => trait.id)).toEqual([200]);
    expect(waves[0]?.initialEnemies[1]).toMatchObject({
      npcId: -1002,
      hp: 50000,
      svt: { className: "caster", attribute: "sky" },
    });
    expect(waves[0]?.enemyPool).toEqual(waves[0]?.initialEnemies);
  });

  it("rejects missing waves, empty waves, too many initial enemies, and invalid HP", () => {
    expect(() => manualQuestToWaves(draft({ waves: [] }))).toThrow(/at least one wave/);
    expect(() => manualQuestToWaves(draft({ waves: [{ enemies: [] }] }))).toThrow(/1 through 3 enemies/);
    expect(() => manualQuestToWaves(draft({ waves: [{ enemies: Array.from({ length: 4 }, () => ({ className: "saber", attribute: "human", hp: 1 })) }] }))).toThrow(/1 through 3 enemies/);
    expect(() => manualQuestToWaves(draft({ waves: [{ enemies: [{ className: "saber", attribute: "human", hp: 0 }] }] }))).toThrow(/positive/);
  });
});

describe("JsonManualQuestRepository", () => {
  it("saves, lists, replaces, and removes drafts independently per region", async () => {
    const storage = new MemoryStorage();
    const repo = new JsonManualQuestRepository(storage);
    await repo.save(draft());
    await repo.save(draft({ id: "one-wave", name: "One Wave" }));
    await repo.save(draft({ region: Region.JP, id: "jp-node", name: "JP Node" }));
    await repo.save(draft({ name: "Raid Boss Updated" }));

    expect((await repo.list(Region.NA)).map((quest) => quest.name)).toEqual(["Raid Boss Updated", "One Wave"]);
    expect((await repo.list(Region.JP)).map((quest) => quest.id)).toEqual(["jp-node"]);

    await repo.remove(Region.NA, "raid-boss");
    expect((await repo.list(Region.NA)).map((quest) => quest.id)).toEqual(["one-wave"]);
  });

  it("fails closed for malformed persisted quest data", async () => {
    const storage = new MemoryStorage();
    storage.setItem("fgo-damage-calculator:quests:v1:NA", JSON.stringify({ version: 2, drafts: [] }));
    await expect(new JsonManualQuestRepository(storage).list(Region.NA)).rejects.toThrow(/version 2/);
  });
});
