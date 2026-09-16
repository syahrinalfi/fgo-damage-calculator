import { describe, expect, it } from "vitest";
import { InMemoryRosterRepository, JsonRosterRepository, type KeyValueStorage } from "./rosterStore.js";
import { Region } from "../data/region.js";

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

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

describe("JsonRosterRepository", () => {
  it("round-trips independent JP and NA profiles through a browser-compatible key-value store", async () => {
    const storage = new MemoryStorage();
    const repo = new JsonRosterRepository(storage);
    const jp = await repo.load(Region.JP);
    jp.masterLevel = 150;
    await repo.save(jp);
    jp.masterLevel = 1;

    expect((await repo.load(Region.JP)).masterLevel).toBe(150);
    expect((await repo.load(Region.NA)).masterLevel).toBe(1);
    expect([...storage.values.keys()]).toEqual([
      "fgo-damage-calculator:roster:v1:JP",
    ]);
  });

  it("fails closed for corrupt, unsupported-version, or wrong-region stored data", async () => {
    const corrupt = new MemoryStorage();
    corrupt.setItem("fgo-damage-calculator:roster:v1:JP", "not-json");
    await expect(new JsonRosterRepository(corrupt).load(Region.JP)).rejects.toThrow(/invalid JSON/);

    const unsupported = new MemoryStorage();
    unsupported.setItem("fgo-damage-calculator:roster:v1:JP", JSON.stringify({ version: 2, profile: {} }));
    await expect(new JsonRosterRepository(unsupported).load(Region.JP)).rejects.toThrow(/version 2/);

    const wrongRegion = new MemoryStorage();
    wrongRegion.setItem("fgo-damage-calculator:roster:v1:JP", JSON.stringify({
      version: 1,
      profile: { region: Region.NA, masterLevel: 1, ownedServants: {}, craftEssenceInventory: [], commandCodeInventory: [], mysticCodes: [], supportPresets: [] },
    }));
    await expect(new JsonRosterRepository(wrongRegion).load(Region.JP)).rejects.toThrow(/region NA/);
  });
});
