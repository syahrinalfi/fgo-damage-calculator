import { describe, expect, it } from "vitest";
import { normalizeCraftEssenceCatalog, normalizeMysticCodeCatalog, normalizeServantCatalog } from "./rosterCatalog";

describe("roster catalog normalization", () => {
  it("keeps only playable servant records and exposes searchable NP/strengthening metadata", () => {
    const records = [
      {
        id: 1001,
        collectionNo: 7,
        name: "Playable",
        type: "normal",
        lvMax: 90,
        noblePhantasms: [
          { id: 2001, condQuestId: 0, condQuestPhase: 0 },
          { id: 2002, condQuestId: 3001, condQuestPhase: 3 },
        ],
        skills: [{ id: 2101, condQuestId: 3002, condQuestPhase: 2 }],
        relateQuestIds: [3001],
        trialQuestIds: [3002],
      },
      { id: 1002, name: "Enemy", type: "enemy", lvMax: 100, noblePhantasms: [] },
    ] as never[];

    expect(normalizeServantCatalog(records)).toEqual([{
      servantId: 1001,
      collectionNo: 7,
      name: "Playable",
      levelCap: 90,
      npIds: [2001],
      strengtheningKeys: ["3001:3", "3002:2"],
    }]);
  });

  it("uses Atlas CE ascension caps and falls back safely for missing stages", () => {
    const records = [{
      id: 4001,
      collectionNo: 34,
      name: "CE",
      type: "servantEquip",
      lvMax: 100,
      ascensionAdd: { lvMax: { ascension: { 0: 20, 1: 40, 2: 60, 3: 80, 4: 100 } } },
    }] as never[];
    expect(normalizeCraftEssenceCatalog(records)).toEqual([{
      craftEssenceId: 4001,
      collectionNo: 34,
      name: "CE",
      levelCaps: [20, 40, 60, 80, 100],
    }]);
  });

  it("normalizes Mystic Code identifiers and names", () => {
    expect(normalizeMysticCodeCatalog([{ id: 5001, name: "Uniform" }] as never[])).toEqual([
      { mysticCodeId: 5001, name: "Uniform" },
    ]);
  });
});
