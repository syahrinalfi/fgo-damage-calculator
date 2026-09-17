import type { SupportedRegion } from "../data/region.js";
import { removeCraftEssence } from "./roster.js";
import type {
  AscensionStage,
  CraftEssenceLimitBreakCount,
  NpLevel,
  OwnedCraftEssence,
  OwnedMysticCode,
  OwnedServant,
  RosterProfile,
  SkillLevel,
  ServantBuild,
} from "./types.js";

export interface ServantCatalogEntry {
  readonly servantId: number;
  readonly collectionNo: number;
  readonly name: string;
  readonly levelCap: number;
  readonly npIds: readonly number[];
  readonly strengtheningKeys: readonly string[];
}

export interface CraftEssenceCatalogEntry {
  readonly craftEssenceId: number;
  readonly collectionNo: number;
  readonly name: string;
  /** Caps for LB0 through MLB. Missing stages fall back to the last known cap. */
  readonly levelCaps: readonly number[];
}

export interface MysticCodeCatalogEntry {
  readonly mysticCodeId: number;
  readonly name: string;
}

export interface RosterCatalog {
  readonly servants?: readonly ServantCatalogEntry[];
  readonly craftEssences?: readonly CraftEssenceCatalogEntry[];
  readonly mysticCodes?: readonly MysticCodeCatalogEntry[];
}

export interface RosterValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface RosterValidationResult {
  readonly valid: boolean;
  readonly issues: readonly RosterValidationIssue[];
}

export type OwnedServantPatch = Partial<Omit<OwnedServant, "servantId">>;

export interface OwnedCraftEssenceDraft {
  readonly id?: string;
  readonly level: number;
  readonly limitBreakCount: CraftEssenceLimitBreakCount;
}

function cloneBuild<T extends ServantBuild>(build: T): T {
  return {
    ...build,
    skillLevels: [...build.skillLevels] as T["skillLevels"],
    appendSkillLevels: { ...build.appendSkillLevels },
    ...(build.unlockedStrengthenings ? { unlockedStrengthenings: [...build.unlockedStrengthenings] } : {}),
    fou: { ...build.fou },
    commandCodeIds: [...build.commandCodeIds] as T["commandCodeIds"],
  } as T;
}

function cloneServant(servant: OwnedServant): OwnedServant {
  return {
    ...cloneBuild(servant),
    unlockedStrengthenings: [...servant.unlockedStrengthenings],
  };
}

function cloneProfile(profile: RosterProfile): RosterProfile {
  return {
    ...profile,
    ownedServants: Object.fromEntries(
      Object.entries(profile.ownedServants).map(([id, servant]) => [id, cloneServant(servant)]),
    ),
    craftEssenceInventory: profile.craftEssenceInventory.map((copy) => ({ ...copy })),
    commandCodeInventory: profile.commandCodeInventory.map((copy) => ({ ...copy })),
    mysticCodes: profile.mysticCodes.map((code) => ({ ...code })),
    supportPresets: profile.supportPresets.map((preset) => ({ ...preset, build: cloneBuild(preset.build) })),
  };
}

function assertRegion(profile: RosterProfile, region?: SupportedRegion): void {
  if (region !== undefined && profile.region !== region) {
    throw new RangeError(`Roster region ${profile.region} does not match ${region}`);
  }
}

function generatedId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultServant(catalog: ServantCatalogEntry): OwnedServant {
  return {
    servantId: catalog.servantId,
    level: catalog.levelCap,
    ascension: 4,
    skillLevels: [1, 1, 1],
    appendSkillLevels: {},
    npLevel: 1,
    ...(catalog.npIds.length === 1 ? { selectedNpId: catalog.npIds[0] } : {}),
    unlockedStrengthenings: [],
    fou: { atk: 0, hp: 0 },
    commandCodeIds: [undefined, undefined, undefined, undefined, undefined] as unknown as OwnedServant["commandCodeIds"],
    bondLevel: 0,
  };
}

/** Adds a servant once; subsequent adds return an immutable copy with the existing build intact. */
export function addRosterServant(
  profile: RosterProfile,
  catalog: ServantCatalogEntry,
  region?: SupportedRegion,
): RosterProfile {
  assertRegion(profile, region);
  const next = cloneProfile(profile);
  if (!next.ownedServants[catalog.servantId]) next.ownedServants[catalog.servantId] = defaultServant(catalog);
  return next;
}

export function createRosterServant(catalog: ServantCatalogEntry): OwnedServant {
  return defaultServant(catalog);
}

export function updateRosterServant(profile: RosterProfile, servantId: number, patch: OwnedServantPatch): RosterProfile {
  const next = cloneProfile(profile);
  const existing = next.ownedServants[servantId];
  if (!existing) return next;
  next.ownedServants[servantId] = {
    ...existing,
    ...patch,
    skillLevels: patch.skillLevels ? [...patch.skillLevels] as OwnedServant["skillLevels"] : existing.skillLevels,
    appendSkillLevels: patch.appendSkillLevels ? { ...patch.appendSkillLevels } : existing.appendSkillLevels,
    fou: patch.fou ? { ...patch.fou } : existing.fou,
    commandCodeIds: patch.commandCodeIds ? [...patch.commandCodeIds] as OwnedServant["commandCodeIds"] : existing.commandCodeIds,
    unlockedStrengthenings: patch.unlockedStrengthenings
      ? [...patch.unlockedStrengthenings]
      : existing.unlockedStrengthenings,
  };
  return next;
}

export function removeRosterServant(profile: RosterProfile, servantId: number): RosterProfile {
  const next = cloneProfile(profile);
  delete next.ownedServants[servantId];
  return next;
}

export function addRosterCraftEssence(
  profile: RosterProfile,
  catalog: CraftEssenceCatalogEntry,
  draft: OwnedCraftEssenceDraft,
): RosterProfile {
  const next = cloneProfile(profile);
  const copy: OwnedCraftEssence = {
    id: draft.id ?? generatedId("ce"),
    craftEssenceId: catalog.craftEssenceId,
    level: draft.level,
    limitBreakCount: draft.limitBreakCount,
  };
  next.craftEssenceInventory.push(copy);
  return next;
}

export function updateRosterCraftEssence(
  profile: RosterProfile,
  ownedCraftEssenceId: string,
  patch: Partial<Pick<OwnedCraftEssence, "level" | "limitBreakCount">>,
): RosterProfile {
  const next = cloneProfile(profile);
  const copy = next.craftEssenceInventory.find((item) => item.id === ownedCraftEssenceId);
  if (copy) Object.assign(copy, patch);
  return next;
}

export function removeRosterCraftEssence(profile: RosterProfile, ownedCraftEssenceId: string): RosterProfile {
  const next = cloneProfile(profile);
  removeCraftEssence(next, ownedCraftEssenceId);
  return next;
}

export function setRosterMysticCode(
  profile: RosterProfile,
  catalog: MysticCodeCatalogEntry,
  level: number,
): RosterProfile {
  const next = cloneProfile(profile);
  const existing = next.mysticCodes.find((code) => code.mysticCodeId === catalog.mysticCodeId);
  if (existing) existing.level = level;
  else next.mysticCodes.push({ mysticCodeId: catalog.mysticCodeId, level });
  return next;
}

function issue(issues: RosterValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function integerBetween(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function validateServant(
  issues: RosterValidationIssue[],
  servant: OwnedServant,
  path: string,
  catalog: ServantCatalogEntry | undefined,
): void {
  if (!integerBetween(servant.level, 1, 120)) issue(issues, `${path}.level`, "Level must be an integer from 1 through 120.");
  if (!integerBetween(servant.ascension, 0, 4)) issue(issues, `${path}.ascension`, "Ascension must be from 0 through 4.");
  servant.skillLevels.forEach((value, index) => {
    if (!integerBetween(value, 1, 10)) issue(issues, `${path}.skillLevels.${index}`, "Skill level must be from 1 through 10.");
  });
  for (const [slot, value] of Object.entries(servant.appendSkillLevels)) {
    if (!["1", "2", "3"].includes(slot) || !integerBetween(value, 1, 10)) {
      issue(issues, `${path}.appendSkillLevels.${slot}`, "Append skill level must be from 1 through 10.");
    }
  }
  if (!integerBetween(servant.npLevel, 1, 5)) issue(issues, `${path}.npLevel`, "NP level must be from 1 through 5.");
  if (!integerBetween(servant.fou.atk, 0, 2000)) issue(issues, `${path}.fou.atk`, "ATK Fou must be from 0 through 2000.");
  if (!integerBetween(servant.fou.hp, 0, 2000)) issue(issues, `${path}.fou.hp`, "HP Fou must be from 0 through 2000.");
  if (!integerBetween(servant.bondLevel, 0, 15)) issue(issues, `${path}.bondLevel`, "Bond level must be from 0 through 15.");
  if (catalog) {
    if (catalog.npIds.length > 1 && !catalog.npIds.includes(servant.selectedNpId ?? -1)) {
      issue(issues, `${path}.selectedNpId`, "Select one of the servant's available Noble Phantasms.");
    }
    const allowedStrengthenings = new Set(catalog.strengtheningKeys);
    servant.unlockedStrengthenings.forEach((key, index) => {
      if (!allowedStrengthenings.has(key)) issue(issues, `${path}.unlockedStrengthenings.${index}`, "Unknown strengthening key.");
    });
  }
}

export function validateRoster(profile: RosterProfile, catalog: RosterCatalog = {}): RosterValidationResult {
  const issues: RosterValidationIssue[] = [];
  if (!integerBetween(profile.masterLevel, 1, 190)) issue(issues, "masterLevel", "Master level must be an integer from 1 through 190.");
  const servants = new Map((catalog.servants ?? []).map((entry) => [entry.servantId, entry]));
  Object.entries(profile.ownedServants).forEach(([id, servant]) => validateServant(issues, servant, `ownedServants.${id}`, servants.get(servant.servantId)));

  const craftEssences = new Map((catalog.craftEssences ?? []).map((entry) => [entry.craftEssenceId, entry]));
  profile.craftEssenceInventory.forEach((copy, index) => {
    if (!integerBetween(copy.level, 1, 100)) issue(issues, `craftEssenceInventory.${index}.level`, "CE level must be a positive integer.");
    if (!integerBetween(copy.limitBreakCount, 0, 4)) issue(issues, `craftEssenceInventory.${index}.limitBreakCount`, "Limit break count must be from 0 through 4.");
    const entry = craftEssences.get(copy.craftEssenceId);
    if (entry) {
      const cap = entry.levelCaps[Math.min(copy.limitBreakCount, entry.levelCaps.length - 1)] ?? entry.levelCaps.at(-1) ?? 100;
      if (copy.level > cap) issue(issues, `craftEssenceInventory.${index}.level`, `CE level cannot exceed ${cap} at this limit-break stage.`);
    }
  });

  const mysticCodes = new Map((catalog.mysticCodes ?? []).map((entry) => [entry.mysticCodeId, entry]));
  profile.mysticCodes.forEach((code, index) => {
    if (!integerBetween(code.level, 1, 10)) issue(issues, `mysticCodes.${index}.level`, "Mystic Code level must be from 1 through 10.");
    if (catalog.mysticCodes && !mysticCodes.has(code.mysticCodeId)) issue(issues, `mysticCodes.${index}.mysticCodeId`, "Unknown Mystic Code.");
  });
  return { valid: issues.length === 0, issues };
}

export type { AscensionStage, CraftEssenceLimitBreakCount, NpLevel, SkillLevel };
