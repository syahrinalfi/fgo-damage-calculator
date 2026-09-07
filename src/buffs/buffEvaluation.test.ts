import type { Buff, Trait as TraitModule } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { resolveBuffActionModifier } from "./buffEvaluation.js";
import type { ActiveBuffInstance, BuffTraitContext } from "./types.js";

type Trait = TraitModule.Trait;

const DRAGON_TRAIT: Trait = { id: 2002, name: "dragon" };
const MALE_TRAIT: Trait = { id: 2003, name: "male" };

function makeAtkConstant(overrides: Partial<Buff.BuffConstant> = {}): Buff.BuffConstant {
  return {
    limit: "normal" as Buff.BuffLimit,
    plusTypes: ["upAtk"] as Buff.BuffType[],
    minusTypes: ["downAtk"] as Buff.BuffType[],
    baseParam: 1000,
    baseValue: 0,
    isRec: true,
    plusAction: 0,
    maxRate: [5000],
    ...overrides,
  };
}

function makeCriticalPointConstant(overrides: Partial<Buff.BuffConstant> = {}): Buff.BuffConstant {
  return {
    limit: "normal" as Buff.BuffLimit,
    plusTypes: ["upCriticalpoint"] as Buff.BuffType[],
    minusTypes: ["downCriticalpoint"] as Buff.BuffType[],
    baseParam: 1000,
    baseValue: 1000,
    isRec: true,
    plusAction: 0,
    maxRate: [5000],
    ...overrides,
  };
}

function makeInstance(overrides: Partial<ActiveBuffInstance> = {}): ActiveBuffInstance {
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

describe("resolveBuffActionModifier", () => {
  it("returns 0 with no active buffs, regardless of the action's raw baseParam/baseValue", () => {
    expect(resolveBuffActionModifier(makeAtkConstant(), [], NO_TRAITS)).toBe(0);
    expect(resolveBuffActionModifier(makeCriticalPointConstant(), [], NO_TRAITS)).toBe(0);
  });

  it("converts a single plus-type buff's raw per-mille amount to a decimal fraction", () => {
    const instances = [makeInstance({ amount: 200 })];
    expect(resolveBuffActionModifier(makeAtkConstant(), instances, NO_TRAITS)).toBeCloseTo(0.2, 10);
  });

  it("nets a minus-type buff against a plus-type buff on the same action", () => {
    const instances = [
      makeInstance({ type: "upAtk" as Buff.BuffType, amount: 300 }),
      makeInstance({ type: "downAtk" as Buff.BuffType, amount: 100 }),
    ];
    expect(resolveBuffActionModifier(makeAtkConstant(), instances, NO_TRAITS)).toBeCloseTo(0.2, 10);
  });

  it("ignores a buff instance whose type isn't registered to this action at all", () => {
    const instances = [makeInstance({ type: "upDefence" as Buff.BuffType, amount: 500 })];
    expect(resolveBuffActionModifier(makeAtkConstant(), instances, NO_TRAITS)).toBe(0);
  });

  it("floors the net total at the action's neutral baseline under a heavy debuff", () => {
    const instances = [makeInstance({ type: "downAtk" as Buff.BuffType, amount: 5000 })];
    expect(resolveBuffActionModifier(makeAtkConstant(), instances, NO_TRAITS)).toBeCloseTo(-1, 10);
  });

  it("caps the net total at the action's maxRate", () => {
    const instances = [makeInstance({ amount: 100_000 })];
    expect(resolveBuffActionModifier(makeAtkConstant({ maxRate: [2000] }), instances, NO_TRAITS)).toBeCloseTo(1, 10);
  });

  it("applies a criticalPoint-style action whose baseValue cancels baseParam to net delta 0 at baseline", () => {
    expect(resolveBuffActionModifier(makeCriticalPointConstant(), [], NO_TRAITS)).toBe(0);
    const instances = [makeInstance({ type: "upCriticalpoint" as Buff.BuffType, amount: 50 })];
    expect(resolveBuffActionModifier(makeCriticalPointConstant(), instances, NO_TRAITS)).toBeCloseTo(0.05, 10);
  });

  it("excludes a buff whose ckOpIndv trait gate the target doesn't satisfy", () => {
    const instances = [makeInstance({ ckOpIndv: [DRAGON_TRAIT] })];
    expect(resolveBuffActionModifier(makeAtkConstant(), instances, NO_TRAITS)).toBe(0);
  });

  it("includes a buff whose ckOpIndv trait gate the target does satisfy", () => {
    const instances = [makeInstance({ ckOpIndv: [DRAGON_TRAIT] })];
    const context: BuffTraitContext = { holderTraits: new Set(), targetTraits: new Set([2002]) };
    expect(resolveBuffActionModifier(makeAtkConstant(), instances, context)).toBeCloseTo(0.2, 10);
  });

  it("requires every trait in a multi-trait ckSelfIndv gate (AND semantics)", () => {
    const instances = [makeInstance({ ckSelfIndv: [DRAGON_TRAIT, MALE_TRAIT] })];
    const onlyDragon: BuffTraitContext = { holderTraits: new Set([2002]), targetTraits: new Set() };
    expect(resolveBuffActionModifier(makeAtkConstant(), instances, onlyDragon)).toBe(0);

    const both: BuffTraitContext = { holderTraits: new Set([2002, 2003]), targetTraits: new Set() };
    expect(resolveBuffActionModifier(makeAtkConstant(), instances, both)).toBeCloseTo(0.2, 10);
  });

  it("skips both buff-action clamp checks under the none limit", () => {
    const instances = [makeInstance({ type: "downAtk" as Buff.BuffType, amount: 50_000 })];
    const constant = makeAtkConstant({ limit: "none" as Buff.BuffLimit, maxRate: [100] });
    expect(resolveBuffActionModifier(constant, instances, NO_TRAITS)).toBeCloseTo(-50, 10);
  });
});
