import type { SupportedRegion } from "../data/region.js";

export type AscensionStage = 0 | 1 | 2 | 3 | 4;
export type SkillLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type NpLevel = 1 | 2 | 3 | 4 | 5;
export type AppendSkillSlot = 1 | 2 | 3;

export interface FouValues {
  atk: number;
  hp: number;
}

/**
 * One servant's full build state — shared shape for the user's own roster entries and
 * reusable named support presets (research/00-project-overview.md §3, "Support/rental
 * servants get full manual entry": supports are built with identical fidelity to owned
 * servants, no "assumed meta build" shortcut).
 */
export interface ServantBuild {
  servantId: number;
  level: number;
  ascension: AscensionStage;
  skillLevels: [SkillLevel, SkillLevel, SkillLevel];
  appendSkillLevels: Partial<Record<AppendSkillSlot, SkillLevel>>;
  npLevel: NpLevel;
  fou: FouValues;
  /** References an entry in the owning profile's craftEssenceInventory; unset = no CE equipped. */
  equippedCraftEssenceId?: string;
  /** Up to 5 Command Code slots; each references an entry in commandCodeInventory. */
  commandCodeIds: [string?, string?, string?, string?, string?];
}

/**
 * An owned servant adds account-state fields that only make sense for the user's own
 * roster, not a borrowed support build: bond level (needed for the Bond-15 party-wide
 * bonus, research/00 §3) and Rank-Up/Interlude unlock state.
 */
export interface OwnedServant extends ServantBuild {
  bondLevel: number;
  /**
   * IDs of Rank-Up Quest / Interlude strengthenings this account has actually cleared.
   * Atlas Academy's exact field for enumerating a servant's available strengthenings is
   * an open research item (research/00 §4, "NP/skill changes from Rank-Up Quests &
   * Interludes") — kept as an opaque string set so the engine layer can define its own
   * id scheme once that's resolved, without another roster schema migration.
   */
  unlockedStrengthenings: string[];
}

/**
 * A named, reusable support build (research/00 §3: users can save presets like "my
 * go-to Merlin support" to avoid re-entering the same support repeatedly). Not part of
 * the user's own roster or Cost budget.
 */
export interface SupportPreset {
  id: string;
  name: string;
  build: ServantBuild;
}

/** CE ownership is a per-copy inventory item (research/00 §3), not a yes/no set. */
export interface OwnedCraftEssence {
  id: string;
  craftEssenceId: number;
  level: number;
  limitBroken: boolean;
}

/** Command Codes are also owned per-copy; unlike CEs they have no level/MLB state. */
export interface OwnedCommandCode {
  id: string;
  commandCodeId: number;
}

export interface OwnedMysticCode {
  mysticCodeId: number;
  level: number;
}

/**
 * One region's complete account state. research/00 §3 established that regions are
 * fully separate accounts and must never be merged: a user with both a JP and an NA
 * account holds two independent RosterProfiles, one per SupportedRegion.
 */
export interface RosterProfile {
  region: SupportedRegion;
  masterLevel: number;
  /**
   * Keyed by servantId — a servant is owned at most once; duplicate copies only ever
   * raise npLevel, they never create a second entry for the same servant (research/00
   * §3, contrasted explicitly with CE inventory which does support multiple copies).
   * A plain record rather than a Map so a profile round-trips through JSON.stringify
   * unchanged once a real (localStorage/IndexedDB) RosterRepository backend exists.
   */
  ownedServants: Record<number, OwnedServant>;
  craftEssenceInventory: OwnedCraftEssence[];
  commandCodeInventory: OwnedCommandCode[];
  mysticCodes: OwnedMysticCode[];
  supportPresets: SupportPreset[];
}

export function createEmptyRosterProfile(region: SupportedRegion): RosterProfile {
  return {
    region,
    masterLevel: 1,
    ownedServants: {},
    craftEssenceInventory: [],
    commandCodeInventory: [],
    mysticCodes: [],
    supportPresets: [],
  };
}
