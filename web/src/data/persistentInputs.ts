import { JsonRosterRepository, type KeyValueStorage } from "fgo-damage-calculator/account";
import { getGameDataClient, type SupportedRegion } from "fgo-damage-calculator/data";
import { loadPersistedOptimizerSession } from "fgo-damage-calculator/optimizer";
import { JsonManualQuestRepository } from "fgo-damage-calculator/quest";

export function createBrowserInputRepositories(storage: KeyValueStorage) {
  return {
    rosterRepository: new JsonRosterRepository(storage),
    questRepository: new JsonManualQuestRepository(storage),
  } as const;
}

/** Browser entry point for the future roster/quest editor and optimizer mode flow. */
export function loadBrowserOptimizerSession(
  region: SupportedRegion,
  storage: KeyValueStorage = window.localStorage,
) {
  const repositories = createBrowserInputRepositories(storage);
  return loadPersistedOptimizerSession(
    region,
    repositories.rosterRepository,
    repositories.questRepository,
    getGameDataClient(region),
  );
}
