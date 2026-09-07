import type {
  CraftEssence,
  MysticCode,
  CommandCode,
  Item,
  Event,
  War,
  EnumList,
} from "@atlasacademy/api-connector";
import type { SupportedRegion } from "./region.js";
import type { NiceServant, NiceServantWithLore } from "./gameDataClient.js";

const EXPORT_BASE = "https://api.atlasacademy.io/export";

/**
 * Fetches one static export dump (research/01-data-sources.md §2). These are large,
 * infrequently-changing files refreshed within an hour of game updates, so this is a
 * plain fetch rather than routing through ApiConnector, which has no export-file support.
 */
async function fetchExport<T>(path: string): Promise<T> {
  const response = await fetch(`${EXPORT_BASE}/${path}`);
  if (!response.ok) {
    throw new Error(`Atlas Academy export fetch failed: ${path} -> ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/** Caches a lazily-created promise so concurrent/repeat callers share one fetch. */
function memoize<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    if (!cached) {
      cached = load().catch((error: unknown) => {
        cached = undefined;
        throw error;
      });
    }
    return cached;
  };
}

/**
 * Bulk static-export client (research/01 §2's recommended ingestion strategy: pull the
 * full per-region dumps once rather than one /nice call per servant/CE/etc.). One instance
 * per region, memoized like GameDataClient — see getExportClient().
 */
export class ExportClient {
  readonly region: SupportedRegion;

  private readonly loadServants = memoize(() => fetchExport<NiceServant[]>(`${this.region}/nice_servant.json`));
  private readonly loadServantsWithLore = memoize(() =>
    fetchExport<NiceServantWithLore[]>(`${this.region}/nice_servant_lore.json`),
  );
  private readonly loadCraftEssences = memoize(() =>
    fetchExport<CraftEssence.CraftEssence[]>(`${this.region}/nice_equip.json`),
  );
  private readonly loadMysticCodes = memoize(() =>
    fetchExport<MysticCode.MysticCode[]>(`${this.region}/nice_mystic_code.json`),
  );
  private readonly loadCommandCodes = memoize(() =>
    fetchExport<CommandCode.CommandCode[]>(`${this.region}/nice_command_code.json`),
  );
  private readonly loadItems = memoize(() => fetchExport<Item.Item[]>(`${this.region}/nice_item.json`));
  private readonly loadEvents = memoize(() => fetchExport<Event.Event[]>(`${this.region}/nice_event.json`));
  private readonly loadWars = memoize(() => fetchExport<War.War[]>(`${this.region}/nice_war.json`));

  constructor(region: SupportedRegion) {
    this.region = region;
  }

  servants(): Promise<NiceServant[]> {
    return this.loadServants();
  }

  /** Includes profile/ascension lore text; larger download than servants(). */
  servantsWithLore(): Promise<NiceServantWithLore[]> {
    return this.loadServantsWithLore();
  }

  craftEssences(): Promise<CraftEssence.CraftEssence[]> {
    return this.loadCraftEssences();
  }

  mysticCodes(): Promise<MysticCode.MysticCode[]> {
    return this.loadMysticCodes();
  }

  commandCodes(): Promise<CommandCode.CommandCode[]> {
    return this.loadCommandCodes();
  }

  items(): Promise<Item.Item[]> {
    return this.loadItems();
  }

  events(): Promise<Event.Event[]> {
    return this.loadEvents();
  }

  wars(): Promise<War.War[]> {
    return this.loadWars();
  }
}

const exportClients = new Map<SupportedRegion, ExportClient>();

/** Returns a memoized ExportClient per region, mirroring getGameDataClient(). */
export function getExportClient(region: SupportedRegion): ExportClient {
  let client = exportClients.get(region);
  if (!client) {
    client = new ExportClient(region);
    exportClients.set(region, client);
  }
  return client;
}

// nice_enums.json and nice_trait.json are published once under JP and shared across every
// region (research/01 §2) — they are not per-region data, so these are module-level, not
// methods on ExportClient.
const loadNiceEnums = memoize(() => fetchExport<EnumList>("JP/nice_enums.json"));
// nice_trait.json is a trait-id -> name map (`{"1": "genderMale", ...}`), not an array of
// the connector's per-trait Trait shape — confirmed against the live export file.
const loadNiceTraits = memoize(() => fetchExport<Record<string, string>>("JP/nice_trait.json"));

export function getNiceEnums(): Promise<EnumList> {
  return loadNiceEnums();
}

export function getNiceTraits(): Promise<Record<string, string>> {
  return loadNiceTraits();
}
