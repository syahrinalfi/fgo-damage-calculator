import { describe, expect, it } from "vitest";
import { createEmptyRosterProfile } from "./types.js";
import {
  addCommandCode,
  addCraftEssence,
  addSupportPreset,
  removeCommandCode,
  removeCraftEssence,
  removeOwnedServant,
  removeSupportPreset,
  setMysticCode,
  setOwnedServant,
} from "./roster.js";
import { Region } from "../data/region.js";
import type { OwnedServant, ServantBuild } from "./types.js";

function makeOwnedServant(servantId: number): OwnedServant {
  return {
    servantId,
    level: 1,
    ascension: 0,
    skillLevels: [1, 1, 1],
    appendSkillLevels: {},
    npLevel: 1,
    fou: { atk: 0, hp: 0 },
    commandCodeIds: [undefined, undefined, undefined, undefined, undefined] as unknown as ServantBuild["commandCodeIds"],
    bondLevel: 0,
    unlockedStrengthenings: [],
  };
}

describe("setOwnedServant / removeOwnedServant", () => {
  it("keeps at most one entry per servantId", () => {
    const profile = createEmptyRosterProfile(Region.JP);
    setOwnedServant(profile, makeOwnedServant(1));
    setOwnedServant(profile, { ...makeOwnedServant(1), level: 90 });
    expect(Object.keys(profile.ownedServants)).toHaveLength(1);
    expect(profile.ownedServants[1]?.level).toBe(90);
  });

  it("removes a servant by id", () => {
    const profile = createEmptyRosterProfile(Region.JP);
    setOwnedServant(profile, makeOwnedServant(1));
    removeOwnedServant(profile, 1);
    expect(profile.ownedServants[1]).toBeUndefined();
  });
});

describe("craft essence inventory", () => {
  it("adds copies with distinct ids", () => {
    const profile = createEmptyRosterProfile(Region.NA);
    const a = addCraftEssence(profile, 9999, 1, 0);
    const b = addCraftEssence(profile, 9999, 10, 4);
    expect(profile.craftEssenceInventory).toHaveLength(2);
    expect(a.id).not.toBe(b.id);
    expect(a.limitBreakCount).toBe(0);
    expect(b.limitBreakCount).toBe(4);
    expect(() => addCraftEssence(profile, 9999, 1, 5 as never)).toThrow(RangeError);
  });

  it("unequips a removed CE from every servant and support preset referencing it", () => {
    const profile = createEmptyRosterProfile(Region.NA);
    const ce = addCraftEssence(profile, 9999, 1, 0);

    const servant = makeOwnedServant(1);
    servant.equippedCraftEssenceId = ce.id;
    setOwnedServant(profile, servant);

    const presetBuild: ServantBuild = { ...makeOwnedServant(2), equippedCraftEssenceId: ce.id };
    const preset = addSupportPreset(profile, "Merlin support", presetBuild);

    removeCraftEssence(profile, ce.id);

    expect(profile.craftEssenceInventory).toHaveLength(0);
    expect(profile.ownedServants[1]?.equippedCraftEssenceId).toBeUndefined();
    expect(profile.supportPresets.find((p) => p.id === preset.id)?.build.equippedCraftEssenceId).toBeUndefined();
  });
});

describe("command code inventory", () => {
  it("clears a removed CC from every build's slots", () => {
    const profile = createEmptyRosterProfile(Region.JP);
    const cc = addCommandCode(profile, 100);

    const servant = makeOwnedServant(1);
    servant.commandCodeIds[0] = cc.id;
    setOwnedServant(profile, servant);

    removeCommandCode(profile, cc.id);

    expect(profile.commandCodeInventory).toHaveLength(0);
    expect(profile.ownedServants[1]?.commandCodeIds[0]).toBeUndefined();
  });
});

describe("setMysticCode", () => {
  it("adds a new mystic code entry", () => {
    const profile = createEmptyRosterProfile(Region.JP);
    setMysticCode(profile, 20, 10);
    expect(profile.mysticCodes).toEqual([{ mysticCodeId: 20, level: 10 }]);
  });

  it("updates the level of an already-owned mystic code instead of duplicating it", () => {
    const profile = createEmptyRosterProfile(Region.JP);
    setMysticCode(profile, 20, 1);
    setMysticCode(profile, 20, 10);
    expect(profile.mysticCodes).toEqual([{ mysticCodeId: 20, level: 10 }]);
  });
});

describe("support presets", () => {
  it("adds and removes a named preset", () => {
    const profile = createEmptyRosterProfile(Region.JP);
    const preset = addSupportPreset(profile, "Friend Merlin", makeOwnedServant(1));
    expect(profile.supportPresets).toHaveLength(1);

    removeSupportPreset(profile, preset.id);
    expect(profile.supportPresets).toHaveLength(0);
  });
});
