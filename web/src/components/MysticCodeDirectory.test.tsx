import { describe, expect, it } from "vitest";
import type { MysticCodeCatalogEntry } from "fgo-damage-calculator/account";
import { filterMysticCodes } from "./mysticCodePresentation";

const entries = [
  { mysticCodeId: 5001, name: "Mage's Association Uniform" },
  { mysticCodeId: 5002, name: "Chaldea Combat Uniform" },
] satisfies readonly MysticCodeCatalogEntry[];

describe("MysticCodeDirectory", () => {
  it("filters by player-facing name", () => {
    expect(filterMysticCodes(entries, "combat")).toEqual([entries[1]]);
    expect(filterMysticCodes(entries, "5002")).toEqual([]);
  });

  it("returns all entries for an empty search", () => {
    expect(filterMysticCodes(entries, " ")).toEqual(entries);
  });
});
