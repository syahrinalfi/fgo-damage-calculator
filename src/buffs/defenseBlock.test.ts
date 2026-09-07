import type { Buff } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { resolveDefenseBlock } from "./defenseBlock.js";
import type { ActiveBuffInstance, BuffTraitContext } from "./types.js";

function makeInstance(overrides: Partial<ActiveBuffInstance> = {}): ActiveBuffInstance {
  return {
    type: "upAtk" as Buff.BuffType,
    amount: 0,
    ckSelfIndv: [],
    ckOpIndv: [],
    buffGroup: 0,
    ...overrides,
  };
}

const NO_TRAITS: BuffTraitContext = { holderTraits: new Set(), targetTraits: new Set() };

describe("resolveDefenseBlock", () => {
  it("does not block when the defender has no defensive buffs", () => {
    const result = resolveDefenseBlock([], NO_TRAITS, [], NO_TRAITS);
    expect(result).toEqual({ blocked: false, tier: null });
  });

  it("blocks on Evade (avoidance) when the attacker has no piercing buff", () => {
    const defenderBuffs = [makeInstance({ type: "avoidance" as Buff.BuffType, buffGroup: 200 })];
    const result = resolveDefenseBlock(defenderBuffs, NO_TRAITS, [], NO_TRAITS);
    expect(result).toEqual({ blocked: true, tier: "avoidance" });
  });

  it("pierces Evade with breakAvoidance (Sure Hit)", () => {
    const defenderBuffs = [makeInstance({ type: "avoidance" as Buff.BuffType, buffGroup: 200 })];
    const attackerBuffs = [makeInstance({ type: "breakAvoidance" as Buff.BuffType })];
    const result = resolveDefenseBlock(defenderBuffs, NO_TRAITS, attackerBuffs, NO_TRAITS);
    expect(result).toEqual({ blocked: false, tier: null });
  });

  it("blocks on Invincible when the attacker only has breakAvoidance (Sure Hit is Evade-only)", () => {
    const defenderBuffs = [makeInstance({ type: "invincible" as Buff.BuffType, buffGroup: 400 })];
    const attackerBuffs = [makeInstance({ type: "breakAvoidance" as Buff.BuffType })];
    const result = resolveDefenseBlock(defenderBuffs, NO_TRAITS, attackerBuffs, NO_TRAITS);
    expect(result).toEqual({ blocked: true, tier: "invincible" });
  });

  it("pierces Invincible with pierceInvincible", () => {
    const defenderBuffs = [makeInstance({ type: "invincible" as Buff.BuffType, buffGroup: 400 })];
    const attackerBuffs = [makeInstance({ type: "pierceInvincible" as Buff.BuffType })];
    const result = resolveDefenseBlock(defenderBuffs, NO_TRAITS, attackerBuffs, NO_TRAITS);
    expect(result).toEqual({ blocked: false, tier: null });
  });

  it("pierceInvincible also pierces a co-present Evade in the same hit", () => {
    const defenderBuffs = [
      makeInstance({ type: "invincible" as Buff.BuffType, buffGroup: 400 }),
      makeInstance({ type: "avoidance" as Buff.BuffType, buffGroup: 200 }),
    ];
    const attackerBuffs = [makeInstance({ type: "pierceInvincible" as Buff.BuffType })];
    const result = resolveDefenseBlock(defenderBuffs, NO_TRAITS, attackerBuffs, NO_TRAITS);
    expect(result).toEqual({ blocked: false, tier: null });
  });

  it("blocks on specialInvincible even against pierceInvincible (anti-purge)", () => {
    const defenderBuffs = [makeInstance({ type: "specialInvincible" as Buff.BuffType, buffGroup: 250 })];
    const attackerBuffs = [makeInstance({ type: "pierceInvincible" as Buff.BuffType })];
    const result = resolveDefenseBlock(defenderBuffs, NO_TRAITS, attackerBuffs, NO_TRAITS);
    expect(result).toEqual({ blocked: true, tier: "specialInvincible" });
  });

  it("pierces specialInvincible only with pierceSpecialInvincible", () => {
    const defenderBuffs = [makeInstance({ type: "specialInvincible" as Buff.BuffType, buffGroup: 250 })];
    const attackerBuffs = [makeInstance({ type: "pierceSpecialInvincible" as Buff.BuffType })];
    const result = resolveDefenseBlock(defenderBuffs, NO_TRAITS, attackerBuffs, NO_TRAITS);
    expect(result).toEqual({ blocked: false, tier: null });
  });

  it("falls through to Invincible once specialInvincible is pierced", () => {
    const defenderBuffs = [
      makeInstance({ type: "specialInvincible" as Buff.BuffType, buffGroup: 250 }),
      makeInstance({ type: "invincible" as Buff.BuffType, buffGroup: 400 }),
    ];
    const attackerBuffs = [makeInstance({ type: "pierceSpecialInvincible" as Buff.BuffType })];
    const result = resolveDefenseBlock(defenderBuffs, NO_TRAITS, attackerBuffs, NO_TRAITS);
    expect(result).toEqual({ blocked: true, tier: "invincible" });
  });

  it("respects the defender's ckSelfIndv trait gate on the defensive buff", () => {
    const dragonTrait = { id: 2002, name: "dragon" };
    const defenderBuffs = [
      makeInstance({ type: "avoidance" as Buff.BuffType, buffGroup: 200, ckSelfIndv: [dragonTrait] }),
    ];
    expect(resolveDefenseBlock(defenderBuffs, NO_TRAITS, [], NO_TRAITS)).toEqual({ blocked: false, tier: null });

    const dragonContext: BuffTraitContext = { holderTraits: new Set([2002]), targetTraits: new Set() };
    expect(resolveDefenseBlock(defenderBuffs, dragonContext, [], NO_TRAITS)).toEqual({
      blocked: true,
      tier: "avoidance",
    });
  });
});
