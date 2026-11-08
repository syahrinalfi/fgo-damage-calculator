import type { MysticCodeCatalogEntry } from "fgo-damage-calculator/account";

/** Filter by player-facing names only; Atlas identifiers remain implementation details. */
export function filterMysticCodes(entries: readonly MysticCodeCatalogEntry[], query: string): MysticCodeCatalogEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return [...entries];
  return entries.filter((entry) => entry.name.toLocaleLowerCase().includes(normalized));
}
