import type { NoblePhantasm, Servant as ServantModule } from "@atlasacademy/api-connector";
import { Region } from "fgo-damage-calculator/data";
import type { BattleConstants } from "fgo-damage-calculator/battle";
import type { MinimumTurnOptimizerOptions, MinimumTurnOptimizerResult, PersistedOptimizerSession } from "fgo-damage-calculator/optimizer";
import type { ManualQuestDraft } from "fgo-damage-calculator/quest";
import { describe, expect, it } from "vitest";
import { findClearQuestUpgrades, runClearQuest, supportPickerOptions, type ClearQuestRunDependencies } from "./clearQuestRun";

const draft: ManualQuestDraft = {
  id: "manual-node",
  name: "Manual Node",
  region: Region.NA,
  waves: [{ enemies: [{ className: "lancer" as never, attribute: "earth" as never, hp: 100_000 }] }],
};

const npGain = { buster: [1000], arts: [1000], quick: [1000], extra: [1000], defense: [1000] } as unknown as NoblePhantasm.NoblePhantasmGain;
const servant = {
  id: 1,
  noblePhantasms: [{ id: 100, num: 1, condQuestId: 0, condQuestPhase: 0, priority: 0, npGain }],
} as unknown as ServantModule.Servant;
const constants = {} as BattleConstants;
const result: MinimumTurnOptimizerResult = { minimumTurns: null, searchedThroughTurn: 6, attackerLimitUsed: null, candidates: [] };

function session(): PersistedOptimizerSession {
  return {
    profile: {
      region: Region.NA,
      masterLevel: 10,
      ownedServants: {
        1: {
          servantId: 1,
          level: 90,
          ascension: 4,
          skillLevels: [10, 10, 10],
          appendSkillLevels: {},
          npLevel: 1,
          fou: { atk: 0, hp: 0 },
          commandCodeIds: [],
          bondLevel: 0,
          unlockedStrengthenings: [],
        },
      },
      craftEssenceInventory: [],
      commandCodeInventory: [],
      mysticCodes: [],
      supportPresets: [],
    },
    questDrafts: [draft],
    optimizerInputs: {
      ownedServantCandidates: [{ niceServant: servant, build: {
        servantId: 1,
        level: 90,
        ascension: 4,
        skillLevels: [10, 10, 10],
        appendSkillLevels: {},
        npLevel: 1,
        fou: { atk: 0, hp: 0 },
        commandCodeIds: [],
      } }],
      skillSources: [],
      cePool: [],
    },
  };
}

function dependencies(overrides: Partial<ClearQuestRunDependencies> = {}): ClearQuestRunDependencies {
  return {
    loadSession: async () => session(),
    loadConstants: async () => constants,
    loadMasterLevels: async () => ({ 10: { requiredExp: 0, maxAp: 0, maxCost: 113, maxFriend: 0 } }),
    loadServant: async () => { throw new Error("no support servant expected"); },
    optimize: () => result,
    ...overrides,
  };
}

describe("runClearQuest", () => {
  it("hydrates the current region's saved inputs and delegates the supported axes to the minimum-turn optimizer", async () => {
    let received: MinimumTurnOptimizerOptions | undefined;

    const run = await runClearQuest(
      { region: Region.NA, draft, preferences: { preferredAttackerId: 1, minimizeCost: true } },
      dependencies({ optimize: (options) => { received = options; return result; } }),
    );

    expect(run).toMatchObject({ result, costBudget: 113 });
    expect(received).toMatchObject({
      shortlist: session().optimizerInputs.ownedServantCandidates,
      cePool: session().optimizerInputs.cePool,
      skillSources: session().optimizerInputs.skillSources,
      costBudget: 113,
      constants,
      preferences: { preferredAttackerId: 1, minimizeCost: true },
    });
    expect(received?.waves[0]?.initialEnemies[0]?.hp).toBe(100_000);
    expect(received?.npGainByServantId?.(1)).toBe(npGain);
  });

  it("forwards the chosen turn limit to the minimum-turn search", async () => {
    let received: MinimumTurnOptimizerOptions | undefined;
    await runClearQuest(
      { region: Region.NA, draft, preferences: { minimizeCost: false }, maxTurns: 3 },
      dependencies({ optimize: (options) => { received = options; return result; } }),
    );
    expect(received?.maxTurns).toBe(3);
  });

  it("loads each chosen support and passes it to the search with the standard borrowed build", async () => {
    let received: MinimumTurnOptimizerOptions | undefined;
    const requested: number[] = [];
    const supportServant = { ...servant, id: 504500, lvMax: 90, skills: [] } as unknown as ServantModule.Servant;
    await runClearQuest(
      { region: Region.NA, draft, preferences: { minimizeCost: false, supportServantIds: [504500] } },
      dependencies({
        loadServant: async (_client, id) => { requested.push(id); return supportServant; },
        optimize: (options) => { received = options; return result; },
      }),
    );
    expect(requested).toEqual([504500]);
    expect(received?.supportCandidates).toHaveLength(1);
    expect(received?.supportCandidates?.[0]?.niceServant).toBe(supportServant);
    expect(received?.supportCandidates?.[0]?.build).toMatchObject({ servantId: 504500, level: 90, npLevel: 1, skillLevels: [10, 10, 10], fou: { atk: 1000, hp: 1000 } });
    expect(received?.preferences).toEqual({ minimizeCost: false });
  });

  it("searches without a support when none are chosen", async () => {
    let received: MinimumTurnOptimizerOptions | undefined;
    await runClearQuest(
      { region: Region.NA, draft, preferences: { minimizeCost: false, supportServantIds: [] } },
      dependencies({ optimize: (options) => { received = options; return result; } }),
    );
    expect(received?.supportCandidates).toBeUndefined();
  });

  it("offers only single-NP-form servants as supports, sorted by name", () => {
    const entry = (servantId: number, name: string, npIds: readonly number[]) => ({ servantId, collectionNo: servantId, name, levelCap: 90, npIds, strengtheningKeys: [] });
    expect(supportPickerOptions([
      entry(3, "Merlin", [30]),
      entry(1, "Space Ishtar", [10, 11, 12]),
      entry(2, "Altria Caster", [20]),
    ])).toEqual([{ servantId: 2, name: "Altria Caster" }, { servantId: 3, name: "Merlin" }]);
  });

  it("rejects a region mismatch before a cross-region profile can be optimized", async () => {
    await expect(runClearQuest(
      { region: Region.JP, draft, preferences: { minimizeCost: false } },
      dependencies(),
    )).rejects.toThrow(/does not match selected region/);
  });

  it("rejects a master level without a live cost entry", async () => {
    await expect(runClearQuest(
      { region: Region.NA, draft, preferences: { minimizeCost: false } },
      dependencies({ loadMasterLevels: async () => ({}) }),
    )).rejects.toThrow(/no party-cost entry/);
  });

  it("reuses the completed baseline while testing only upgrade scenarios", async () => {
    const run = await runClearQuest(
      { region: Region.NA, draft, preferences: { minimizeCost: false } },
      dependencies(),
    );
    let scenarioEvaluations = 0;
    const report = findClearQuestUpgrades(run, {
      optimize: () => { scenarioEvaluations += 1; return { ...result, minimumTurns: 2 }; },
      recommend: (options, advisorOptions) => {
        expect(advisorOptions.ownedServantCandidates).toBe(options.shortlist);
        expect(advisorOptions.evaluate?.(options)).toBe(result);
        expect(advisorOptions.evaluate?.({ ...options, maxTurns: 5 })).toMatchObject({ minimumTurns: 2 });
        return { baseline: result, testedScenarioCount: 1, recommendations: [] };
      },
    });

    expect(report.testedScenarioCount).toBe(1);
    expect(scenarioEvaluations).toBe(1);
  });
});
