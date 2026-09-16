import type { Card } from "@atlasacademy/api-connector";
import type { StarDropInput } from "../engine/starDrop.js";
import { CHAINBONUS_MIGHTY_STARRATE } from "../engine/constants.js";
import { BUFF_ACTION_KEYS } from "./buffActionKeys.js";
import { resolveCardTerm } from "./cardTerm.js";
import type { BattleConstants } from "./gameConstants.js";
import { resolveUnitActionModifier } from "./modifiers.js";
import type { BattleUnit } from "./unit.js";

/**
 * Everything `resolveStarDropInput` needs beyond the two units and the shared constants
 * bundle — the attacker's own `NiceServant.starGen` baseline, the server-supplied
 * per-hit star-rate modifier, and whether this specific hit is a crit/Overkill. A
 * context object (matching `DamageResolutionContext`'s shape) instead of positional
 * parameters, specifically to avoid two adjacent same-typed booleans (`isCrit`,
 * `isOverkill`) being silently swappable at a call site.
 */
export interface StarDropResolutionContext {
  card: { type: Card; position: number };
  /** See `DamageResolutionContext.chainLeadCardType`'s doc comment (`./damageInput.js`) — same "chain lead's own position-1 `addCritical`" lookup, this formula's own `firstCardBonus` term (research/06 §7.2's Quick-lead +20% critical-star-generation-rate bonus). */
  chainLeadCardType: Card;
  baseStarRate: number;
  serverRate: number;
  isCrit: boolean;
  isOverkill: boolean;
  /** NP hits use their own color/base rate but do not receive ordinary first-card or Mighty-chain bonuses themselves. */
  isNP?: boolean;
  /** Whether this hit is one of a Mighty Chain's 3 cards (research/06 §7.4, `CHAINBONUS_MIGHTY_STARRATE`) — added to `starDropMod` alongside any buff-sourced star-drop-up. */
  isMightyChain: boolean;
}

/**
 * Assembles a `StarDropInput` (research/03-card-and-hit-mechanics.md §5.1) from real
 * data: the two units' active buffs plus the small set of context the formula cannot
 * derive on its own (§ `StarDropResolutionContext` above).
 */
export function resolveStarDropInput(
  attacker: BattleUnit,
  defender: BattleUnit,
  constants: BattleConstants,
  context: StarDropResolutionContext,
): StarDropInput {
  const traitContext = { holderTraits: attacker.traits, targetTraits: defender.traits };
  const defenderContext = { holderTraits: defender.traits, targetTraits: attacker.traits };
  const cardTerm = resolveCardTerm(constants, context.card.type, context.card.position);
  const leadCardTerm = resolveCardTerm(constants, context.chainLeadCardType, 1);

  const cardMod =
    resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.COMMAND_STAR_ATK, attacker.activeBuffs, traitContext) -
    resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.COMMAND_STAR_DEF,
      defender.activeBuffs,
      defenderContext,
    );

  return {
    baseStarRate: context.baseStarRate,
    firstCardBonus: context.isNP ? 0 : leadCardTerm.criticalAdd,
    cardStarValue: cardTerm.criticalAdjust,
    cardMod,
    serverRate: context.serverRate,
    starDropMod:
      resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.CRITICAL_POINT, attacker.activeBuffs, traitContext) +
      (!context.isNP && context.isMightyChain ? CHAINBONUS_MIGHTY_STARRATE : 0),
    enemyStarDropMod: resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.CRITICAL_POINT,
      defender.activeBuffs,
      defenderContext,
    ),
    isCrit: context.isCrit,
    isOverkill: context.isOverkill,
  };
}
