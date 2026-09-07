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
 */
export interface DamageResolutionContext {
  card: { type: Card; position: number };
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
    firstCardBonus: cardTerm.atkAdd,
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
