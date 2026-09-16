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

/** Minimal browser Storage-compatible contract, kept DOM-free for the root package. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredRosterEnvelope {
  readonly version: 1;
  readonly profile: RosterProfile;
}

function parseStoredRoster(raw: string, region: SupportedRegion): RosterProfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SyntaxError(`Stored roster for ${region} contains invalid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new TypeError(`Stored roster for ${region} must be an object`);
  }
  const envelope = parsed as Partial<StoredRosterEnvelope> & { readonly version?: unknown };
  if (envelope.version !== 1) {
    throw new RangeError(`Stored roster for ${region} uses unsupported version ${String(envelope.version)}`);
  }
  const profile = envelope.profile;
  if (typeof profile !== "object" || profile === null || profile.region !== region) {
    const storedRegion = typeof profile === "object" && profile !== null && "region" in profile
      ? String(profile.region)
      : "missing";
    throw new RangeError(`Stored roster for ${region} contains region ${storedRegion}`);
  }
  if (
    typeof profile.masterLevel !== "number" ||
    typeof profile.ownedServants !== "object" || profile.ownedServants === null ||
    !Array.isArray(profile.craftEssenceInventory) ||
    !Array.isArray(profile.commandCodeInventory) ||
    !Array.isArray(profile.mysticCodes) ||
    !Array.isArray(profile.supportPresets)
  ) {
    throw new TypeError(`Stored roster for ${region} has an invalid profile shape`);
  }
  return profile;
}

/** Versioned JSON persistence suitable for `window.localStorage` or any compatible store. */
export class JsonRosterRepository implements RosterRepository {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly keyPrefix = "fgo-damage-calculator:roster:v1",
  ) {}

  async load(region: SupportedRegion): Promise<RosterProfile> {
    const raw = this.storage.getItem(`${this.keyPrefix}:${region}`);
    return raw === null ? createEmptyRosterProfile(region) : parseStoredRoster(raw, region);
  }

  save(profile: RosterProfile): Promise<void> {
    const envelope: StoredRosterEnvelope = { version: 1, profile };
    this.storage.setItem(`${this.keyPrefix}:${profile.region}`, JSON.stringify(envelope));
    return Promise.resolve();
  }
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
