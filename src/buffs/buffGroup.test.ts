import type { Buff } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { applyBuff } from "./buffGroup.js";
import type { ActiveBuffInstance } from "./types.js";

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

describe("applyBuff", () => {
  it("always stacks a buffGroup 0 instance, even alongside a copy of itself", () => {
    const existing = [makeInstance({ buffGroup: 0 })];
    const result = applyBuff(existing, makeInstance({ buffGroup: 0 }));
    expect(result).toHaveLength(2);
  });

  it("stacks a non-zero buffGroup instance when no existing instance shares that group", () => {
    const existing = [makeInstance({ type: "guts" as Buff.BuffType, buffGroup: 600 })];
    const result = applyBuff(existing, makeInstance({ type: "avoidance" as Buff.BuffType, buffGroup: 200 }));
    expect(result).toHaveLength(2);
  });

  it("rejects a new application colliding with an already-active same non-zero buffGroup, leaving the existing instance untouched (reject-new)", () => {
    const existing = [
      makeInstance({ type: "specialInvincible" as Buff.BuffType, amount: 1000, buffGroup: 250 }),
    ];
    const result = applyBuff(
      existing,
      makeInstance({ type: "specialInvincible" as Buff.BuffType, amount: 1000, buffGroup: 250 }),
    );
    expect(result).toBe(existing);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(existing[0]);
  });

  it("does not treat different non-zero buffGroups as colliding (e.g. Heracles' two Guts groups)", () => {
    const existing = [makeInstance({ type: "guts" as Buff.BuffType, buffGroup: 600 })];
    const result = applyBuff(existing, makeInstance({ type: "guts" as Buff.BuffType, buffGroup: 601 }));
    expect(result).toHaveLength(2);
  });
});
