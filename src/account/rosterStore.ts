import type { SupportedRegion } from "../data/region.js";
import { createEmptyRosterProfile, type RosterProfile } from "./types.js";

/**
 * Storage-backend-agnostic roster persistence. research/00-project-overview.md §3
 * decided account data is "stored locally" but did not pin down the actual browser
 * storage mechanism (localStorage/IndexedDB/etc.) — that's a UI-layer decision not yet
 * made. This interface lets a real backend be swapped in later without reworking
 * anything that consumes a RosterRepository.
 */
export interface RosterRepository {
  load(region: SupportedRegion): Promise<RosterProfile>;
  save(profile: RosterProfile): Promise<void>;
}

/** In-memory repository — one profile per region, lost on process exit. Used for tests
 * and as the default until a persistent backend is chosen. */
export class InMemoryRosterRepository implements RosterRepository {
  private readonly profiles = new Map<SupportedRegion, RosterProfile>();

  load(region: SupportedRegion): Promise<RosterProfile> {
    let profile = this.profiles.get(region);
    if (!profile) {
      profile = createEmptyRosterProfile(region);
      this.profiles.set(region, profile);
    }
    return Promise.resolve(profile);
  }

  save(profile: RosterProfile): Promise<void> {
    this.profiles.set(profile.region, profile);
    return Promise.resolve();
  }
}
