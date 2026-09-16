import type { CraftEssence, NoblePhantasm, Servant as ServantModule, Skill } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ServantBuild } from "../account/types.js";
import type { MinimumTurnOptimizerOptions, MinimumTurnOptimizerResult, ServantCandidate } from "./questOptimizer.js";
import { buildUpgradeScenarios, findClearUpgradeRecommendations } from "./upgradeAdvisor.js";

function build(overrides: Partial<ServantBuild> = {}): ServantBuild {
  return {
    servantId: 1,
    level: 90,
    ascension: 4,
    skillLevels: [10, 10, 10],
    appendSkillLevels: {},
    npLevel: 1,
    fou: { atk: 1000, hp: 1000 },
    commandCodeIds: [],
    ...overrides,
  };
}

function np(id: number, priority: number, condQuestId = 0): NoblePhantasm.NoblePhantasm {
  return {
    id,
    num: 1,
    priority,
    condQuestId,
    condQuestPhase: condQuestId === 0 ? 0 : 1,
  } as NoblePhantasm.NoblePhantasm;
}

function options(candidateBuild = build(), noblePhantasms: readonly NoblePhantasm.NoblePhantasm[] = []): MinimumTurnOptimizerOptions {
  const candidate: ServantCandidate = {
    niceServant: { noblePhantasms } as unknown as ServantModule.Servant,
    build: candidateBuild,
  };
  return { shortlist: [candidate], cePool: [] } as unknown as MinimumTurnOptimizerOptions;
}

function result(minimumTurns: number | null): MinimumTurnOptimizerResult {
  return { minimumTurns, searchedThroughTurn: 3, attackerLimitUsed: minimumTurns === null ? null : 1, candidates: [] };
}

function ce(inventoryId: string, limitBreakCount: 0 | 1 | 2 | 3 | 4, level = 1) {
  const data = {
    id: 9400340,
    name: "Test CE",
    lvMax: 100,
    atkGrowth: Array.from({ length: 100 }, (_, index) => index * 10),
    hpGrowth: Array.from({ length: 100 }, () => 0),
    ascensionAdd: { lvMax: { ascension: { 0: 20, 1: 40, 2: 60, 3: 80, 4: 100 }, costume: {} } },
  } as unknown as CraftEssence.CraftEssence;
  return { data, level, inventoryId, limitBreakCount } as const;
}

describe("upgrade advisor", () => {
  it("generates one-build NP-level scenarios without mutating the roster", () => {
    const base = options();
    const scenarios = buildUpgradeScenarios(base).filter((scenario) => scenario.kind === "npLevel");
    expect(scenarios.map((scenario) => scenario.steps)).toEqual([1, 2, 3, 4]);
    expect(scenarios[0]?.options.shortlist[0]?.build.npLevel).toBe(2);
    expect(base.shortlist[0]?.build.npLevel).toBe(1);
  });

  it("recommends the smallest tested NP level that flips fail to clear", () => {
    let evaluations = 0;
    const report = findClearUpgradeRecommendations(options(), {
      evaluate: (candidateOptions) => {
        evaluations += 1;
        return result((candidateOptions.shortlist[0]?.build.npLevel ?? 1) >= 2 ? 3 : null);
      },
      maxRecommendations: 3,
    });
    expect(evaluations).toBe(5);
    expect(report.baseline.minimumTurns).toBeNull();
    expect(report.recommendations[0]).toMatchObject({ kind: "npLevel", servantId: 1, from: 1, to: 2, steps: 1 });
  });

  it("updates both roster build and automatic skill source for one isolated skill-level scenario", () => {
    const rawSkill = { functions: [], coolDown: Array.from({ length: 10 }, () => 5) } as Pick<Skill.Skill, "functions" | "coolDown">;
    const base = {
      ...options(build({ skillLevels: [1, 10, 10] })),
      skillSources: [{
        servantId: 1,
        skills: [
          { skill: rawSkill, level: 1 },
          { skill: rawSkill, level: 10 },
          { skill: rawSkill, level: 10 },
        ],
      }],
    } as MinimumTurnOptimizerOptions;
    const scenarios = buildUpgradeScenarios(base).filter((scenario) => scenario.kind === "skillLevel");
    expect(scenarios).toHaveLength(9);
    expect(scenarios[0]).toMatchObject({ servantId: 1, skillSlot: 1, from: 1, to: 2, effortTier: 1, steps: 1 });
    expect(scenarios[0]?.options.shortlist[0]?.build.skillLevels).toEqual([2, 10, 10]);
    expect(scenarios[0]?.options.skillSources?.[0]?.skills[0].level).toBe(2);
    expect(base.shortlist[0]?.build.skillLevels).toEqual([1, 10, 10]);
    expect(base.skillSources?.[0]?.skills[0].level).toBe(1);
  });

  it("ranks a one-step skill upgrade before an NP-level upgrade that also clears", () => {
    const rawSkill = { functions: [], coolDown: Array.from({ length: 10 }, () => 5) } as Pick<Skill.Skill, "functions" | "coolDown">;
    const base = {
      ...options(build({ skillLevels: [1, 10, 10] })),
      skillSources: [{
        servantId: 1,
        skills: [
          { skill: rawSkill, level: 1 },
          { skill: rawSkill, level: 10 },
          { skill: rawSkill, level: 10 },
        ],
      }],
    } as MinimumTurnOptimizerOptions;
    const report = findClearUpgradeRecommendations(base, {
      evaluate: (candidateOptions) => {
        const candidateBuild = candidateOptions.shortlist[0]?.build;
        return result(candidateBuild?.skillLevels[0] === 2 || candidateBuild?.npLevel === 2 ? 3 : null);
      },
    });
    expect(report.recommendations[0]).toMatchObject({ kind: "skillLevel", skillSlot: 1, from: 1, to: 2 });
  });

  it("rejects mismatched roster and skill-source levels", () => {
    const rawSkill = { functions: [], coolDown: Array.from({ length: 10 }, () => 5) } as Pick<Skill.Skill, "functions" | "coolDown">;
    const inconsistent = {
      ...options(build({ skillLevels: [1, 10, 10] })),
      skillSources: [{
        servantId: 1,
        skills: [
          { skill: rawSkill, level: 2 },
          { skill: rawSkill, level: 10 },
          { skill: rawSkill, level: 10 },
        ],
      }],
    } as MinimumTurnOptimizerOptions;
    expect(() => buildUpgradeScenarios(inconsistent)).toThrow(/level mismatch/);
  });

  it("generates CE levels only through the current limit-break cap", () => {
    const base = { ...options(), cePool: [ce("target", 0, 18)] } as MinimumTurnOptimizerOptions;
    const levels = buildUpgradeScenarios(base).filter((scenario) => scenario.kind === "ceLevel");
    expect(levels.map((scenario) => scenario.to)).toEqual([20]);
    expect(levels[0]).toMatchObject({ craftEssenceId: 9400340, inventoryId: "target", from: 18, to: 20 });
  });

  it("offers MLB only when enough separate unmerged copies exist and consumes exactly those donors", () => {
    const target = ce("target", 2, 60);
    const donors = [ce("d1", 0), ce("d2", 0), ce("spare", 1)];
    const base = { ...options(), cePool: [target, ...donors] } as MinimumTurnOptimizerOptions;
    const mlb = buildUpgradeScenarios(base).filter((scenario) => scenario.kind === "ceMlb" && scenario.inventoryId === "target");
    expect(mlb.length).toBeGreaterThan(0);
    expect(mlb[0]).toMatchObject({
      craftEssenceId: 9400340,
      inventoryId: "target",
      consumedInventoryIds: ["d1", "d2"],
      from: 60,
      to: 100,
    });
    expect(mlb[0]?.options.cePool).toHaveLength(2);
    expect(mlb[0]?.options.cePool.find((copy) => copy.inventoryId === "target")?.limitBreakCount).toBe(4);
  });

  it("falls back to current-cap level upgrades when MLB copies are insufficient", () => {
    const base = { ...options(), cePool: [ce("target", 2, 58), ce("d1", 0)] } as MinimumTurnOptimizerOptions;
    const scenarios = buildUpgradeScenarios(base);
    expect(scenarios.some((scenario) => scenario.kind === "ceLevel" && scenario.inventoryId === "target")).toBe(true);
    expect(scenarios.some((scenario) => scenario.kind === "ceMlb" && scenario.inventoryId === "target")).toBe(false);
  });

  it("builds cumulative strengthening scenarios and ranks them after NP-level upgrades", () => {
    const baseNp = np(1001, 101);
    const firstUpgrade = np(1002, 102, 9001);
    const secondUpgrade = np(1003, 103, 9002);
    const base = options(build({ selectedNpId: baseNp.id, unlockedStrengthenings: [] }), [baseNp, firstUpgrade, secondUpgrade]);
    const strengthening = buildUpgradeScenarios(base).filter((scenario) => scenario.kind === "npStrengthening");
    expect(strengthening).toHaveLength(2);
    expect(strengthening[0]?.options.shortlist[0]?.build.unlockedStrengthenings).toEqual(["9001:1"]);
    expect(strengthening[1]?.options.shortlist[0]?.build.unlockedStrengthenings).toEqual(["9001:1", "9002:1"]);

    const report = findClearUpgradeRecommendations(base, {
      evaluate: (candidateOptions) => {
        const candidateBuild = candidateOptions.shortlist[0]?.build;
        const clears = (candidateBuild?.npLevel ?? 1) >= 2 || (candidateBuild?.unlockedStrengthenings?.length ?? 0) >= 1;
        return result(clears ? 3 : null);
      },
      maxRecommendations: 5,
    });
    expect(report.recommendations[0]?.kind).toBe("npLevel");
    expect(report.recommendations.some((recommendation) => recommendation.kind === "npStrengthening")).toBe(true);
  });

  it("does not test upgrades when the baseline already clears", () => {
    let evaluations = 0;
    const report = findClearUpgradeRecommendations(options(), {
      evaluate: () => {
        evaluations += 1;
        return result(2);
      },
    });
    expect(evaluations).toBe(1);
    expect(report.recommendations).toEqual([]);
  });

  it("builds an owned off-shortlist servant to natural-max potential while preserving NP and append levels", () => {
    const baseNp = np(2001, 101);
    const strengthenedNp = np(2002, 102, 9200);
    const rawSkill = { functions: [], coolDown: Array.from({ length: 10 }, () => 5) } as Pick<Skill.Skill, "functions" | "coolDown">;
    const owned: ServantCandidate = {
      niceServant: {
        lvMax: 80,
        noblePhantasms: [baseNp, strengthenedNp],
      } as unknown as ServantModule.Servant,
      build: build({
        servantId: 2,
        level: 40,
        ascension: 2,
        skillLevels: [4, 6, 8],
        appendSkillLevels: { 2: 5 },
        npLevel: 3,
        fou: { atk: 400, hp: 600 },
        selectedNpId: baseNp.id,
        unlockedStrengthenings: [],
      }),
    };
    const base = {
      ...options(),
      skillSources: [{
        servantId: 2,
        skills: [
          { skill: rawSkill, level: 4 },
          { skill: rawSkill, level: 6 },
          { skill: rawSkill, level: 8 },
        ],
      }],
    } as MinimumTurnOptimizerOptions;
    const scenarios = buildUpgradeScenarios(base, { ownedServantCandidates: [owned] });
    const scenario = scenarios.find((candidateScenario) => candidateScenario.kind === "ownedServantBuild");
    const potential = scenario?.options.shortlist.find((candidate) => candidate.build.servantId === 2)?.build;

    expect(scenario).toMatchObject({ servantId: 2, effortTier: 4, steps: 1 });
    expect(potential).toMatchObject({
      level: 80,
      ascension: 4,
      skillLevels: [10, 10, 10],
      appendSkillLevels: { 2: 5 },
      npLevel: 3,
      fou: { atk: 1000, hp: 1000 },
      selectedNpId: baseNp.id,
      unlockedStrengthenings: ["9200:1"],
    });
    expect(scenario?.options.skillSources?.[0]?.skills.map((slot) => slot.level)).toEqual([10, 10, 10]);
    expect(owned.build).toMatchObject({ level: 40, skillLevels: [4, 6, 8], npLevel: 3 });
  });

  it("replaces an underbuilt shortlisted owned servant without adding a duplicate or downgrading overinvestment", () => {
    const owned: ServantCandidate = {
      niceServant: { lvMax: 90, noblePhantasms: [] } as unknown as ServantModule.Servant,
      build: build({
        level: 100,
        skillLevels: [6, 10, 10],
        appendSkillLevels: { 2: 10 },
        npLevel: 2,
        fou: { atk: 2000, hp: 2000 },
      }),
    };
    const base = options(owned.build);
    const scenario = buildUpgradeScenarios(base, { ownedServantCandidates: [owned] })
      .find((candidateScenario) => candidateScenario.kind === "ownedServantBuild");

    expect(scenario?.options.shortlist).toHaveLength(1);
    expect(scenario?.options.shortlist[0]?.build).toMatchObject({
      level: 100,
      skillLevels: [10, 10, 10],
      appendSkillLevels: { 2: 10 },
      npLevel: 2,
      fou: { atk: 2000, hp: 2000 },
    });
  });

  it("ranks a proven direct upgrade before building another owned servant", () => {
    const owned: ServantCandidate = {
      niceServant: { lvMax: 80, noblePhantasms: [] } as unknown as ServantModule.Servant,
      build: build({ servantId: 2, level: 40, npLevel: 4 }),
    };
    const report = findClearUpgradeRecommendations(options(), {
      ownedServantCandidates: [owned],
      evaluate: (candidateOptions) => result(
        (candidateOptions.shortlist[0]?.build.npLevel ?? 1) >= 2 ||
        candidateOptions.shortlist.some((candidate) => candidate.build.servantId === 2)
          ? 3
          : null,
      ),
    });

    expect(report.recommendations[0]).toMatchObject({ kind: "npLevel", servantId: 1, to: 2 });
    expect(report.recommendations.some((recommendation) => recommendation.kind === "ownedServantBuild" && recommendation.servantId === 2)).toBe(true);
  });
});
