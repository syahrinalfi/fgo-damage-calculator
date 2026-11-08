import { describe, expect, it } from "vitest";
import { normalizeTraitCatalog } from "./traitCatalog";

describe("normalizeTraitCatalog", () => {
  it("turns Atlas trait keys into searchable player-facing labels", () => {
    expect(normalizeTraitCatalog({ 1: "genderMale", 100: "classSaber" })).toEqual([
      { id: 100, name: "Class Saber" },
      { id: 1, name: "Gender Male" },
    ]);
  });

  it("ignores malformed Atlas trait mapping entries", () => {
    expect(normalizeTraitCatalog({ invalid: "notUsed", 1: "" } as never)).toEqual([]);
  });
});
