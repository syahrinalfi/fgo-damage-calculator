import { describe, expect, it } from "vitest";
import { getGameDataClient, Region } from "./index.js";

describe("GameDataClient (live Atlas Academy API)", () => {
  it("fetches a known JP servant (Mash Kyrielight, id 1)", async () => {
    const client = getGameDataClient(Region.JP);
    const mash = await client.servant(1);
    expect(mash.name).toBeTruthy();
    expect(mash.className).toBeTruthy();
  });

  it("fetches the JP mystic code list", async () => {
    const client = getGameDataClient(Region.JP);
    const list = await client.mysticCodeList();
    expect(list.length).toBeGreaterThan(0);
  });

  it("fetches the master level -> cost constant table", async () => {
    const client = getGameDataClient(Region.JP);
    const table = await client.masterLevelConstant();
    expect(Object.keys(table).length).toBeGreaterThan(0);
  });
});
