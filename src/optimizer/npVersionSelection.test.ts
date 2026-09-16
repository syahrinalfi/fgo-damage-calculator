import type { NoblePhantasm } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ServantBuild } from "../account/types.js";
import { npStrengtheningKey, selectNoblePhantasmVersion } from "./npVersionSelection.js";

function np(id: number, priority: number, condQuestId = 0, condQuestPhase = 0): NoblePhantasm.NoblePhantasm {
  return {
    id,
    num: 1,
    npNum: 1,
    priority,
    condQuestId,
    condQuestPhase,
    strengthStatus: condQuestId === 0 ? 1 : 99,
  } as NoblePhantasm.NoblePhantasm;
}

function build(overrides: Partial<ServantBuild> = {}): ServantBuild {
  return {
    servantId: 1,
    level: 90,
    ascension: 4,
    skillLevels: [10, 10, 10],
    appendSkillLevels: {},
    npLevel: 1,
    fou: { atk: 1000, hp: 1000 },
    commandCodeIds: [],
    ...overrides,
  };
}

describe("selectNoblePhantasmVersion", () => {
  const base = np(100101, 101);
  const strengthened = np(100102, 102, 91100102, 3);

  it("keeps the base NP while its strengthening quest is locked", () => {
    expect(selectNoblePhantasmVersion([base, strengthened], build({ selectedNpId: base.id }))).toBe(base);
  });

  it("selects the highest-priority unlocked strengthening", () => {
    const unlockedStrengthenings = [npStrengtheningKey(strengthened)];
    expect(selectNoblePhantasmVersion([base, strengthened], build({ selectedNpId: base.id, unlockedStrengthenings }))).toBe(strengthened);
  });

  it("rejects an explicitly selected strengthened version whose quest is locked", () => {
    expect(() => selectNoblePhantasmVersion([base, strengthened], build({ selectedNpId: strengthened.id }))).toThrow(/locked/i);
  });

  it("requires selectedNpId when multiple unconditional NP forms are available", () => {
    const alternateForm = np(100103, 103);
    expect(() => selectNoblePhantasmVersion([base, alternateForm], build())).toThrow(/selectedNpId/);
    expect(selectNoblePhantasmVersion([base, alternateForm], build({ selectedNpId: alternateForm.id }))).toBe(alternateForm);

    const alternateSlot = { ...alternateForm, num: 2 };
    expect(() => selectNoblePhantasmVersion([base, alternateSlot], build())).toThrow(/selectedNpId/);
  });

  it("returns undefined when the servant has no NP data", () => {
    expect(selectNoblePhantasmVersion([], build())).toBeUndefined();
  });
});
