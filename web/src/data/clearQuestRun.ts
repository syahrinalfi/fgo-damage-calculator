import type { NoblePhantasm, Servant as ServantModule } from "@atlasacademy/api-connector";
import { loadBattleConstants, type BattleConstants } from "fgo-damage-calculator/battle";
import { getGameDataClient, type GameDataClient, type SupportedRegion } from "fgo-damage-calculator/data";
import {
  buildBorrowedSupportCandidate,
  optimizeQuestMinimumTurns,
  findClearUpgradeRecommendations,
  type UpgradeAdvisorOptions,
  type UpgradeAdvisorReport,
  selectNoblePhantasmVersion,
  type MinimumTurnOptimizerOptions,
  type MinimumTurnOptimizerResult,
  type PersistedOptimizerSession,
} from "fgo-damage-calculator/optimizer";
import type { ServantCatalogEntry } from "fgo-damage-calculator/account";
import { manualQuestToWaves, type ManualQuestDraft } from "fgo-damage-calculator/quest";
import { loadBrowserOptimizerSession } from "./persistentInputs";

export interface ClearQuestPreferences {
  readonly preferredAttackerId?: number;
  readonly minimizeCost: boolean;
  /** Atlas servant ids the search may borrow as the one friend support; empty or omitted searches without one. */
  readonly supportServantIds?: readonly number[];
}

/**
 * Common friend-list supports offered by default, editable in Preferences: Altria Caster,
 * Koyanskaya of Light, Scáthach-Skadi, Oberon, Merlin and Zhuge Liang. Atlas ids are the same
 * in NA and JP (checked against api.atlasacademy.io/basic/{region}/servant, 2026-11-08).
 */
export const DEFAULT_SUPPORT_SERVANT_IDS: readonly number[] = [504500, 604200, 503900, 2800100, 500800, 501900];

/**
 * Servants the support picker offers. Multi-form servants (more than one unconditional NP,
 * e.g. Space Ishtar) are left out: the standard support build has no NP-form choice, and the
 * engine refuses to guess one.
 */
export function supportPickerOptions(servants: readonly Pick<ServantCatalogEntry, "servantId" | "name" | "npIds">[]): { servantId: number; name: string }[] {
  return servants
    .filter((servant) => servant.npIds.length === 1)
    .map((servant) => ({ servantId: servant.servantId, name: servant.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface ClearQuestRunRequest {
  readonly region: SupportedRegion;
  readonly draft: ManualQuestDraft;
  readonly preferences: ClearQuestPreferences;
  /** Turn limit for the iterative search, 1–6 (the optimizer defaults to 6). */
  readonly maxTurns?: number;
}

export interface ClearQuestRunResult {
  readonly result: MinimumTurnOptimizerResult;
  readonly costBudget: number;
  readonly options: MinimumTurnOptimizerOptions;
}

export interface ClearQuestUpgradeDependencies {
  readonly optimize: (options: MinimumTurnOptimizerOptions) => MinimumTurnOptimizerResult;
  readonly recommend: (options: MinimumTurnOptimizerOptions, advisorOptions: UpgradeAdvisorOptions) => UpgradeAdvisorReport;
}

export interface ClearQuestRunDependencies {
  readonly loadSession: (region: SupportedRegion) => Promise<PersistedOptimizerSession>;
  readonly loadConstants: (client: GameDataClient) => Promise<BattleConstants>;
  readonly loadMasterLevels: (client: GameDataClient) => ReturnType<GameDataClient["masterLevelConstant"]>;
  readonly loadServant: (client: GameDataClient, servantId: number) => Promise<ServantModule.Servant>;
  readonly optimize: (options: MinimumTurnOptimizerOptions) => MinimumTurnOptimizerResult;
}

const defaultDependencies: ClearQuestRunDependencies = {
  loadSession: loadBrowserOptimizerSession,
  loadConstants: loadBattleConstants,
  loadMasterLevels: (client) => client.masterLevelConstant(),
  loadServant: (client, servantId) => client.servant(servantId),
  optimize: optimizeQuestMinimumTurns,
};

const defaultUpgradeDependencies: ClearQuestUpgradeDependencies = {
  optimize: optimizeQuestMinimumTurns,
  recommend: findClearUpgradeRecommendations,
};

function npGainLookup(session: PersistedOptimizerSession): (servantId: number) => NoblePhantasm.NoblePhantasmGain {
  const gains = new Map<number, NoblePhantasm.NoblePhantasmGain>();
  for (const candidate of session.optimizerInputs.ownedServantCandidates) {
    const np = selectNoblePhantasmVersion(candidate.niceServant.noblePhantasms ?? [], candidate.build);
    if (np === undefined) throw new RangeError(`Owned servant ${candidate.build.servantId} has no legal Noble Phantasm`);
    gains.set(candidate.build.servantId, np.npGain);
  }
  return (servantId) => {
    const gain = gains.get(servantId);
    if (gain === undefined) throw new RangeError(`No Noble Phantasm gain data for servant ${servantId}`);
    return gain;
  };
}

export async function runClearQuest(
  request: ClearQuestRunRequest,
  dependencies: ClearQuestRunDependencies = defaultDependencies,
): Promise<ClearQuestRunResult> {
  if (request.draft.region !== request.region) {
    throw new RangeError(`Quest region ${request.draft.region} does not match selected region ${request.region}`);
  }
  const client = getGameDataClient(request.region);
  const { supportServantIds = [], ...preferences } = request.preferences;
  const [session, constants, masterLevels, supportServants] = await Promise.all([
    dependencies.loadSession(request.region),
    dependencies.loadConstants(client),
    dependencies.loadMasterLevels(client),
    Promise.all(supportServantIds.map((servantId) => dependencies.loadServant(client, servantId))),
  ]);
  if (session.profile.region !== request.region) {
    throw new RangeError(`Roster region ${session.profile.region} does not match selected region ${request.region}`);
  }
  const costBudget = masterLevels[session.profile.masterLevel]?.maxCost;
  if (typeof costBudget !== "number" || !Number.isInteger(costBudget) || costBudget < 0) {
    throw new RangeError(`Master level ${session.profile.masterLevel} has no party-cost entry for ${request.region}`);
  }
  const options: MinimumTurnOptimizerOptions = {
      shortlist: session.optimizerInputs.ownedServantCandidates,
      cePool: session.optimizerInputs.cePool,
      waves: manualQuestToWaves(request.draft),
      costBudget,
      constants,
      skillSources: session.optimizerInputs.skillSources,
      npGainByServantId: npGainLookup(session),
      preferences,
      ...(supportServants.length === 0 ? {} : { supportCandidates: supportServants.map(buildBorrowedSupportCandidate) }),
      ...(request.maxTurns === undefined ? {} : { maxTurns: request.maxTurns }),
  };
  return {
    result: dependencies.optimize(options),
    costBudget,
    options,
  };
}

export function findClearQuestUpgrades(
  run: ClearQuestRunResult,
  dependencies: ClearQuestUpgradeDependencies = defaultUpgradeDependencies,
): UpgradeAdvisorReport {
  return dependencies.recommend(run.options, {
    ownedServantCandidates: run.options.shortlist,
    evaluate: (options) => options === run.options ? run.result : dependencies.optimize(options),
  });
}
