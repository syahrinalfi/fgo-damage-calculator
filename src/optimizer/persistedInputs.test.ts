import type { CraftEssence, Servant as ServantModule, Skill } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { JsonRosterRepository, type KeyValueStorage } from "../account/rosterStore.js";
import { createEmptyRosterProfile } from "../account/types.js";
import { Region } from "../data/region.js";
import { JsonManualQuestRepository, type ManualEnemyInput } from "../quest/manualQuest.js";
import { loadPersistedOptimizerSession } from "./persistedInputs.js";

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function skill(id: number, num: number): Skill.Skill {
  return { id, num, condQuestId: 0, condQuestPhase: 0, functions: [], coolDown: [5] } as unknown as Skill.Skill;
}

describe("loadPersistedOptimizerSession", () => {
  it("loads one region, fetches each required Atlas record once, and returns optimizer-ready inputs", async () => {
    const storage = new MemoryStorage();
    const rosterRepository = new JsonRosterRepository(storage);
    const questRepository = new JsonManualQuestRepository(storage);
    const profile = createEmptyRosterProfile(Region.NA);
    profile.ownedServants[1] = {
      servantId: 1,
      level: 80,
      ascension: 4,
      skillLevels: [10, 9, 8],
      appendSkillLevels: {},
      npLevel: 2,
      fou: { atk: 1000, hp: 1000 },
      commandCodeIds: [],
      bondLevel: 10,
      unlockedStrengthenings: [],
    };
    profile.craftEssenceInventory.push(
      { id: "ce-1", craftEssenceId: 100, level: 20, limitBreakCount: 0 },
      { id: "ce-2", craftEssenceId: 100, level: 40, limitBreakCount: 1 },
    );
    await rosterRepository.save(profile);
    await questRepository.save({
      id: "manual-node",
      name: "Manual Node",
      region: Region.NA,
      waves: [{ enemies: [{ className: "lancer" as ManualEnemyInput["className"], attribute: "earth" as ManualEnemyInput["attribute"], hp: 100000 }] }],
    });

    const servant = { id: 1, skills: [skill(11, 1), skill(12, 2), skill(13, 3)], noblePhantasms: [] } as unknown as ServantModule.Servant;
    const ce = { id: 100, name: "Test CE" } as unknown as CraftEssence.CraftEssence;
    const servantCalls: number[] = [];
    const ceCalls: number[] = [];
    const session = await loadPersistedOptimizerSession(
      Region.NA,
      rosterRepository,
      questRepository,
      {
        servant: (id) => { servantCalls.push(id); return Promise.resolve(servant); },
        craftEssence: (id) => { ceCalls.push(id); return Promise.resolve(ce); },
      },
    );

    expect(servantCalls).toEqual([1]);
    expect(ceCalls).toEqual([100]);
    expect(session.profile.region).toBe(Region.NA);
    expect(session.questDrafts.map((draft) => draft.id)).toEqual(["manual-node"]);
    expect(session.optimizerInputs.ownedServantCandidates[0]?.build.npLevel).toBe(2);
    expect(session.optimizerInputs.cePool.map((copy) => copy.inventoryId)).toEqual(["ce-1", "ce-2"]);
  });
});
