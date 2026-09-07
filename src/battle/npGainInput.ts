import type { Card } from "@atlasacademy/api-connector";
import type { AttackingNpGainInput, DefendingNpGainInput } from "../engine/npGain.js";
import { BUFF_ACTION_KEYS } from "./buffActionKeys.js";
import { resolveCardTerm } from "./cardTerm.js";
import type { BattleConstants } from "./gameConstants.js";
import { resolveUnitActionModifier } from "./modifiers.js";
import type { BattleUnit } from "./unit.js";

/**
 * Everything `resolveAttackingNpGainInput` needs beyond the two units and the shared
 * constants bundle — the parts of `AttackingNpGainInput` that aren't client-computable
 * from static data alone (research/04-np-gauge-and-refund.md §4): the NP's own base gain
 * rate, the server-supplied `tdRate`, and whether this specific hit is a crit/Overkill.
 * A context object (matching `DamageResolutionContext`'s shape) instead of positional
 * parameters, specifically to avoid two adjacent same-typed booleans (`isCrit`,
 * `isOverkill`) being silently swappable at a call site.
 */
export interface AttackingNpGainResolutionContext {
  card: { type: Card; position: number };
  offensiveNPRate: number;
  enemyServerMod: number;
  isCrit: boolean;
  isOverkill: boolean;
}

/**
 * Assembles an `AttackingNpGainInput` (research/04 §1) from real data: the two units'
 * static stats/active buffs plus the small set of context the formula cannot derive on
 * its own (§ `AttackingNpGainResolutionContext` above).
 */
export function resolveAttackingNpGainInput(
  attacker: BattleUnit,
  defender: BattleUnit,
  constants: BattleConstants,
  context: AttackingNpGainResolutionContext,
): AttackingNpGainInput {
  const traitContext = { holderTraits: attacker.traits, targetTraits: defender.traits };
  const defenderContext = { holderTraits: defender.traits, targetTraits: attacker.traits };
  const cardTerm = resolveCardTerm(constants, context.card.type, context.card.position);

  const cardMod =
    resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.COMMAND_NP_ATK, attacker.activeBuffs, traitContext) -
    resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.COMMAND_NP_DEF,
      defender.activeBuffs,
      defenderContext,
    );

  return {
    offensiveNPRate: context.offensiveNPRate,
    firstCardBonus: cardTerm.npGaugeAdd,
    cardNpValue: cardTerm.npGaugeAdjust,
    cardMod,
    enemyServerMod: context.enemyServerMod,
    npChargeRateMod: resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.DROP_NP,
      attacker.activeBuffs,
      traitContext,
    ),
    isCrit: context.isCrit,
    isOverkill: context.isOverkill,
  };
}

/**
 * Everything `resolveDefendingNpGainInput` needs beyond the two units and the shared
 * constants bundle: the defending unit's static NP-gain rate and the attacker's
 * server-supplied `tdAttackRate`.
 */
export interface DefendingNpGainResolutionContext {
  defensiveNPRate: number;
  enemyServerMod: number;
}

/**
 * Assembles a `DefendingNpGainInput` (research/04 §2) from real data: the defending
 * unit's static NP-gain rate/active buffs plus the attacker's server-supplied
 * `tdAttackRate`.
 */
export function resolveDefendingNpGainInput(
  defender: BattleUnit,
  attacker: BattleUnit,
  constants: BattleConstants,
  context: DefendingNpGainResolutionContext,
): DefendingNpGainInput {
  const traitContext = { holderTraits: defender.traits, targetTraits: attacker.traits };

  return {
    defensiveNPRate: context.defensiveNPRate,
    enemyServerMod: context.enemyServerMod,
    npChargeRateMod: resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.DROP_NP,
      defender.activeBuffs,
      traitContext,
    ),
    defensiveChargeRateMod: resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.DROP_NP_DAMAGE,
      defender.activeBuffs,
      traitContext,
    ),
  };
}
