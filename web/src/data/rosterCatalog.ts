import { Card, type CraftEssence, type MysticCode } from "@atlasacademy/api-connector";
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

function portraitUrl(record: { readonly extraAssets?: { readonly faces?: { readonly ascension?: Readonly<Record<string, string>>; readonly equip?: Readonly<Record<string, string>> } } }): string | undefined {
  const faces = record.extraAssets?.faces;
  const ascension = faces?.ascension;
  if (ascension !== undefined) {
    const stage = Object.keys(ascension).map(Number).filter(Number.isFinite).sort((left, right) => right - left)[0];
    if (stage !== undefined) return ascension[String(stage)];
  }
  return faces?.equip === undefined ? undefined : Object.values(faces.equip)[0];
}

function cardLabel(card: string | number): string {
  const label = Object.entries(Card).find(([, value]) => value === String(card))?.[0];
  return label === undefined ? "Unknown card" : `${label.slice(0, 1)}${label.slice(1).toLocaleLowerCase()}`;
}

function strengtheningKeys(record: NiceServant): string[] {
  return unique([...record.noblePhantasms, ...record.skills]
    .filter((version) => version.condQuestId !== 0)
    .map((version) => `${version.condQuestId}:${version.condQuestPhase}`));
}

export function normalizeServantCatalog(records: readonly NiceServant[]): ServantCatalogEntry[] {
  return records
    .filter((record) => record.type === "normal" || record.type === "heroine")
    .map((record) => {
      const npOptions = record.noblePhantasms
        .filter((np) => np.condQuestId === 0)
        .map((np) => ({ id: np.id, name: np.name, card: cardLabel(np.card) }));
      return {
        servantId: record.id,
        collectionNo: record.collectionNo,
        name: record.name,
        className: record.className === undefined || String(record.className).trim().length === 0
          ? "Unknown class"
          : String(record.className),
        portraitUrl: portraitUrl(record),
        levelCap: record.lvMax,
        npIds: unique(npOptions.map((np) => np.id)),
        npOptions,
        strengtheningKeys: strengtheningKeys(record),
      };
    })
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
      portraitUrl: portraitUrl(record),
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

const CATALOG_CACHE_PREFIX = "fgo-damage-calculator:atlas-catalog:v2";
const CATALOG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CatalogCacheEntry { readonly savedAt: number; readonly data: RosterCatalogData; }

function cachedCatalog(region: SupportedRegion): RosterCatalogData | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(`${CATALOG_CACHE_PREFIX}:${region}`);
    if (raw === null) return undefined;
    const entry = JSON.parse(raw) as Partial<CatalogCacheEntry>;
    return typeof entry.savedAt === "number" && Date.now() - entry.savedAt < CATALOG_CACHE_TTL_MS && entry.data !== undefined ? entry.data : undefined;
  } catch { return undefined; }
}

function cacheCatalog(region: SupportedRegion, data: RosterCatalogData): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(`${CATALOG_CACHE_PREFIX}:${region}`, JSON.stringify({ savedAt: Date.now(), data } satisfies CatalogCacheEntry)); } catch { /* cache is optional */ }
}

export async function loadRosterCatalog(region: SupportedRegion): Promise<RosterCatalogData> {
  const cached = cachedCatalog(region);
  if (cached !== undefined) return cached;
  const client = getExportClient(region);
  const [servants, craftEssences, mysticCodes] = await Promise.all([
    client.servants(),
    client.craftEssences(),
    client.mysticCodes(),
  ]);
  const data = {
    servants: normalizeServantCatalog(servants),
    craftEssences: normalizeCraftEssenceCatalog(craftEssences),
    mysticCodes: normalizeMysticCodeCatalog(mysticCodes),
  };
  cacheCatalog(region, data);
  return data;
}
