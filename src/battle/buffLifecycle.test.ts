import type { Buff } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ActiveBuffInstance, BuffTraitContext } from "../buffs/types.js";
import { advanceTurnBuffs, consumeBuffUse, grantBuff, removeBuffsByTrait, type TrackedBuff } from "./buffLifecycle.js";

function makeBuff(overrides: Partial<ActiveBuffInstance> = {}): ActiveBuffInstance {
  return {
    type: "upAtk" as Buff.BuffType,
    amount: 200,
    ckSelfIndv: [],
    ckOpIndv: [],
    buffGroup: 0,
    ...overrides,
  };
}

const NO_TRAITS: BuffTraitContext = { holderTraits: new Set(), targetTraits: new Set() };

describe("grantBuff", () => {
  it("converts raw -1 Turn/Count to null (unlimited)", () => {
    const result = grantBuff([], makeBuff(), -1, -1);
    expect(result).toEqual([expect.objectContaining({ turnsRemaining: null, usesRemaining: null })]);
  });

  it("carries finite Turn/Count through as-is", () => {
    const result = grantBuff([], makeBuff({ type: "invincible" as Buff.BuffType, buffGroup: 400 }), 1, -1);
    expect(result[0]).toMatchObject({ turnsRemaining: 1, usesRemaining: null });
  });

  it("still applies the buffGroup collision rule (reject-new)", () => {
    const existing = grantBuff([], makeBuff({ type: "avoidance" as Buff.BuffType, buffGroup: 200 }), -1, 3);
    const result = grantBuff(existing, makeBuff({ type: "avoidance" as Buff.BuffType, buffGroup: 200 }), -1, 3);
    expect(result).toBe(existing);
  });
});

describe("advanceTurnBuffs", () => {
  it("leaves an unlimited-Turn instance untouched", () => {
    const tracked: TrackedBuff[] = [{ ...makeBuff(), turnsRemaining: null, usesRemaining: 3 }];
    expect(advanceTurnBuffs(tracked)).toEqual(tracked);
  });

  it("decrements a finite turnsRemaining by 1", () => {
    const tracked: TrackedBuff[] = [{ ...makeBuff(), turnsRemaining: 3, usesRemaining: null }];
    const result = advanceTurnBuffs(tracked);
    expect(result).toHaveLength(1);
    expect(result[0]?.turnsRemaining).toBe(2);
  });

  it("drops an instance once turnsRemaining reaches 0", () => {
    const tracked: TrackedBuff[] = [{ ...makeBuff(), turnsRemaining: 1, usesRemaining: null }];
    expect(advanceTurnBuffs(tracked)).toEqual([]);
  });

  it("does not touch usesRemaining", () => {
    const tracked: TrackedBuff[] = [{ ...makeBuff(), turnsRemaining: 3, usesRemaining: 2 }];
    const result = advanceTurnBuffs(tracked);
    expect(result[0]?.usesRemaining).toBe(2);
  });
});

describe("consumeBuffUse", () => {
  it("decrements the matching instance's usesRemaining by 1", () => {
    const tracked: TrackedBuff[] = [
      { ...makeBuff({ type: "avoidance" as Buff.BuffType, buffGroup: 200 }), turnsRemaining: null, usesRemaining: 3 },
    ];
    const result = consumeBuffUse(tracked, "avoidance" as Buff.BuffType, NO_TRAITS);
    expect(result).toHaveLength(1);
    expect(result[0]?.usesRemaining).toBe(2);
  });

  it("drops the instance once usesRemaining reaches 0", () => {
    const tracked: TrackedBuff[] = [
      { ...makeBuff({ type: "guts" as Buff.BuffType, buffGroup: 600 }), turnsRemaining: null, usesRemaining: 1 },
    ];
    expect(consumeBuffUse(tracked, "guts" as Buff.BuffType, NO_TRAITS)).toEqual([]);
  });

  it("leaves an unlimited-use instance untouched", () => {
    const tracked: TrackedBuff[] = [
      { ...makeBuff({ type: "invincible" as Buff.BuffType, buffGroup: 400 }), turnsRemaining: 1, usesRemaining: null },
    ];
    const result = consumeBuffUse(tracked, "invincible" as Buff.BuffType, NO_TRAITS);
    expect(result).toEqual(tracked);
  });

  it("only consumes one matching instance, leaving others of the same type untouched", () => {
    const tracked: TrackedBuff[] = [
      { ...makeBuff({ type: "guts" as Buff.BuffType, buffGroup: 600 }), turnsRemaining: null, usesRemaining: 1 },
      { ...makeBuff({ type: "guts" as Buff.BuffType, buffGroup: 601 }), turnsRemaining: null, usesRemaining: 2 },
    ];
    const result = consumeBuffUse(tracked, "guts" as Buff.BuffType, NO_TRAITS);
    expect(result).toHaveLength(1);
    expect(result[0]?.buffGroup).toBe(601);
    expect(result[0]?.usesRemaining).toBe(2);
  });

  it("respects the trait gate, skipping a non-matching instance", () => {
    const dragonTrait = { id: 2002, name: "dragon" };
    const tracked: TrackedBuff[] = [
      {
        ...makeBuff({ type: "avoidance" as Buff.BuffType, buffGroup: 200, ckSelfIndv: [dragonTrait] }),
        turnsRemaining: null,
        usesRemaining: 3,
      },
    ];
    const result = consumeBuffUse(tracked, "avoidance" as Buff.BuffType, NO_TRAITS);
    expect(result[0]?.usesRemaining).toBe(3);
  });

  it("does nothing when no instance of the given type is present", () => {
    const tracked: TrackedBuff[] = [{ ...makeBuff(), turnsRemaining: null, usesRemaining: 3 }];
    expect(consumeBuffUse(tracked, "avoidance" as Buff.BuffType, NO_TRAITS)).toEqual(tracked);
  });
});

describe("removeBuffsByTrait", () => {
  const BUFF_POSITIVE_EFFECT = 3004;

  it("removes every instance whose vals contains the target trait, regardless of Turn/Count", () => {
    const tracked: TrackedBuff[] = [
      { ...makeBuff({ vals: new Set([BUFF_POSITIVE_EFFECT]) }), turnsRemaining: null, usesRemaining: null },
      { ...makeBuff({ type: "guts" as Buff.BuffType, vals: new Set([BUFF_POSITIVE_EFFECT, 2000]) }), turnsRemaining: 5, usesRemaining: 1 },
    ];
    expect(removeBuffsByTrait(tracked, BUFF_POSITIVE_EFFECT)).toEqual([]);
  });

  it("leaves an instance untouched when its vals doesn't contain the target trait", () => {
    const tracked: TrackedBuff[] = [{ ...makeBuff({ vals: new Set([9999]) }), turnsRemaining: 3, usesRemaining: null }];
    expect(removeBuffsByTrait(tracked, BUFF_POSITIVE_EFFECT)).toEqual(tracked);
  });

  it("never matches an instance with no vals recorded at all", () => {
    const tracked: TrackedBuff[] = [{ ...makeBuff(), turnsRemaining: 3, usesRemaining: null }];
    expect(removeBuffsByTrait(tracked, BUFF_POSITIVE_EFFECT)).toEqual(tracked);
  });

  it("removes only the matching instances, leaving the rest", () => {
    const matching: TrackedBuff = { ...makeBuff({ vals: new Set([BUFF_POSITIVE_EFFECT]) }), turnsRemaining: 2, usesRemaining: null };
    const nonMatching: TrackedBuff = { ...makeBuff({ type: "downAtk" as Buff.BuffType, vals: new Set([5000]) }), turnsRemaining: 2, usesRemaining: null };
    expect(removeBuffsByTrait([matching, nonMatching], BUFF_POSITIVE_EFFECT)).toEqual([nonMatching]);
  });
});
