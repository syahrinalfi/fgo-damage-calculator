import type { Buff } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { resolveGuts } from "./guts.js";
import type { ActiveBuffInstance, BuffTraitContext } from "./types.js";

function makeInstance(overrides: Partial<ActiveBuffInstance> = {}): ActiveBuffInstance {
  return {
    type: "guts" as Buff.BuffType,
    amount: 500,
    ckSelfIndv: [],
    ckOpIndv: [],
    buffGroup: 600,
    ...overrides,
  };
}

const NO_TRAITS: BuffTraitContext = { holderTraits: new Set(), targetTraits: new Set() };

describe("resolveGuts", () => {
  it("does not trigger when HP is still above 0", () => {
    const result = resolveGuts(1, 1000, [makeInstance()], NO_TRAITS);
    expect(result).toEqual({ triggered: false, hpAfter: 1 });
  });

  it("does not trigger at HP 0 with no active Guts buff", () => {
    const result = resolveGuts(0, 1000, [], NO_TRAITS);
    expect(result).toEqual({ triggered: false, hpAfter: 0 });
  });

  it("revives to the buff's per-mille amount of max HP (Heracles bond CE: 500 = 50%)", () => {
    const result = resolveGuts(0, 1000, [makeInstance({ amount: 500 })], NO_TRAITS);
    expect(result).toEqual({ triggered: true, hpAfter: 500 });
  });

  it("triggers on overkill HP (well below 0), not just exactly 0", () => {
    const result = resolveGuts(-5000, 1000, [makeInstance({ amount: 500 })], NO_TRAITS);
    expect(result).toEqual({ triggered: true, hpAfter: 500 });
  });

  it("respects the defender's ckSelfIndv trait gate on the Guts buff", () => {
    const dragonTrait = { id: 2002, name: "dragon" };
    const buffs = [makeInstance({ ckSelfIndv: [dragonTrait] })];
    expect(resolveGuts(0, 1000, buffs, NO_TRAITS)).toEqual({ triggered: false, hpAfter: 0 });

    const dragonContext: BuffTraitContext = { holderTraits: new Set([2002]), targetTraits: new Set() };
    expect(resolveGuts(0, 1000, buffs, dragonContext)).toEqual({ triggered: true, hpAfter: 500 });
  });
});
