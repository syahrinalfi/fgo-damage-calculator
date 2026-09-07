import { describe, expect, it } from "vitest";
import { isSupportedRegion, Region, SUPPORTED_REGIONS } from "./region.js";

describe("isSupportedRegion", () => {
  it.each(SUPPORTED_REGIONS)("accepts %s", (region) => {
    expect(isSupportedRegion(region)).toBe(true);
  });

  it.each([Region.CN, Region.KR, Region.TW])("rejects %s", (region) => {
    expect(isSupportedRegion(region)).toBe(false);
  });
});
