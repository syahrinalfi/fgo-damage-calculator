export interface TraitCatalogEntry {
  readonly id: number;
  readonly name: string;
}

export function normalizeTraitCatalog(mapping: Readonly<Record<string, string>>): readonly TraitCatalogEntry[] {
  return Object.entries(mapping)
    .flatMap(([rawId, rawName]) => {
      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || id <= 0 || rawName.trim().length === 0) return [];
      return [{ id, name: rawName.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toLocaleUpperCase()) }];
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id);
}

export async function loadTraitCatalog(): Promise<readonly TraitCatalogEntry[]> {
  const response = await fetch("https://api.atlasacademy.io/export/NA/nice_trait.json");
  if (!response.ok) throw new Error(`Atlas trait catalogue failed with ${response.status}`);
  return normalizeTraitCatalog(await response.json() as Record<string, string>);
}
