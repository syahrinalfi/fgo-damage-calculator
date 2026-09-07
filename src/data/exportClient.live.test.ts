import { describe, expect, it } from "vitest";
import { getExportClient, getNiceEnums, getNiceTraits } from "./exportClient.js";
import { Region } from "./region.js";

describe("ExportClient (live Atlas Academy export files)", () => {
  it("fetches the JP mystic code export dump", async () => {
    const client = getExportClient(Region.JP);
    const codes = await client.mysticCodes();
    expect(codes.length).toBeGreaterThan(0);
    expect(codes[0]?.name).toBeTruthy();
  });

  it("fetches the shared nice_enums export", async () => {
    const enums = await getNiceEnums();
    expect(Object.keys(enums).length).toBeGreaterThan(0);
  });

  it("fetches the shared nice_trait export", async () => {
    const traits = await getNiceTraits();
    expect(Object.keys(traits).length).toBeGreaterThan(0);
  });
});
