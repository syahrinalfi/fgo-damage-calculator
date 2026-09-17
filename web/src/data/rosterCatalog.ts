import type { CraftEssence, MysticCode } from "@atlasacademy/api-connector";
import {
  getExportClient,
  type NiceServant,
  type SupportedRegion,
} from "fgo-damage-calculator/data";
import type {
  CraftEssenceCatalogEntry,
  MysticCodeCatalogEntry,
  ServantCatalogEntry,
} from "fgo-damage-calculator/account";

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function strengtheningKeys(record: NiceServant): string[] {
  return unique([...record.noblePhantasms, ...record.skills]
    .filter((version) => version.condQuestId !== 0)
    .map((version) => `${version.condQuestId}:${version.condQuestPhase}`));
}

export function normalizeServantCatalog(records: readonly NiceServant[]): ServantCatalogEntry[] {
  return records
    .filter((record) => record.type === "normal" || record.type === "heroine")
    .map((record) => ({
      servantId: record.id,
      collectionNo: record.collectionNo,
      name: record.name,
      levelCap: record.lvMax,
      npIds: unique(record.noblePhantasms.filter((np) => np.condQuestId === 0).map((np) => np.id)),
      strengtheningKeys: strengtheningKeys(record),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.servantId - b.servantId);
}

function levelCaps(record: CraftEssence.CraftEssence): number[] {
  const caps = record.ascensionAdd?.lvMax?.ascension as Record<number, number> | undefined;
  let previous = record.lvMax;
  return [0, 1, 2, 3, 4].map((stage) => {
    const cap = caps?.[stage] ?? (stage === 4 ? record.lvMax : previous);
    previous = cap;
    return cap;
  });
}

export function normalizeCraftEssenceCatalog(records: readonly CraftEssence.CraftEssence[]): CraftEssenceCatalogEntry[] {
  return records
    .filter((record) => record.type === "servantEquip")
    .map((record) => ({
      craftEssenceId: record.id,
      collectionNo: record.collectionNo,
      name: record.name,
      levelCaps: levelCaps(record),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.craftEssenceId - b.craftEssenceId);
}

export function normalizeMysticCodeCatalog(records: readonly Pick<MysticCode.MysticCodeBasic, "id" | "name">[]): MysticCodeCatalogEntry[] {
  return records
    .map((record) => ({ mysticCodeId: record.id, name: record.name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.mysticCodeId - b.mysticCodeId);
}

export interface RosterCatalogData {
  readonly servants: readonly ServantCatalogEntry[];
  readonly craftEssences: readonly CraftEssenceCatalogEntry[];
  readonly mysticCodes: readonly MysticCodeCatalogEntry[];
}

export async function loadRosterCatalog(region: SupportedRegion): Promise<RosterCatalogData> {
  const client = getExportClient(region);
  const [servants, craftEssences, mysticCodes] = await Promise.all([
    client.servants(),
    client.craftEssences(),
    client.mysticCodes(),
  ]);
  return {
    servants: normalizeServantCatalog(servants),
    craftEssences: normalizeCraftEssenceCatalog(craftEssences),
    mysticCodes: normalizeMysticCodeCatalog(mysticCodes),
  };
}
