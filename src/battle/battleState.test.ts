import { describe, expect, it } from "vitest";
import type { ActiveBuffInstance } from "../buffs/types.js";
import type { WaveEnemy } from "../quest/types.js";
import type { TrackedBuff } from "./buffLifecycle.js";
import { buildEnemyInstance, enemyToBattleUnit, servantToBattleUnit, type EnemyInstance, type ServantInstance } from "./battleState.js";

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
      svt: { className: "rider", attribute: "sky" },
      enemyScript: {},
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
      currentHp: 30000,
      maxHp: 30000,
      activeBuffs: [],
      currentNpTurns: 0,
      npTurnLimit: 3,
      deathRate: 500,
      readyToNp: false,
    });
  });
});
