import { describe, expect, it } from "vitest";
import { getGameDataClient, Region } from "../data/index.js";
import { getQuestData } from "./questData.js";

describe("getQuestData (live Atlas Academy API)", () => {
  it("normalizes a known JP quest phase into waves (research/08-enemy-mechanics.md §1 example)", async () => {
    const client = getGameDataClient(Region.JP);
    const data = await getQuestData(client, 1000001, 1);

    expect(data.questId).toBe(1000001);
    expect(data.phase).toBe(1);
    expect(data.waves.length).toBeGreaterThan(0);
    expect(data.waves[0]?.initialEnemies.length).toBeGreaterThan(0);
  });
});
