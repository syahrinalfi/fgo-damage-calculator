import { describe, expect, it } from "vitest";
import { Region } from "../data/region.js";
import {
  addManualEnemy,
  addManualWave,
  createManualQuestDraft,
  removeManualEnemy,
  removeManualWave,
  renameManualQuest,
  updateManualEnemy,
} from "./manualQuestEditor.js";

describe("manual quest editor model", () => {
  it("creates a valid one-wave draft and updates name/enemy data immutably", () => {
    const initial = createManualQuestDraft(Region.NA, "quest-1");
    const renamed = renameManualQuest(initial, "90++ Node");
    const updated = updateManualEnemy(renamed, 0, 0, { hp: 250000, traits: [200, 201] });

    expect(initial).toMatchObject({ id: "quest-1", name: "New Quest", region: Region.NA });
    expect(initial.waves).toHaveLength(1);
    expect(initial.waves[0]?.enemies).toHaveLength(1);
    expect(updated.name).toBe("90++ Node");
    expect(updated.waves[0]?.enemies[0]).toMatchObject({ hp: 250000, traits: [200, 201] });
    expect(initial.waves[0]?.enemies[0]?.hp).not.toBe(250000);
  });

  it("adds and removes waves while preserving the one-wave minimum", () => {
    const initial = createManualQuestDraft(Region.JP, "quest-2");
    const withWave = addManualWave(initial);
    expect(withWave.waves).toHaveLength(2);
    expect(removeManualWave(withWave, 0).waves).toHaveLength(1);
    expect(() => removeManualWave(initial, 0)).toThrow(/at least one wave/);
  });

  it("adds and removes enemies within the one-to-three slot boundary", () => {
    const initial = createManualQuestDraft(Region.NA, "quest-3");
    const two = addManualEnemy(initial, 0);
    const three = addManualEnemy(two, 0);
    expect(three.waves[0]?.enemies).toHaveLength(3);
    expect(() => addManualEnemy(three, 0)).toThrow(/at most 3 enemies/);
    expect(removeManualEnemy(three, 0, 1).waves[0]?.enemies).toHaveLength(2);
    expect(() => removeManualEnemy(initial, 0, 0)).toThrow(/at least one enemy/);
  });

  it("rejects invalid wave and enemy indexes", () => {
    const initial = createManualQuestDraft(Region.NA, "quest-4");
    expect(() => addManualEnemy(initial, 3)).toThrow(/wave index/);
    expect(() => updateManualEnemy(initial, 0, 2, { hp: 1 })).toThrow(/enemy index/);
  });
});
