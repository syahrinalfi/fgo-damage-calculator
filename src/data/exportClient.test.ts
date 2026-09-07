import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportClient, getExportClient, getNiceEnums, getNiceTraits } from "./exportClient.js";
import { Region } from "./region.js";

function mockFetchOnce(body: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? "OK" : "Internal Server Error",
      json: () => Promise.resolve(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExportClient", () => {
  it("fetches from the region-scoped export path", async () => {
    mockFetchOnce([{ id: 1 }]);
    const client = new ExportClient(Region.NA);
    await client.servants();
    expect(fetch).toHaveBeenCalledWith("https://api.atlasacademy.io/export/NA/nice_servant.json");
  });

  it("memoizes: repeated calls reuse the first fetch", async () => {
    mockFetchOnce([{ id: 1 }]);
    const client = new ExportClient(Region.JP);
    await client.mysticCodes();
    await client.mysticCodes();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed fetch, so a later call can retry", async () => {
    mockFetchOnce(null, false);
    const client = new ExportClient(Region.JP);
    await expect(client.items()).rejects.toThrow("500");

    mockFetchOnce([{ id: 1 }]);
    await expect(client.items()).resolves.toEqual([{ id: 1 }]);
  });

  it("getExportClient returns the same instance for the same region", () => {
    expect(getExportClient(Region.JP)).toBe(getExportClient(Region.JP));
  });
});

describe("getNiceEnums", () => {
  it("fetches enums from the shared JP path regardless of account region", async () => {
    mockFetchOnce({ NiceSvtType: {} });
    await getNiceEnums();
    expect(fetch).toHaveBeenCalledWith("https://api.atlasacademy.io/export/JP/nice_enums.json");
  });
});

describe("getNiceTraits", () => {
  it("fetches the shared JP trait-id -> name map", async () => {
    mockFetchOnce({ "1": "genderMale" });
    const traits = await getNiceTraits();
    expect(fetch).toHaveBeenCalledWith("https://api.atlasacademy.io/export/JP/nice_trait.json");
    expect(traits["1"]).toBe("genderMale");
  });
});
