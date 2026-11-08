import type { NoblePhantasm, Servant as ServantModule, Skill } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { buildBorrowedSupportCandidate } from "./supportBuild.js";
import { selectNoblePhantasmVersion } from "./npVersionSelection.js";

function np(id: number, condQuestId: number, priority: number): NoblePhantasm.NoblePhantasm {
  return { id, num: 1, priority, condQuestId, condQuestPhase: condQuestId === 0 ? 0 : 1 } as unknown as NoblePhantasm.NoblePhantasm;
}

function skill(id: number, num: number, condQuestId: number): Skill.Skill {
  return { id, num, condQuestId, condQuestPhase: condQuestId === 0 ? 0 : 1 } as unknown as Skill.Skill;
}

function servant(overrides: Partial<ServantModule.Servant> = {}): ServantModule.Servant {
  return {
    id: 504500,
    lvMax: 90,
    noblePhantasms: [np(1, 0, 100), np(2, 94000001, 101)],
    skills: [skill(11, 1, 0), skill(12, 1, 94000002), skill(21, 2, 0), skill(31, 3, 0)],
    ...overrides,
  } as unknown as ServantModule.Servant;
}

describe("buildBorrowedSupportCandidate", () => {
  it("uses the product's standard borrowed-support build", () => {
    const { build } = buildBorrowedSupportCandidate(servant());
    expect(build).toMatchObject({
      servantId: 504500,
      level: 90,
      ascension: 4,
      skillLevels: [10, 10, 10],
      appendSkillLevels: {},
      npLevel: 1,
      fou: { atk: 1000, hp: 1000 },
      commandCodeIds: [],
    });
    expect(build.equippedCraftEssenceId).toBeUndefined();
  });

  it("uses the natural maximum level, never a Grailed one", () => {
    expect(buildBorrowedSupportCandidate(servant({ lvMax: 80 })).build.level).toBe(80);
  });

  it("unlocks every NP and skill strengthening present in the region's data", () => {
    const candidate = buildBorrowedSupportCandidate(servant());
    expect([...(candidate.build.unlockedStrengthenings ?? [])].sort()).toEqual(["94000001:1", "94000002:1"]);
    expect(selectNoblePhantasmVersion(candidate.niceServant.noblePhantasms, candidate.build)?.id).toBe(2);
  });
});
