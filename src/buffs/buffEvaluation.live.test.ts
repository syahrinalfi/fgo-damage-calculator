import { Buff } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { getGameDataClient, Region } from "../data/index.js";
import { resolveBuffActionModifier } from "./buffEvaluation.js";
import type { ActiveBuffInstance, BuffTraitContext } from "./types.js";

const NO_TRAITS: BuffTraitContext = { holderTraits: new Set(), targetTraits: new Set() };

describe("resolveBuffActionModifier (live Atlas Academy API)", () => {
  it("matches the atk action's live registry: upAtk contributes, downDefence does not", async () => {
    const client = getGameDataClient(Region.JP);
    const constants = await client.buffConstant();
    const atk = constants[Buff.BuffAction.ATK];
    expect(atk).toBeDefined();
    if (!atk) return;

    expect(atk.plusTypes).toContain(Buff.BuffType.UP_ATK);
    expect(atk.minusTypes).toContain(Buff.BuffType.DOWN_ATK);

    const buffedAtk: ActiveBuffInstance[] = [
      { type: Buff.BuffType.UP_ATK, amount: 300, ckSelfIndv: [], ckOpIndv: [] },
      { type: Buff.BuffType.DOWN_DEFENCE, amount: 9999, ckSelfIndv: [], ckOpIndv: [] },
    ];
    expect(resolveBuffActionModifier(atk, buffedAtk, NO_TRAITS)).toBeCloseTo(0.3, 10);
  });

  it("resolves the criticalPoint action to a net-zero baseline with no active buffs", async () => {
    const client = getGameDataClient(Region.JP);
    const constants = await client.buffConstant();
    const criticalPoint = constants[Buff.BuffAction.CRITICAL_POINT];
    expect(criticalPoint).toBeDefined();
    if (!criticalPoint) return;

    expect(resolveBuffActionModifier(criticalPoint, [], NO_TRAITS)).toBe(0);
  });
});
