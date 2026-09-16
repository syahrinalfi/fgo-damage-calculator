import type { CraftEssence, Servant as ServantModule } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ServantBuild } from "../account/types.js";
import type { ActiveBuffInstance } from "../buffs/types.js";
import type { WaveEnemy } from "../quest/types.js";
import { buildEnemyInstance, buildServantInstance, enemyToBattleUnit, servantToBattleUnit, type EnemyInstance, type EquippedCraftEssence, type ServantInstance } from "./battleState.js";
import type { TrackedBuff } from "./buffLifecycle.js";

function trackedBuff(overrides: Partial<TrackedBuff> = {}): TrackedBuff {
  const base: ActiveBuffInstance = { type: "upAtk" as ActiveBuffInstance["type"], amount: 200, ckSelfIndv: [], ckOpIndv: [], buffGroup: 0 };
  return { ...base, turnsRemaining: 3, usesRemaining: null, ...overrides };
}

function servant(overrides: Partial<ServantInstance> = {}): ServantInstance {
  return {
    servantId: 1,
    isFrontLine: true,
    atk: 10000,
    className: "saber" as ServantInstance["className"],
    attribute: "human" as ServantInstance["attribute"],
    traits: new Set([100]),
    cardTypes: [],
    npLevel: 1,
    currentHp: 15000,
    maxHp: 15000,
    currentNpGauge: 0,
    activeBuffs: [],
    skillCooldowns: [0, 0, 0],
    criticalWeight: 99,
    starGen: 60,
    ...overrides,
  };
}

function enemy(overrides: Partial<EnemyInstance> = {}): EnemyInstance {
  return {
    npcId: 9001,
    atk: 8000,
    className: "lancer" as EnemyInstance["className"],
    attribute: "earth" as EnemyInstance["attribute"],
    traits: new Set([200]),
    currentHp: 50000,
    maxHp: 50000,
    activeBuffs: [],
    currentNpTurns: 0,
    npTurnLimit: 5,
    deathRate: 1000,
    readyToNp: false,
    serverMod: { tdRate: 1000, tdAttackRate: 1000, starRate: 1000 },
    ...overrides,
  };
}

describe("servantToBattleUnit", () => {
  it("projects static stats plus the tracked buff list into the BattleUnit shape", () => {
    const buff = trackedBuff();
    const unit = servantToBattleUnit(servant({ activeBuffs: [buff] }));
    expect(unit).toEqual({
      atk: 10000,
      className: "saber",
      attribute: "human",
      traits: new Set([100]),
      activeBuffs: [buff],
    });
  });

  it("ignores mutable-only fields (HP/gauge/cooldowns) not part of BattleUnit", () => {
    const unit = servantToBattleUnit(servant());
    expect(unit).not.toHaveProperty("currentHp");
    expect(unit).not.toHaveProperty("currentNpGauge");
  });
});

describe("enemyToBattleUnit", () => {
  it("projects static stats plus the tracked buff list into the BattleUnit shape", () => {
    const unit = enemyToBattleUnit(enemy());
    expect(unit).toEqual({
      atk: 8000,
      className: "lancer",
      attribute: "earth",
      traits: new Set([200]),
      activeBuffs: [],
    });
  });
});

describe("buildEnemyInstance", () => {
  function waveEnemy(overrides: Partial<WaveEnemy> = {}): WaveEnemy {
    return {
      npcId: 9002,
      atk: 6000,
      hp: 30000,
      deathRate: 500,
      chargeTurn: 3,
      traits: [{ id: 100 }, { id: 200 }],
      svt: { className: "rider", attribute: "sky", rarity: 2 },
      enemyScript: {},
      serverMod: { tdRate: 1200, tdAttackRate: 1200, starRate: 0 },
      ...overrides,
    } as unknown as WaveEnemy;
  }

  it("maps static QuestEnemy fields into a fresh EnemyInstance, HP full and NP/ready state at their defaults", () => {
    const result = buildEnemyInstance(waveEnemy());
    expect(result).toEqual({
      npcId: 9002,
      atk: 6000,
      className: "rider",
      attribute: "sky",
      traits: new Set([100, 200]),
      rarity: 2,
      currentHp: 30000,
      maxHp: 30000,
      activeBuffs: [],
      currentNpTurns: 0,
      npTurnLimit: 3,
      deathRate: 500,
      readyToNp: false,
      serverMod: { tdRate: 1200, tdAttackRate: 1200, starRate: 0 },
    });
  });
});

describe("buildServantInstance", () => {
  function niceServant(overrides: Partial<ServantModule.Servant> = {}): ServantModule.Servant {
    return {
      atkGrowth: [0, 1000, 2000],
      hpGrowth: [0, 500, 1000],
      className: "saber" as ServantModule.Servant["className"],
      attribute: "human" as ServantModule.Servant["attribute"],
      traits: [{ id: 100 }, { id: 200 }],
      cards: ["2", "2", "1", "1", "3"],
      starAbsorb: 90,
      starGen: 60,
      ...overrides,
    } as unknown as ServantModule.Servant;
  }

  function craftEssence(overrides: Partial<CraftEssence.CraftEssence> = {}): CraftEssence.CraftEssence {
    return {
      atkGrowth: [0, 0, 300, 400],
      hpGrowth: [0, 0, 150, 200],
      ...overrides,
    } as unknown as CraftEssence.CraftEssence;
  }

  function build(overrides: Partial<ServantBuild> = {}): ServantBuild {
    return {
      servantId: 100,
      level: 2,
      ascension: 1,
      skillLevels: [1, 1, 1],
      appendSkillLevels: {},
      npLevel: 2,
      fou: { atk: 200, hp: 100 },
      commandCodeIds: [],
      ...overrides,
    };
  }

  it("resolves atk/hp from the growth-array level plus fou, with no CE equipped", () => {
    const result = buildServantInstance(niceServant(), build(), true);
    expect(result).toEqual({
      servantId: 100,
      isFrontLine: true,
      atk: 1200, // atkGrowth[1] (1000) + fou.atk (200)
      className: "saber",
      attribute: "human",
      traits: new Set([100, 200]),
      cardTypes: ["2", "2", "1", "1", "3"],
      npLevel: 2,
      currentHp: 600, // hpGrowth[1] (500) + fou.hp (100)
      maxHp: 600,
      currentNpGauge: 0,
      activeBuffs: [],
      skillCooldowns: [0, 0, 0],
      criticalWeight: 90,
      starGen: 60,
    });
  });

  it("adds the equipped CE's own atk/hp at its owned level on top of the servant's and fou's", () => {
    const equippedCe: EquippedCraftEssence = { data: craftEssence(), level: 3 };
    const result = buildServantInstance(niceServant(), build(), false, equippedCe);
    expect(result.atk).toBe(1500); // 1000 (servant) + 300 (CE atkGrowth[2]) + 200 (fou)
    expect(result.currentHp).toBe(750); // 500 (servant) + 150 (CE hpGrowth[2]) + 100 (fou)
    expect(result.maxHp).toBe(750);
    expect(result.isFrontLine).toBe(false);
  });
});
