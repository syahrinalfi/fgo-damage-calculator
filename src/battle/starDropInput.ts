import type { Card } from "@atlasacademy/api-connector";
import type { StarDropInput } from "../engine/starDrop.js";
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
  baseStarRate: number;
  serverRate: number;
  isCrit: boolean;
  isOverkill: boolean;
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
    firstCardBonus: cardTerm.criticalAdd,
    cardStarValue: cardTerm.criticalAdjust,
    cardMod,
    serverRate: context.serverRate,
    starDropMod: resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.CRITICAL_POINT,
      attacker.activeBuffs,
      traitContext,
    ),
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
