import type {
  CraftEssenceLimitBreakCount,
  OwnedCommandCode,
  OwnedCraftEssence,
  OwnedMysticCode,
  OwnedServant,
  RosterProfile,
  SupportPreset,
  ServantBuild,
} from "./types.js";

function generateId(): string {
  return crypto.randomUUID();
}

/** Adds or replaces the account's build for this servant — at most one entry per servantId. */
export function setOwnedServant(profile: RosterProfile, servant: OwnedServant): void {
  profile.ownedServants[servant.servantId] = servant;
}

export function removeOwnedServant(profile: RosterProfile, servantId: number): void {
  delete profile.ownedServants[servantId];
}

/** Adds one owned copy of a CE to inventory and returns it (id auto-generated). */
export function addCraftEssence(
  profile: RosterProfile,
  craftEssenceId: number,
  level: number,
  limitBreakCount: CraftEssenceLimitBreakCount,
): OwnedCraftEssence {
  if (!Number.isInteger(limitBreakCount) || limitBreakCount < 0 || limitBreakCount > 4) {
    throw new RangeError(`limitBreakCount must be an integer from 0 through 4, got ${limitBreakCount}`);
  }
  const owned: OwnedCraftEssence = { id: generateId(), craftEssenceId, level, limitBreakCount };
  profile.craftEssenceInventory.push(owned);
  return owned;
}

/**
 * Removes one owned CE copy from inventory, and unequips it from any servant build
 * (owned or a support preset) currently referencing it — an equip reference must never
 * outlive the inventory entry it points to.
 */
export function removeCraftEssence(profile: RosterProfile, ownedCraftEssenceId: string): void {
  profile.craftEssenceInventory = profile.craftEssenceInventory.filter((ce) => ce.id !== ownedCraftEssenceId);
  for (const servant of Object.values(profile.ownedServants)) {
    if (servant.equippedCraftEssenceId === ownedCraftEssenceId) {
      delete servant.equippedCraftEssenceId;
    }
  }
  for (const preset of profile.supportPresets) {
    if (preset.build.equippedCraftEssenceId === ownedCraftEssenceId) {
      delete preset.build.equippedCraftEssenceId;
    }
  }
}

export function addCommandCode(profile: RosterProfile, commandCodeId: number): OwnedCommandCode {
  const owned: OwnedCommandCode = { id: generateId(), commandCodeId };
  profile.commandCodeInventory.push(owned);
  return owned;
}

/** Removes one owned CC copy from inventory and clears it from any build's CC slots. */
export function removeCommandCode(profile: RosterProfile, ownedCommandCodeId: string): void {
  profile.commandCodeInventory = profile.commandCodeInventory.filter((cc) => cc.id !== ownedCommandCodeId);
  const clearSlot = (build: ServantBuild) => {
    for (let i = 0; i < build.commandCodeIds.length; i++) {
      if (build.commandCodeIds[i] === ownedCommandCodeId) {
        build.commandCodeIds[i] = undefined;
      }
    }
  };
  for (const servant of Object.values(profile.ownedServants)) clearSlot(servant);
  for (const preset of profile.supportPresets) clearSlot(preset.build);
}

export function setMysticCode(profile: RosterProfile, mysticCodeId: number, level: number): void {
  const existing = profile.mysticCodes.find((mc) => mc.mysticCodeId === mysticCodeId);
  if (existing) {
    existing.level = level;
  } else {
    const owned: OwnedMysticCode = { mysticCodeId, level };
    profile.mysticCodes.push(owned);
  }
}

/** Saves a named, reusable support build (id auto-generated) and returns it. */
export function addSupportPreset(profile: RosterProfile, name: string, build: ServantBuild): SupportPreset {
  const preset: SupportPreset = { id: generateId(), name, build };
  profile.supportPresets.push(preset);
  return preset;
}

export function removeSupportPreset(profile: RosterProfile, presetId: string): void {
  profile.supportPresets = profile.supportPresets.filter((preset) => preset.id !== presetId);
}
