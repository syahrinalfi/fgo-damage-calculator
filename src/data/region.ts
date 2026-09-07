import { Region } from "@atlasacademy/api-connector";

export { Region };

/**
 * Only JP and NA have documented static full-data export files and are
 * treated as supported; CN/KR/TW are valid API regions but their data
 * completeness is unverified (research/01-data-sources.md §1).
 */
export const SUPPORTED_REGIONS = [Region.JP, Region.NA] as const;

export type SupportedRegion = (typeof SUPPORTED_REGIONS)[number];

export function isSupportedRegion(region: Region): region is SupportedRegion {
  return (SUPPORTED_REGIONS as readonly Region[]).includes(region);
}

