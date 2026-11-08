import { describe, expect, it } from "vitest";
import type { CraftEssenceCatalogEntry, ServantCatalogEntry } from "fgo-damage-calculator/account";
import { ceMatches, npOptionLabel, servantMatches } from "./rosterPresentation";

const catalog = {
  servantId: 1001,
  collectionNo: 7,
  name: "Artoria Pendragon",
  className: "Saber",
  levelCap: 90,
  npIds: [2001],
  npOptions: [{ id: 2001, name: "Excalibur", card: "Buster" }],
  strengtheningKeys: [],
} satisfies ServantCatalogEntry;

describe("npOptionLabel", () => {
  it("uses the player-facing NP name and card type", () => {
    expect(npOptionLabel(catalog, 2001)).toBe("Excalibur (Buster)");
  });

  it("never exposes an unknown Atlas NP identifier", () => {
    expect(npOptionLabel(catalog, 999_999)).toBe("Noble Phantasm");
  });
});

describe("catalog search", () => {
  it("matches player-facing names without treating database identifiers as search terms", () => {
    const servant = catalog;
    const craftEssence = {
      craftEssenceId: 4001,
      collectionNo: 34,
      name: "Kaleidoscope",
      levelCaps: [20, 40, 60, 80, 100],
    } satisfies CraftEssenceCatalogEntry;

    expect(servantMatches(servant, "artoria")).toBe(true);
    expect(servantMatches(servant, "1001")).toBe(false);
    expect(ceMatches(craftEssence, "kaleido")).toBe(true);
    expect(ceMatches(craftEssence, "4001")).toBe(false);
  });
});
