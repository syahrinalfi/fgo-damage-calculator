import { Buff, Card } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { calculateHitDamage } from "../engine/damage.js";
import { getGameDataClient, Region } from "../data/index.js";
import { getBuffConstant } from "./buffActionKeys.js";
import { resolveDamageInput, type DamageResolutionContext } from "./damageInput.js";
import { loadBattleConstants } from "./gameConstants.js";
import { servantAtkAtLevel, traitIdSet, type BattleUnit } from "./unit.js";

describe("battle module (live Atlas Academy API)", () => {
  it("confirms the damageDef/selfdamage key discrepancy documented in buffActionKeys.ts", async () => {
    const client = getGameDataClient(Region.JP);
    const constants = await client.buffConstant();

    expect(getBuffConstant(constants, "damageDef")).toBeDefined();
    expect((constants as Record<string, unknown>)[Buff.BuffAction.DAMAGE_DEF]).toBeUndefined();
  });

  it("resolves a full DamageInput for a real servant and produces plausible positive damage", async () => {
    const client = getGameDataClient(Region.JP);
    const [mash, constants] = await Promise.all([client.servant(1), loadBattleConstants(client)]);

    const attacker: BattleUnit = {
      atk: servantAtkAtLevel(mash, 1),
      className: mash.className,
      attribute: mash.attribute,
      traits: traitIdSet(mash.traits),
      activeBuffs: [],
    };
    const defender: BattleUnit = { ...attacker, activeBuffs: [] };

    const cardType = (mash.noblePhantasms[0]?.card as Card | undefined) ?? Card.ARTS;
    const context: DamageResolutionContext = {
      card: { type: cardType, position: 1 },
      chainLeadCardType: cardType,
      npDamageMultiplier: 1,
      randomModifier: 1,
      isCrit: false,
      extraCardChainType: "none",
      isSuperEffective: false,
      superEffectiveModifier: 1,
      isNP: false,
      isBusterChain: false,
      isMightyChain: false,
    };

    const input = resolveDamageInput(attacker, defender, constants, context);
    expect(input.servantAtk).toBeGreaterThan(0);
    expect(input.atkMod).toBe(0);
    expect(input.defMod).toBe(0);

    const damage = calculateHitDamage(input);
    expect(damage).toBeGreaterThan(0);
  });
});
