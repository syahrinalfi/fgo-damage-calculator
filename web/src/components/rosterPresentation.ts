import type { CraftEssenceCatalogEntry, ServantCatalogEntry } from "fgo-damage-calculator/account";

export function servantMatches(entry: ServantCatalogEntry, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return needle.length === 0 || entry.name.toLocaleLowerCase().includes(needle);
}

export function ceMatches(entry: CraftEssenceCatalogEntry, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return needle.length === 0 || entry.name.toLocaleLowerCase().includes(needle);
}

export function npOptionLabel(catalog: ServantCatalogEntry, id: number): string {
  const np = catalog.npOptions?.find((option) => option.id === id);
  return np === undefined ? "Noble Phantasm" : `${np.name} (${np.card})`;
}

export function strengtheningLabel(key: string, index = 0): string {
  const [, phase] = key.split(":");
  const phaseNo = Number(phase);
  if (!Number.isFinite(phaseNo)) return `Strengthening ${index + 1}`;
  return phaseNo === 1 ? "Interlude 1" : `Rank Up ${phaseNo}`;
}
