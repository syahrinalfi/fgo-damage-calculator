import type { CraftEssence, Servant as ServantModule } from "@atlasacademy/api-connector";
import type { RosterRepository } from "../account/rosterStore.js";
import type { RosterProfile } from "../account/types.js";
import type { SupportedRegion } from "../data/region.js";
import type { ManualQuestDraft, ManualQuestRepository } from "../quest/manualQuest.js";
import { buildRosterOptimizerInputs, type RosterOptimizerInputs } from "./rosterInputs.js";

export interface RosterStaticDataClient {
  servant(id: number): Promise<ServantModule.Servant>;
  craftEssence(id: number): Promise<CraftEssence.CraftEssence>;
}

export interface PersistedOptimizerSession {
  readonly profile: RosterProfile;
  readonly questDrafts: readonly ManualQuestDraft[];
  readonly optimizerInputs: RosterOptimizerInputs;
}

/** Loads one region's persisted inputs and hydrates only the distinct Atlas records it references. */
export async function loadPersistedOptimizerSession(
  region: SupportedRegion,
  rosterRepository: RosterRepository,
  questRepository: ManualQuestRepository,
  dataClient: RosterStaticDataClient,
): Promise<PersistedOptimizerSession> {
  const [profile, questDrafts] = await Promise.all([
    rosterRepository.load(region),
    questRepository.list(region),
  ]);
  const servantIds = Object.keys(profile.ownedServants).map(Number).sort((a, b) => a - b);
  const craftEssenceIds = [...new Set(profile.craftEssenceInventory.map((copy) => copy.craftEssenceId))].sort((a, b) => a - b);
  const [servants, craftEssences] = await Promise.all([
    Promise.all(servantIds.map(async (id) => [id, await dataClient.servant(id)] as const)),
    Promise.all(craftEssenceIds.map(async (id) => [id, await dataClient.craftEssence(id)] as const)),
  ]);
  return {
    profile,
    questDrafts,
    optimizerInputs: buildRosterOptimizerInputs(profile, new Map(servants), new Map(craftEssences)),
  };
}
