import type { CraftEssence, Servant as ServantModule, Skill } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { createEmptyRosterProfile, type OwnedServant } from "../account/types.js";
import { Region } from "../data/region.js";
import { buildRosterOptimizerInputs } from "./rosterInputs.js";

function owned(servantId: number, overrides: Partial<OwnedServant> = {}): OwnedServant {
  return {
    servantId,
    level: 70,
    ascension: 3,
    skillLevels: [4, 6, 8],
    appendSkillLevels: { 2: 5 },
    npLevel: 3,
    fou: { atk: 500, hp: 600 },
    commandCodeIds: [],
    bondLevel: 7,
    unlockedStrengthenings: [],
    ...overrides,
  };
}

function skill(id: number, num: number, condQuestId = 0, strengthStatus = 0): Skill.Skill {
  return {
    id,
    num,
    priority: strengthStatus,
    strengthStatus,
    condQuestId,
    condQuestPhase: condQuestId === 0 ? 0 : 1,
    functions: [],
    coolDown: Array.from({ length: 10 }, (_, index) => 10 - index),
  } as unknown as Skill.Skill;
}

describe("buildRosterOptimizerInputs", () => {
  it("hydrates owned builds, unlocked skill versions, and CE copies without changing account investment", () => {
    const profile = createEmptyRosterProfile(Region.NA);
    profile.ownedServants[1] = owned(1, { unlockedStrengthenings: ["9001:1"] });
    profile.ownedServants[2] = owned(2, { npLevel: 5, skillLevels: [10, 9, 8] });
    profile.craftEssenceInventory.push({ id: "ce-a", craftEssenceId: 100, level: 20, limitBreakCount: 0 });
    profile.craftEssenceInventory.push({ id: "ce-b", craftEssenceId: 100, level: 60, limitBreakCount: 2 });

    const servantOne = {
      id: 1,
      skills: [skill(101, 1), skill(102, 1, 9001, 1), skill(201, 2), skill(301, 3)],
      noblePhantasms: [],
    } as unknown as ServantModule.Servant;
    const servantTwo = {
      id: 2,
      skills: [skill(401, 1), skill(501, 2), skill(601, 3)],
      noblePhantasms: [],
    } as unknown as ServantModule.Servant;
    const ce = { id: 100, name: "Owned CE" } as unknown as CraftEssence.CraftEssence;

    const inputs = buildRosterOptimizerInputs(
      profile,
      new Map([[1, servantOne], [2, servantTwo]]),
      new Map([[100, ce]]),
    );

    expect(inputs.ownedServantCandidates.map((candidate) => candidate.build.npLevel)).toEqual([3, 5]);
    expect(inputs.skillSources[0]?.skills.map((slot) => [slot.skill.id, slot.level])).toEqual([
      [102, 4],
      [201, 6],
      [301, 8],
    ]);
    expect(inputs.skillSources[1]?.skills.map((slot) => slot.level)).toEqual([10, 9, 8]);
    expect(inputs.cePool).toEqual([
      { data: ce, level: 20, inventoryId: "ce-a", limitBreakCount: 0 },
      { data: ce, level: 60, inventoryId: "ce-b", limitBreakCount: 2 },
    ]);
    expect(profile.ownedServants[1]?.npLevel).toBe(3);
  });

  it("fails explicitly when static servant or CE data is missing", () => {
    const profile = createEmptyRosterProfile(Region.JP);
    profile.ownedServants[1] = owned(1);
    expect(() => buildRosterOptimizerInputs(profile, new Map(), new Map())).toThrow(/servant 1/);

    delete profile.ownedServants[1];
    profile.craftEssenceInventory.push({ id: "missing", craftEssenceId: 999, level: 1, limitBreakCount: 0 });
    expect(() => buildRosterOptimizerInputs(profile, new Map(), new Map())).toThrow(/CE 999/);
  });
});
