import type { Card } from "@atlasacademy/api-connector";
import type { DamageInput, ExtraCardChainType } from "../engine/damage.js";
import { BUFF_ACTION_KEYS } from "./buffActionKeys.js";
import { resolveCardTerm } from "./cardTerm.js";
import type { BattleConstants } from "./gameConstants.js";
import { resolveUnitActionModifier, resolveUnitFlatActionTotal } from "./modifiers.js";
import { resolveAttributeTriangleModifier, resolveClassAttackBonus, resolveClassTriangleModifier } from "./triangle.js";
import type { BattleUnit } from "./unit.js";

/**
 * Everything `resolveDamageInput` needs beyond the two units and the shared constants
 * bundle — the parts of `DamageInput` genuinely external to "static data + active buffs":
 * a per-hit random roll, whether this specific hit is a crit/NP/Extra-Attack/Buster-chain
 * finisher, and the super-effective check result (both of which depend on the specific
 * function/skill being resolved, not on unit state alone).
 *
 * `chainLeadCardType` — research/03 §3/§6, research/06 §7.2: `NiceCard.json`'s `addAtk`
 * field (this file's `firstCardBonus` term) is only ever nonzero at chain position 1, and
 * — per research/06 §7.2's confirmed "whichever color leads the chain grants a bonus to
 * *every* card in that chain (not just itself)" — must be looked up from the *chain's
 * lead card's own type* at position 1, not from `card.type`/`card.position` (which stay
 * this specific card's own true type/slot, driving `cardDamageValue` instead). A Buster-led
 * chain's 2nd/3rd cards (of any color) still get Buster's own `addAtk` bonus this way, even
 * though their own type's `addAtk` at their own position is 0.
 */
export interface DamageResolutionContext {
  card: { type: Card; position: number };
  chainLeadCardType: Card;
  npDamageMultiplier: number;
  randomModifier: number;
  isCrit: boolean;
  extraCardChainType: ExtraCardChainType;
  isSuperEffective: boolean;
  superEffectiveModifier: number;
  isNP: boolean;
  isBusterChain: boolean;
}

/**
 * Assembles a full `DamageInput` (research/02-damage-formula.md §1) from real servant/enemy
 * data: the two units' static stats and active buffs, the region's shared constants bundle
 * (`loadBattleConstants`), and the small set of per-hit context `calculateHitDamage` cannot
 * derive from state alone (§ `DamageResolutionContext` above). This is the "connect the
 * buff-evaluation layer to real data" integration point — `calculateHitDamage` itself is
 * unchanged and still only implements the formula once every term is known.
 */
export function resolveDamageInput(
  attacker: BattleUnit,
  defender: BattleUnit,
  constants: BattleConstants,
  context: DamageResolutionContext,
): DamageInput {
  const traitContext = { holderTraits: attacker.traits, targetTraits: defender.traits };
  const defenderContext = { holderTraits: defender.traits, targetTraits: attacker.traits };
  const cardTerm = resolveCardTerm(constants, context.card.type, context.card.position);
  const leadCardTerm = resolveCardTerm(constants, context.chainLeadCardType, 1);

  const cardMod =
    resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.COMMAND_ATK, attacker.activeBuffs, traitContext) -
    resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.COMMAND_DEF, defender.activeBuffs, defenderContext);

  const powerMod =
    resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.DAMAGE, attacker.activeBuffs, traitContext) +
    resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.DAMAGE_INDIVIDUALITY,
      attacker.activeBuffs,
      traitContext,
    ) +
    resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.DAMAGE_INDIVIDUALITY_ACTIVEONLY,
      attacker.activeBuffs,
      traitContext,
    );

  return {
    servantAtk: attacker.atk,
    npDamageMultiplier: context.npDamageMultiplier,
    firstCardBonus: leadCardTerm.atkAdd,
    cardDamageValue: cardTerm.atkAdjust,
    cardMod,
    classAtkBonus: resolveClassAttackBonus(constants, attacker.className),
    triangleModifier: resolveClassTriangleModifier(constants, attacker.className, defender.className),
    attributeModifier: resolveAttributeTriangleModifier(constants, attacker.attribute, defender.attribute),
    randomModifier: context.randomModifier,
    atkMod: resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.ATK, attacker.activeBuffs, traitContext),
    defMod: resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.DEFENCE, defender.activeBuffs, defenderContext),
    isCrit: context.isCrit,
    extraCardChainType: context.extraCardChainType,
    specialDefMod: resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.SPECIAL_DEFENCE,
      defender.activeBuffs,
      defenderContext,
    ),
    powerMod,
    selfDamageMod: resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.SELF_DAMAGE,
      defender.activeBuffs,
      defenderContext,
    ),
    critDamageMod: resolveUnitActionModifier(
      constants.buff,
      BUFF_ACTION_KEYS.CRITICAL_DAMAGE,
      attacker.activeBuffs,
      traitContext,
    ),
    isNP: context.isNP,
    npDamageMod: resolveUnitActionModifier(constants.buff, BUFF_ACTION_KEYS.NP_DAMAGE, attacker.activeBuffs, traitContext),
    superEffectiveModifier: context.superEffectiveModifier,
    isSuperEffective: context.isSuperEffective,
    dmgPlusAdd: resolveUnitFlatActionTotal(
      constants.buff,
      BUFF_ACTION_KEYS.GIVEN_DAMAGE,
      attacker.activeBuffs,
      traitContext,
    ),
    selfDmgCutAdd: resolveUnitFlatActionTotal(
      constants.buff,
      BUFF_ACTION_KEYS.RECEIVE_DAMAGE,
      defender.activeBuffs,
      defenderContext,
    ),
    isBusterChain: context.isBusterChain,
  };
}
