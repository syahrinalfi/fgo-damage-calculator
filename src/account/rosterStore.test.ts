import { describe, expect, it } from "vitest";
import { InMemoryRosterRepository } from "./rosterStore.js";
import { Region } from "../data/region.js";

describe("InMemoryRosterRepository", () => {
  it("creates an empty profile on first load per region", async () => {
    const repo = new InMemoryRosterRepository();
    const profile = await repo.load(Region.JP);
    expect(profile.region).toBe(Region.JP);
    expect(Object.keys(profile.ownedServants)).toHaveLength(0);
  });

  it("keeps JP and NA profiles fully independent", async () => {
    const repo = new InMemoryRosterRepository();
    const jp = await repo.load(Region.JP);
    jp.masterLevel = 120;
    await repo.save(jp);

    const na = await repo.load(Region.NA);
    expect(na.masterLevel).toBe(1);

    const reloadedJp = await repo.load(Region.JP);
    expect(reloadedJp.masterLevel).toBe(120);
  });
});
