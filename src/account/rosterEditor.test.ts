import { describe, expect, it } from "vitest";
import { Region } from "../data/region.js";
import {
  addRosterCraftEssence,
  addRosterServant,
  createRosterServant,
  removeRosterCraftEssence,
  removeRosterServant,
  setRosterMysticCode,
  updateRosterServant,
  validateRoster,
  type CraftEssenceCatalogEntry,
  type MysticCodeCatalogEntry,
  type ServantCatalogEntry,
} from "./rosterEditor.js";
import { createEmptyRosterProfile, type RosterProfile } from "./types.js";

const servant: ServantCatalogEntry = {
  servantId: 1001,
  name: "Test Servant",
  levelCap: 100,
  npIds: [9001],
  strengtheningKeys: ["5001:1"],
};

const multiNpServant: ServantCatalogEntry = {
  ...servant,
  servantId: 1002,
  name: "Two Forms",
  npIds: [9002, 9003],
};

const craftEssence: CraftEssenceCatalogEntry = {
  craftEssenceId: 2001,
  name: "Test CE",
  levelCaps: [15, 25, 35, 50, 100],
};

const mysticCode: MysticCodeCatalogEntry = {
  mysticCodeId: 3001,
  name: "Test Uniform",
};

function profileWithServant(): RosterProfile {
  return addRosterServant(createEmptyRosterProfile(Region.NA), servant);
}

describe("roster editor domain operations", () => {
  it("creates servant defaults and does not mutate the source profile", () => {
    const source = createEmptyRosterProfile(Region.NA);
    const next = addRosterServant(source, servant);

    expect(source.ownedServants).toEqual({});
    expect(next.ownedServants[servant.servantId]).toMatchObject({
      servantId: servant.servantId,
      level: 100,
      ascension: 4,
      skillLevels: [1, 1, 1],
      appendSkillLevels: {},
      npLevel: 1,
      fou: { atk: 0, hp: 0 },
      bondLevel: 0,
      commandCodeIds: [undefined, undefined, undefined, undefined, undefined],
    });
    expect(next.ownedServants[servant.servantId].selectedNpId).toBe(9001);
  });

  it("re-adding a servant replaces one entry while preserving existing investment", () => {
    const first = addRosterServant(createEmptyRosterProfile(Region.NA), servant);
    const invested = updateRosterServant(first, servant.servantId, {
      level: 102,
      npLevel: 3,
      appendSkillLevels: { 1: 5 },
    });
    const replaced = addRosterServant(invested, servant);

    expect(Object.keys(replaced.ownedServants)).toEqual([String(servant.servantId)]);
    expect(replaced.ownedServants[servant.servantId]).toMatchObject({ level: 102, npLevel: 3, appendSkillLevels: { 1: 5 } });
  });

  it("requires an explicit NP form when multiple usable forms exist", () => {
    const next = addRosterServant(createEmptyRosterProfile(Region.NA), multiNpServant);
    expect(next.ownedServants[multiNpServant.servantId].selectedNpId).toBeUndefined();
    expect(validateRoster(next, { servants: [multiNpServant] }).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: `ownedServants.${multiNpServant.servantId}.selectedNpId` }),
    ]));
  });

  it("validates servant boundaries and optional append slots", () => {
    const source = profileWithServant();
    const next = updateRosterServant(source, servant.servantId, {
      level: 121,
      ascension: 5 as never,
      skillLevels: [0, 11, 10] as never,
      appendSkillLevels: { 1: 0 as never, 2: 10 },
      npLevel: 6 as never,
      fou: { atk: -1, hp: 2001 },
      bondLevel: 16,
    });
    const result = validateRoster(next, { servants: [servant] });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      `ownedServants.${servant.servantId}.level`,
      `ownedServants.${servant.servantId}.ascension`,
      `ownedServants.${servant.servantId}.skillLevels.0`,
      `ownedServants.${servant.servantId}.skillLevels.1`,
      `ownedServants.${servant.servantId}.appendSkillLevels.1`,
      `ownedServants.${servant.servantId}.npLevel`,
      `ownedServants.${servant.servantId}.fou.atk`,
      `ownedServants.${servant.servantId}.fou.hp`,
      `ownedServants.${servant.servantId}.bondLevel`,
    ]));
  });

  it("rejects a profile from the wrong region", () => {
    const profile = createEmptyRosterProfile(Region.JP);
    expect(() => addRosterServant(profile, servant, Region.NA)).toThrow(/region/i);
  });

  it("adds independent CE copies with per-copy caps", () => {
    const source = createEmptyRosterProfile(Region.NA);
    const one = addRosterCraftEssence(source, craftEssence, { id: "ce-1", level: 15, limitBreakCount: 0 });
    const two = addRosterCraftEssence(one, craftEssence, { id: "ce-2", level: 100, limitBreakCount: 4 });

    expect(source.craftEssenceInventory).toHaveLength(0);
    expect(two.craftEssenceInventory.map((copy) => copy.id)).toEqual(["ce-1", "ce-2"]);
    expect(validateRoster(two, { craftEssences: [craftEssence] }).valid).toBe(true);
    expect(validateRoster(updateRosterServant(two, servant.servantId, {}), { craftEssences: [craftEssence] }).valid).toBe(true);
  });

  it("validates CE level against the selected limit-break cap", () => {
    const profile = addRosterCraftEssence(createEmptyRosterProfile(Region.NA), craftEssence, {
      id: "ce-1",
      level: 26,
      limitBreakCount: 0,
    });
    const result = validateRoster(profile, { craftEssences: [craftEssence] });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "craftEssenceInventory.0.level" }),
    ]));
  });

  it("removes a CE copy and clears references without changing other profile fields", () => {
    const withServant = profileWithServant();
    const equipped = updateRosterServant(withServant, servant.servantId, { equippedCraftEssenceId: "ce-1" });
    const withCe = addRosterCraftEssence(equipped, craftEssence, { id: "ce-1", level: 15, limitBreakCount: 0 });
    const next = removeRosterCraftEssence(withCe, "ce-1");

    expect(next.craftEssenceInventory).toEqual([]);
    expect(next.ownedServants[servant.servantId].equippedCraftEssenceId).toBeUndefined();
    expect(next.ownedServants[servant.servantId].servantId).toBe(servant.servantId);
    expect(withCe.ownedServants[servant.servantId].equippedCraftEssenceId).toBe("ce-1");
  });

  it("supports unique mystic-code rows and immutable updates", () => {
    const source = createEmptyRosterProfile(Region.NA);
    const first = setRosterMysticCode(source, mysticCode, 4);
    const second = setRosterMysticCode(first, mysticCode, 10);

    expect(source.mysticCodes).toEqual([]);
    expect(second.mysticCodes).toEqual([{ mysticCodeId: 3001, level: 10 }]);
    expect(validateRoster(second, { mysticCodes: [mysticCode] }).valid).toBe(true);
    expect(validateRoster(setRosterMysticCode(second, mysticCode, 11), { mysticCodes: [mysticCode] }).valid).toBe(false);
  });

  it("removes a servant without removing CE inventory", () => {
    const withCe = addRosterCraftEssence(profileWithServant(), craftEssence, { id: "ce-1", level: 15, limitBreakCount: 0 });
    const next = removeRosterServant(withCe, servant.servantId);
    expect(next.ownedServants).toEqual({});
    expect(next.craftEssenceInventory).toHaveLength(1);
  });
});
