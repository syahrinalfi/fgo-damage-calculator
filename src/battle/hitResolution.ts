import type { Card } from "@atlasacademy/api-connector";
import { resolveDefenseBlock, resolveGuts, type DefenseBlockResult, type GutsResult } from "../buffs/index.js";
import { calculateHitDamage, type ExtraCardChainType } from "../engine/damage.js";
import { calculateAttackingNpGain } from "../engine/npGain.js";
import { calculateStarDropChance } from "../engine/starDrop.js";
import { resolveDamageInput } from "./damageInput.js";
import type { BattleConstants } from "./gameConstants.js";
import { resolveAttackingNpGainInput } from "./npGainInput.js";
import { resolveStarDropInput } from "./starDropInput.js";
import type { BattleUnit } from "./unit.js";

/**
 * Everything `resolveHit` needs beyond the two units, their current HP, and the shared
 * constants bundle — the per-hit context none of `resolveDamageInput`/
 * `resolveAttackingNpGainInput`/`resolveStarDropInput` can derive on their own. `isCrit`
 * is shared across all three underlying formulas (research/02-04 all key off the same
 * crit/non-crit hit), unlike `isOverkill`, which this function derives itself from the
 * resolved damage vs. `defenderHp` (research/02: Overkill is "dealt more damage than the
 * target's remaining HP" — not something the caller can know ahead of the damage roll).
 * `npEnemyServerMod`/`starEnemyServerMod` are deliberately distinct fields, not one shared
 * `enemyServerMod` — research/04 §2 confirms `tdRate`/`tdAttackRate` and the star-drop
 * server rate are separate server-supplied stats, not the same number reused.
 */
export interface HitResolutionContext {
  card: { type: Card; position: number };
  /** See `DamageResolutionContext.chainLeadCardType`'s doc comment (`./damageInput.js`) — threaded into all three of `resolveDamageInput`/`resolveAttackingNpGainInput`/`resolveStarDropInput`'s own same-named field below. */
  chainLeadCardType: Card;
  isCrit: boolean;
  npDamageMultiplier: number;
  randomModifier: number;
  extraCardChainType: ExtraCardChainType;
  isSuperEffective: boolean;
  superEffectiveModifier: number;
  isNP: boolean;
  isBusterChain: boolean;
  /**
   * Whether this hit is one of a Mighty Chain's 3 cards (research/06 §7.4) — feeds
   * `DamageInput.isMightyChain` (`../engine/damage.js`, the +50% ATK term),
   * `AttackingNpGainInput.npChargeRateMod` (`../engine/npGain.js`, via
   * `CHAINBONUS_MIGHTY_NPGAIN_RATE`, the +100% NP-gain-rate term), and
   * `StarDropInput.starDropMod` (`../engine/starDrop.js`, via `CHAINBONUS_MIGHTY_STARRATE`,
   * the +20% critical-star-generation-rate term) — all 3 of Mighty Chain's confirmed
   * per-hit bonuses.
   */
  isMightyChain: boolean;
  offensiveNPRate: number;
  npEnemyServerMod: number;
  baseStarRate: number;
  starEnemyServerMod: number;
  /** Inherent Ignore Defense on this attack; only positive ordinary DEF modifiers are bypassed. */
  ignoreDefense?: boolean;
  /** Optimizer-only counterfactual replay switch: preserve gauge/star/effect sequencing while forcing this hit's damage to zero. */
  suppressDamage?: boolean;
  /**
   * The attacking card's own traits (`NiceTd.individuality` for an NP, e.g. `cardBuster` +
   * `cardNP`). Omitted for a normal card, whose traits come from `NiceCard.json`'s
   * `individuality` for its type and position (e.g. `cardBuster` + `faceCard`).
   */
  cardTraits?: readonly number[];
}

/** `nice_trait.json`: 4007 `cardNP`, 4008 `faceCard`. */
const NP_CARD_TRAIT = 4007;
const FACE_CARD_TRAIT = 4008;

/**
 * The traits a buff's `ckSelfIndv` sees while this card attacks: the attacker's own traits
 * plus the card's. Card-type buffs gate on the card's trait (Koyanskaya of Light's "NFF
 * Special" `upCommandall` carries `ckSelfIndv: [4002 cardBuster]`), and fgo-docs
 * `deeper/battle/buff.md`/`damage.md` count `upCommandall` into `cardMod` for a matching card.
 * An NP without explicit `cardTraits` takes its type's `NiceCard.json` traits with `faceCard`
 * swapped for `cardNP`.
 */
export function attackingCardTraits(constants: BattleConstants, context: Pick<HitResolutionContext, "card" | "isNP" | "cardTraits">): readonly number[] {
  if (context.cardTraits !== undefined) return context.cardTraits;
  const entry = constants.card[context.card.type]?.[context.card.position] ?? constants.card[context.card.type]?.[1];
  const traits = (entry?.individuality ?? []).map((trait) => trait.id);
  return context.isNP ? [...traits.filter((trait) => trait !== FACE_CARD_TRAIT), NP_CARD_TRAIT] : traits;
}

/**
 * Resolves one hit end to end: this is the first real integration point tying the
 * Evade/Invincible/`specialInvincible` priority check (`resolveDefenseBlock`,
 * research/05 §6.3) and Guts (`resolveGuts`, §6.2) into the damage/NP-gain/star-drop
 * pipeline (research/02-04) that `resolveDamageInput`/`resolveAttackingNpGainInput`/
 * `resolveStarDropInput` already wire to real unit data — research/09 §2's per-hit
 * pipeline steps 3a-3e, minus chain/hand/skill-effect bookkeeping (steps 1-2 and 4-5),
 * which need the full `Action`/turn-loop model this function doesn't attempt yet.
 *
 * Per research/05 §6.4: a blocked hit's damage is gated to 0, but NP gain and star-drop
 * chance still resolve normally — only `damage`/`hpAfterDamage` are affected by `defense`.
 */
export interface HitResolutionResult {
  defense: DefenseBlockResult;
  /** 0 if `defense.blocked`, otherwise the full research/02 formula output. */
  damage: number;
  /** Raw attacking NP-gauge gain (`FULL_TD_POINT` units, research/04 §1) — resolves normally even if blocked. */
  npGain: number;
  /** Star-drop probability (research/03 §5.1) — resolves normally even if blocked. */
  starDropChance: number;
  /** Whether this hit dealt more damage than the defender's remaining HP (always false if blocked). */
  isOverkill: boolean;
  /** `defenderHp - damage`, before any Guts revival — may be zero or negative. */
  hpAfterDamage: number;
  guts: GutsResult;
  /** Guts' revive HP if it triggered, otherwise `hpAfterDamage` floored at 0. */
  defenderHpFinal: number;
  /** True only if HP reached 0-or-below and no Guts instance revived the defender. */
  defeated: boolean;
}

export function resolveHit(
  unitAttacker: BattleUnit,
  defender: BattleUnit,
  defenderHp: number,
  defenderMaxHp: number,
  constants: BattleConstants,
  context: HitResolutionContext,
): HitResolutionResult {
  const attacker: BattleUnit = { ...unitAttacker, traits: new Set([...unitAttacker.traits, ...attackingCardTraits(constants, context)]) };
  const traitContext = { holderTraits: attacker.traits, targetTraits: defender.traits };
  const defenderContext = { holderTraits: defender.traits, targetTraits: attacker.traits };

  const defense = resolveDefenseBlock(defender.activeBuffs, defenderContext, attacker.activeBuffs, traitContext);

  const damageInput = resolveDamageInput(attacker, defender, constants, {
    card: context.card,
    chainLeadCardType: context.chainLeadCardType,
    npDamageMultiplier: context.npDamageMultiplier,
    randomModifier: context.randomModifier,
    isCrit: context.isCrit,
    extraCardChainType: context.extraCardChainType,
    isSuperEffective: context.isSuperEffective,
    superEffectiveModifier: context.superEffectiveModifier,
    isNP: context.isNP,
    isBusterChain: context.isBusterChain,
    isMightyChain: context.isMightyChain,
    ...(context.ignoreDefense === undefined ? {} : { ignoreDefense: context.ignoreDefense }),
  });
  const damage = defense.blocked || context.suppressDamage ? 0 : calculateHitDamage(damageInput);
  const isOverkill = damage > defenderHp;
  const hpAfterDamage = defenderHp - damage;

  const npGainInput = resolveAttackingNpGainInput(attacker, defender, constants, {
    card: context.card,
    chainLeadCardType: context.chainLeadCardType,
    offensiveNPRate: context.offensiveNPRate,
    enemyServerMod: context.npEnemyServerMod,
    isCrit: context.isCrit,
    isOverkill,
    isMightyChain: context.isMightyChain,
    isNP: context.isNP,
  });
  const npGain = calculateAttackingNpGain(npGainInput);

  const starDropInput = resolveStarDropInput(attacker, defender, constants, {
    card: context.card,
    chainLeadCardType: context.chainLeadCardType,
    baseStarRate: context.baseStarRate,
    serverRate: context.starEnemyServerMod,
    isCrit: context.isCrit,
    isOverkill,
    isMightyChain: context.isMightyChain,
    isNP: context.isNP,
  });
  const starDropChance = calculateStarDropChance(starDropInput);

  const guts = resolveGuts(hpAfterDamage, defenderMaxHp, defender.activeBuffs, defenderContext);
  const defenderHpFinal = guts.triggered ? guts.hpAfter : Math.max(hpAfterDamage, 0);
  const defeated = hpAfterDamage <= 0 && !guts.triggered;

  return { defense, damage, npGain, starDropChance, isOverkill, hpAfterDamage, guts, defenderHpFinal, defeated };
}
