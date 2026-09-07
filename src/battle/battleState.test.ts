import { describe, expect, it } from "vitest";
import type { ActiveBuffInstance } from "../buffs/types.js";
import type { TrackedBuff } from "./buffLifecycle.js";
import { enemyToBattleUnit, servantToBattleUnit, type EnemyInstance, type ServantInstance } from "./battleState.js";

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
    commandSealsRemaining: 3,
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

  it("ignores mutable-only fields (HP/gauge/cooldowns/Command Seals) not part of BattleUnit", () => {
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
