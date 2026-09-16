import type { NpLevel, SkillLevel } from "../account/types.js";
import type { EquippedCraftEssence } from "../battle/battleState.js";
import type { ServantSkillSource } from "../battle/skillActivationResolver.js";
import { npStrengtheningKey } from "./npVersionSelection.js";
import {
  optimizeQuestMinimumTurns,
  type MinimumTurnOptimizerOptions,
  type MinimumTurnOptimizerResult,
  type ServantCandidate,
} from "./questOptimizer.js";

export type UpgradeKind = "skillLevel" | "ceLevel" | "npLevel" | "npStrengthening" | "ceMlb" | "ownedServantBuild";

export interface UpgradeScenario {
  readonly id: string;
  readonly label: string;
  readonly kind: UpgradeKind;
  readonly servantId: number;
  /** Product effort tier: NP level-up before Interlude/Rank-Up strengthening. */
  readonly effortTier: 1 | 2 | 3 | 4;
  readonly steps: number;
  readonly from?: number;
  readonly to?: number;
  readonly unlockKeys?: readonly string[];
  readonly skillSlot?: 1 | 2 | 3;
  readonly craftEssenceId?: number;
  readonly inventoryId?: string;
  readonly consumedInventoryIds?: readonly string[];
  readonly options: MinimumTurnOptimizerOptions;
}

export interface UpgradeRecommendation extends UpgradeScenario {
  readonly result: MinimumTurnOptimizerResult;
}

export interface UpgradeAdvisorReport {
  readonly baseline: MinimumTurnOptimizerResult;
  readonly testedScenarioCount: number;
  readonly recommendations: readonly UpgradeRecommendation[];
}

export interface UpgradeAdvisorOptions {
  readonly maxRecommendations?: number;
  readonly scenarios?: readonly UpgradeScenario[];
  /** Actual owned roster candidates to test at natural-max build potential; NP and append investment stay account-accurate. */
  readonly ownedServantCandidates?: readonly ServantCandidate[];
  readonly evaluate?: (options: MinimumTurnOptimizerOptions) => MinimumTurnOptimizerResult;
}

function replaceCandidate(
  options: MinimumTurnOptimizerOptions,
  index: number,
  candidate: ServantCandidate,
): MinimumTurnOptimizerOptions {
  return {
    ...options,
    shortlist: options.shortlist.map((existing, candidateIndex) => (candidateIndex === index ? candidate : existing)),
  };
}

function npLevelScenarios(options: MinimumTurnOptimizerOptions): readonly UpgradeScenario[] {
  return options.shortlist.flatMap((candidate, index) => {
    const currentLevel = candidate.build.npLevel;
    const scenarios: UpgradeScenario[] = [];
    for (let targetLevel = currentLevel + 1; targetLevel <= 5; targetLevel += 1) {
      const upgraded: ServantCandidate = {
        ...candidate,
        build: { ...candidate.build, npLevel: targetLevel as NpLevel },
      };
      scenarios.push({
        id: `npLevel:${candidate.build.servantId}:${targetLevel}`,
        label: `Raise servant ${candidate.build.servantId} NP${currentLevel} to NP${targetLevel}`,
        kind: "npLevel",
        servantId: candidate.build.servantId,
        effortTier: 2,
        steps: targetLevel - currentLevel,
        from: currentLevel,
        to: targetLevel,
        options: replaceCandidate(options, index, upgraded),
      });
    }
    return scenarios;
  });
}

function replaceSkillSourceLevel(
  sources: readonly ServantSkillSource[],
  sourceIndex: number,
  skillIndex: number,
  level: SkillLevel,
): readonly ServantSkillSource[] {
  return sources.map((source, index) => {
    if (index !== sourceIndex) return source;
    const skills = source.skills.map((slotSource, slotIndex) =>
      slotIndex === skillIndex ? { ...slotSource, level } : slotSource,
    ) as unknown as ServantSkillSource["skills"];
    return { ...source, skills };
  });
}

function skillLevelScenarios(options: MinimumTurnOptimizerOptions): readonly UpgradeScenario[] {
  if (options.resolveSkillOptions !== undefined || options.skillSources === undefined) return [];
  return options.shortlist.flatMap((candidate, candidateIndex) => {
    const sourceIndex = options.skillSources?.findIndex((source) => source.servantId === candidate.build.servantId) ?? -1;
    if (sourceIndex < 0) return [];
    const source = options.skillSources?.[sourceIndex];
    if (source === undefined) return [];

    return candidate.build.skillLevels.flatMap((currentLevel, skillIndex): readonly UpgradeScenario[] => {
      const sourceLevel = source.skills[skillIndex]?.level;
      if (sourceLevel !== currentLevel) {
        throw new RangeError(
          `servant ${candidate.build.servantId} skill ${skillIndex + 1} level mismatch: build=${currentLevel}, source=${sourceLevel}`,
        );
      }
      const scenarios: UpgradeScenario[] = [];
      for (let targetLevel = currentLevel + 1; targetLevel <= 10; targetLevel += 1) {
        const skillLevels = [...candidate.build.skillLevels] as ServantCandidate["build"]["skillLevels"];
        skillLevels[skillIndex] = targetLevel as SkillLevel;
        const upgraded: ServantCandidate = { ...candidate, build: { ...candidate.build, skillLevels } };
        const withBuild = replaceCandidate(options, candidateIndex, upgraded);
        scenarios.push({
          id: `skillLevel:${candidate.build.servantId}:${skillIndex + 1}:${targetLevel}`,
          label: `Raise servant ${candidate.build.servantId} skill ${skillIndex + 1} from ${currentLevel} to ${targetLevel}`,
          kind: "skillLevel",
          servantId: candidate.build.servantId,
          effortTier: 1,
          steps: targetLevel - currentLevel,
          from: currentLevel,
          to: targetLevel,
          skillSlot: (skillIndex + 1) as 1 | 2 | 3,
          options: {
            ...withBuild,
            skillSources: replaceSkillSourceLevel(options.skillSources as readonly ServantSkillSource[], sourceIndex, skillIndex, targetLevel as SkillLevel),
          },
        });
      }
      return scenarios;
    });
  });
}

function ceLevelCap(copy: EquippedCraftEssence, limitBreakCount: 0 | 1 | 2 | 3 | 4): number | undefined {
  const ascensionCaps = copy.data.ascensionAdd?.lvMax?.ascension as Record<number, number> | undefined;
  const cap = ascensionCaps?.[limitBreakCount] ?? (limitBreakCount === 4 ? copy.data.lvMax : undefined);
  return cap !== undefined && Number.isInteger(cap) && cap >= 1 ? cap : undefined;
}

function replaceCeCopy(
  pool: readonly EquippedCraftEssence[],
  inventoryId: string,
  replacement: EquippedCraftEssence,
  consumedInventoryIds: ReadonlySet<string> = new Set(),
): readonly EquippedCraftEssence[] {
  return pool.flatMap((copy) => {
    if (copy.inventoryId !== undefined && consumedInventoryIds.has(copy.inventoryId)) return [];
    return copy.inventoryId === inventoryId ? [replacement] : [copy];
  });
}

function ceUpgradeScenarios(options: MinimumTurnOptimizerOptions): readonly UpgradeScenario[] {
  const scenarios: UpgradeScenario[] = [];
  const seenLevelStates = new Set<string>();
  const seenMlbStates = new Set<string>();
  for (const target of options.cePool) {
    if (target.inventoryId === undefined || target.limitBreakCount === undefined) continue;
    const currentCap = ceLevelCap(target, target.limitBreakCount);
    if (currentCap !== undefined && target.level < currentCap) {
      const signature = `${target.data.id}:${target.limitBreakCount}:${target.level}:${currentCap}`;
      if (!seenLevelStates.has(signature)) {
        seenLevelStates.add(signature);
        const replacement = { ...target, level: currentCap };
        scenarios.push({
          id: `ceLevel:${target.inventoryId}:${currentCap}`,
          label: `Raise CE ${target.data.name} to level ${currentCap}`,
          kind: "ceLevel",
          servantId: 0,
          effortTier: 1,
          steps: currentCap - target.level,
          from: target.level,
          to: currentCap,
          craftEssenceId: target.data.id,
          inventoryId: target.inventoryId,
          options: { ...options, cePool: replaceCeCopy(options.cePool, target.inventoryId, replacement) },
        });
      }
    }

    if (target.limitBreakCount === 4) continue;
    const requiredCopies = 4 - target.limitBreakCount;
    const donors = options.cePool.filter((copy) =>
      copy.inventoryId !== undefined &&
      copy.inventoryId !== target.inventoryId &&
      copy.data.id === target.data.id &&
      copy.limitBreakCount === 0,
    ).slice(0, requiredCopies);
    if (donors.length !== requiredCopies) continue;
    const mlbCap = ceLevelCap(target, 4);
    if (mlbCap === undefined || target.level >= mlbCap) continue;
    const donorIds = donors.map((copy) => copy.inventoryId as string);
    const signature = `${target.data.id}:${target.limitBreakCount}:${target.level}:${mlbCap}:${requiredCopies}`;
    if (seenMlbStates.has(signature)) continue;
    seenMlbStates.add(signature);
    const replacement = { ...target, level: mlbCap, limitBreakCount: 4 as const };
    scenarios.push({
      id: `ceMlb:${target.inventoryId}:${mlbCap}`,
      label: `MLB CE ${target.data.name} using ${requiredCopies} copies and raise it to level ${mlbCap}`,
      kind: "ceMlb",
      servantId: 0,
      effortTier: 3,
      steps: requiredCopies + (mlbCap - target.level),
      from: target.level,
      to: mlbCap,
      craftEssenceId: target.data.id,
      inventoryId: target.inventoryId,
      consumedInventoryIds: donorIds,
      options: {
        ...options,
        cePool: replaceCeCopy(options.cePool, target.inventoryId, replacement, new Set(donorIds)),
      },
    });
  }
  return scenarios;
}

function strengtheningScenarios(options: MinimumTurnOptimizerOptions): readonly UpgradeScenario[] {
  if (options.resolveNpOptions !== undefined || options.npByServantId !== undefined) return [];
  return options.shortlist.flatMap((candidate, index) => {
    const noblePhantasms = candidate.niceServant.noblePhantasms ?? [];
    const selected = candidate.build.selectedNpId === undefined
      ? undefined
      : noblePhantasms.find((np) => np.id === candidate.build.selectedNpId);
    const unconditional = noblePhantasms.filter((np) => np.condQuestId === 0);
    const baseline = selected ?? (unconditional.length === 1 ? unconditional[0] : undefined);
    if (baseline === undefined) return [];

    const existingKeys = new Set(candidate.build.unlockedStrengthenings ?? []);
    const gated = noblePhantasms
      .filter((np) => np.num === baseline.num && np.condQuestId !== 0)
      .sort((a, b) => a.priority - b.priority || a.id - b.id);
    const scenarios: UpgradeScenario[] = [];
    const seenUnlockSets = new Set<string>();
    for (const target of gated) {
      const requiredKeys = gated
        .filter((np) => np.priority <= target.priority)
        .map(npStrengtheningKey)
        .filter((key) => !existingKeys.has(key));
      if (requiredKeys.length === 0) continue;
      const unlockSetKey = [...requiredKeys].sort().join("|");
      if (seenUnlockSets.has(unlockSetKey)) continue;
      seenUnlockSets.add(unlockSetKey);
      const unlockedStrengthenings = [...existingKeys, ...requiredKeys];
      const upgraded: ServantCandidate = {
        ...candidate,
        build: { ...candidate.build, unlockedStrengthenings },
      };
      scenarios.push({
        id: `npStrengthening:${candidate.build.servantId}:${target.id}`,
        label: `Unlock servant ${candidate.build.servantId} NP strengthening ${target.name}`,
        kind: "npStrengthening",
        servantId: candidate.build.servantId,
        effortTier: 3,
        steps: requiredKeys.length,
        unlockKeys: requiredKeys,
        options: replaceCandidate(options, index, upgraded),
      });
    }
    return scenarios;
  });
}

function potentialStrengtheningKeys(candidate: ServantCandidate): string[] {
  const noblePhantasms = candidate.niceServant.noblePhantasms ?? [];
  const selected = candidate.build.selectedNpId === undefined
    ? undefined
    : noblePhantasms.find((np) => np.id === candidate.build.selectedNpId);
  const unconditional = noblePhantasms.filter((np) => np.condQuestId === 0);
  const baseline = selected ?? (unconditional.length === 1 ? unconditional[0] : undefined);
  const existing = new Set(candidate.build.unlockedStrengthenings ?? []);
  if (baseline !== undefined) {
    for (const noblePhantasm of noblePhantasms) {
      if (noblePhantasm.num === baseline.num && noblePhantasm.condQuestId !== 0) {
        existing.add(npStrengtheningKey(noblePhantasm));
      }
    }
  }
  return [...existing];
}

function potentialOwnedCandidate(candidate: ServantCandidate): ServantCandidate {
  return {
    ...candidate,
    build: {
      ...candidate.build,
      level: Math.max(candidate.build.level, candidate.niceServant.lvMax),
      ascension: 4,
      skillLevels: [10, 10, 10],
      appendSkillLevels: { ...candidate.build.appendSkillLevels },
      npLevel: candidate.build.npLevel,
      fou: {
        atk: Math.max(candidate.build.fou.atk, 1000),
        hp: Math.max(candidate.build.fou.hp, 1000),
      },
      unlockedStrengthenings: potentialStrengtheningKeys(candidate),
    },
  };
}

function samePotentialBuild(current: ServantCandidate, potential: ServantCandidate): boolean {
  return current.build.level === potential.build.level &&
    current.build.ascension === potential.build.ascension &&
    current.build.skillLevels.every((level, index) => level === potential.build.skillLevels[index]) &&
    current.build.fou.atk === potential.build.fou.atk &&
    current.build.fou.hp === potential.build.fou.hp &&
    current.build.unlockedStrengthenings?.length === potential.build.unlockedStrengthenings?.length &&
    (current.build.unlockedStrengthenings ?? []).every((key) => potential.build.unlockedStrengthenings?.includes(key));
}

function maximizeOwnedSkillSource(
  sources: readonly ServantSkillSource[] | undefined,
  servantId: number,
): readonly ServantSkillSource[] | undefined {
  return sources?.map((source) => source.servantId === servantId
    ? {
        ...source,
        skills: source.skills.map((slot) => ({ ...slot, level: 10 as SkillLevel })) as unknown as ServantSkillSource["skills"],
      }
    : source);
}

function ownedServantBuildScenarios(
  options: MinimumTurnOptimizerOptions,
  ownedServantCandidates: readonly ServantCandidate[],
): readonly UpgradeScenario[] {
  const seen = new Set<number>();
  return ownedServantCandidates.flatMap((owned): readonly UpgradeScenario[] => {
    const servantId = owned.build.servantId;
    if (seen.has(servantId)) return [];
    seen.add(servantId);
    const potential = potentialOwnedCandidate(owned);
    const shortlistIndex = options.shortlist.findIndex((candidate) => candidate.build.servantId === servantId);
    if (shortlistIndex >= 0 && samePotentialBuild(options.shortlist[shortlistIndex] as ServantCandidate, potential)) return [];
    const shortlist = shortlistIndex >= 0
      ? options.shortlist.map((candidate, index) => index === shortlistIndex ? potential : candidate)
      : [...options.shortlist, potential];
    const skillSources = maximizeOwnedSkillSource(options.skillSources, servantId);
    return [{
      id: `ownedServantBuild:${servantId}`,
      label: `Build owned servant ${servantId} to natural-max potential while keeping NP${owned.build.npLevel}`,
      kind: "ownedServantBuild",
      servantId,
      effortTier: 4,
      steps: 1,
      options: {
        ...options,
        shortlist,
        ...(skillSources === undefined ? {} : { skillSources }),
      },
    }];
  });
}

/** Generates isolated, immutable upgrade scenarios from the actual shortlisted builds. */
export function buildUpgradeScenarios(
  options: MinimumTurnOptimizerOptions,
  advisorOptions: Pick<UpgradeAdvisorOptions, "ownedServantCandidates"> = {},
): readonly UpgradeScenario[] {
  return [
    ...skillLevelScenarios(options),
    ...ceUpgradeScenarios(options),
    ...npLevelScenarios(options),
    ...strengtheningScenarios(options),
    ...ownedServantBuildScenarios(options, advisorOptions.ownedServantCandidates ?? []),
  ];
}

function reliabilityOf(result: MinimumTurnOptimizerResult): number {
  return result.candidates[0]?.reliability?.clearProbability ?? 0;
}

/** Tests every scenario through the real minimum-turn optimizer and returns only fail-to-clear flips. */
export function findClearUpgradeRecommendations(
  options: MinimumTurnOptimizerOptions,
  advisorOptions: UpgradeAdvisorOptions = {},
): UpgradeAdvisorReport {
  const maxRecommendations = advisorOptions.maxRecommendations ?? 5;
  if (!Number.isInteger(maxRecommendations) || maxRecommendations < 1) {
    throw new RangeError(`maxRecommendations must be a positive integer, got ${maxRecommendations}`);
  }
  const evaluate = advisorOptions.evaluate ?? optimizeQuestMinimumTurns;
  const baseline = evaluate(options);
  if (baseline.minimumTurns !== null) {
    return { baseline, testedScenarioCount: 0, recommendations: [] };
  }

  const scenarios = advisorOptions.scenarios ?? buildUpgradeScenarios(options, advisorOptions);
  const recommendations = scenarios.flatMap((scenario): readonly UpgradeRecommendation[] => {
    const result = evaluate(scenario.options);
    return result.minimumTurns === null ? [] : [{ ...scenario, result }];
  });
  recommendations.sort((a, b) =>
    a.effortTier - b.effortTier ||
    a.steps - b.steps ||
    (a.result.minimumTurns as number) - (b.result.minimumTurns as number) ||
    reliabilityOf(b.result) - reliabilityOf(a.result) ||
    a.id.localeCompare(b.id),
  );
  return {
    baseline,
    testedScenarioCount: scenarios.length,
    recommendations: recommendations.slice(0, maxRecommendations),
  };
}
