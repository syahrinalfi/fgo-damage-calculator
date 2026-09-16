import { Card, Func, type NoblePhantasm } from "@atlasacademy/api-connector";
import type { BattleState, EnemyInstance, ServantInstance } from "../battle/battleState.js";
import { npFunctionSvalsAt, resolveNpEffects } from "../battle/funcInterpreter.js";
import type { SkillEffect } from "../battle/skillEffect.js";
import { FULL_TD_POINT } from "../engine/constants.js";
import { overchargeStage, type OverchargeStage } from "../engine/overcharge.js";
import type { NpAttackOption, ResolvedNpAttack } from "./cardOrderCandidates.js";

const IGNORED_NP_FUNCTIONS = new Set<Func.FuncType>([Func.FuncType.NONE, Func.FuncType.HASTEN_NPTURN, Func.FuncType.DISPLAY_BUFFSTRING]);
const NP_COLORS = new Set<Card>([Card.BUSTER, Card.ARTS, Card.QUICK]);
const DIRECT_DAMAGE_NP_FUNCTIONS = new Set<Func.FuncType>([
  Func.FuncType.DAMAGE_NP,
  Func.FuncType.DAMAGE_NP_PIERCE,
  Func.FuncType.DAMAGE_NP_INDIVIDUAL,
  Func.FuncType.DAMAGE_NP_HPRATIO_LOW,
]);

function selectedEffects(func: Func.Func, npLevel: ServantInstance["npLevel"], stage: OverchargeStage): readonly SkillEffect[] | undefined {
  if (IGNORED_NP_FUNCTIONS.has(func.funcType)) return [];
  const result = resolveNpEffects({ functions: [func] }, npLevel, stage);
  return result.unmodeled.length === 0 ? result.effects : undefined;
}

function targetEnemies(state: BattleState, targetEnemy: EnemyInstance, targetType: Func.FuncTargetType): readonly EnemyInstance[] | undefined {
  if (targetType === Func.FuncTargetType.ENEMY) return [targetEnemy];
  if (targetType === Func.FuncTargetType.ENEMY_ALL) return state.enemies.filter((candidate) => candidate.currentHp > 0);
  return undefined;
}

function buildResolvedAttack(
  state: BattleState,
  servant: ServantInstance,
  np: NoblePhantasm.NoblePhantasm,
  targetEnemy: EnemyInstance,
  stage: OverchargeStage,
  randomModifier: number,
): ResolvedNpAttack | undefined {
  const damageEntries = np.functions.map((func, index) => ({ func, index })).filter(({ func }) => DIRECT_DAMAGE_NP_FUNCTIONS.has(func.funcType));
  if (damageEntries.length > 1) return undefined;
  const damageEntry = damageEntries[0];
  const isSupport = np.effectFlags.includes("support" as NoblePhantasm.NoblePhantasmEffectFlag);
  if (damageEntry === undefined && !isSupport) return undefined;

  const effectsBeforeDamage: SkillEffect[] = [];
  const effectsAfterDamage: SkillEffect[] = [];
  for (const [index, func] of np.functions.entries()) {
    if (index === damageEntry?.index) continue;
    if (func.funcType.startsWith("damageNp")) return undefined;
    const effects = selectedEffects(func, servant.npLevel, stage);
    if (effects === undefined) return undefined;
    (damageEntry === undefined || index < damageEntry.index ? effectsBeforeDamage : effectsAfterDamage).push(...effects);
  }

  const cardType = np.card as Card;
  if (!NP_COLORS.has(cardType)) return undefined;
  const offensiveNPRate = np.npGain.np[servant.npLevel - 1];
  if (offensiveNPRate === undefined) return undefined;

  if (damageEntry === undefined) {
    const context = {
      card: { type: cardType, position: 1 },
      npDamageMultiplier: 0,
      randomModifier,
      isSuperEffective: false,
      superEffectiveModifier: 1,
      isNP: true,
      offensiveNPRate,
      npEnemyServerMod: targetEnemy.serverMod.tdRate / 1000,
      baseStarRate: servant.starGen,
      starEnemyServerMod: targetEnemy.serverMod.starRate / 1000,
    } as const;
    return {
      context,
      hitContexts: [],
      ...(effectsBeforeDamage.length === 0 ? {} : { effectsBeforeDamage }),
      ...(effectsAfterDamage.length === 0 ? {} : { effects: effectsAfterDamage }),
    };
  }

  const damageValues = npFunctionSvalsAt(damageEntry.func, servant.npLevel, stage);
  const rawDamage = damageValues?.Value;
  if (rawDamage === undefined) return undefined;
  const isIndividualDamage = damageEntry.func.funcType === Func.FuncType.DAMAGE_NP_INDIVIDUAL;
  const isLowHpDamage = damageEntry.func.funcType === Func.FuncType.DAMAGE_NP_HPRATIO_LOW;
  const individualTarget = damageValues?.Target;
  const individualCorrection = damageValues?.Correction;
  if (isIndividualDamage && (individualTarget === undefined || individualCorrection === undefined)) return undefined;
  const lowHpMaximumBonus = damageValues?.Target;
  if (isLowHpDamage && lowHpMaximumBonus === undefined) return undefined;
  const hpRatio = servant.maxHp <= 0 ? 0 : Math.min(1, Math.max(0, servant.currentHp / servant.maxHp));
  const effectiveRawDamage = isLowHpDamage ? rawDamage + (lowHpMaximumBonus as number) * (1 - hpRatio) : rawDamage;
  const targets = targetEnemies(state, targetEnemy, damageEntry.func.funcTargetType);
  const distributionTotal = np.npDistribution.reduce((sum, rate) => sum + rate, 0);
  if (
    targets === undefined ||
    targets.length === 0 ||
    np.npDistribution.length === 0 ||
    np.npDistribution.some((rate) => rate <= 0) ||
    Math.abs(distributionTotal - 100) > 0.0001
  ) {
    return undefined;
  }
  const hitRates = np.npDistribution.map((rate) => rate / 100);
  const ignoreDefense = damageEntry.func.funcType === Func.FuncType.DAMAGE_NP_PIERCE;
  const contextsFor = (enemy: EnemyInstance) =>
    hitRates.map((hitRate) => ({
      card: { type: cardType, position: 1 },
      npDamageMultiplier: (effectiveRawDamage / 1000) * hitRate,
      randomModifier,
      isSuperEffective: isIndividualDamage && enemy.traits.has(individualTarget as number),
      superEffectiveModifier: isIndividualDamage ? (individualCorrection as number) / 1000 : 1,
      isNP: true,
      offensiveNPRate,
      npEnemyServerMod: enemy.serverMod.tdRate / 1000,
      baseStarRate: servant.starGen,
      starEnemyServerMod: enemy.serverMod.starRate / 1000,
      ...(ignoreDefense ? { ignoreDefense: true } : {}),
    }));
  const targetHitContexts = targets.map((enemy) => ({ targetNpcId: enemy.npcId, hitContexts: contextsFor(enemy) }));
  const primaryContexts = targetHitContexts.find((target) => target.targetNpcId === targetEnemy.npcId)?.hitContexts;
  if (primaryContexts === undefined || primaryContexts.length === 0) return undefined;
  return {
    context: primaryContexts[0]!,
    hitContexts: primaryContexts,
    targetHitContexts,
    ...(effectsBeforeDamage.length === 0 ? {} : { effectsBeforeDamage }),
    ...(effectsAfterDamage.length === 0 ? {} : { effects: effectsAfterDamage }),
  };
}

/**
 * Converts one explicitly-selected NiceNp version into a mixed attack-chain option.
 * Supported direct damage families are ordinary damage, Ignore Defense, trait special
 * damage, and low-HP scaling. Other/partially modeled variants return `undefined` rather
 * than silently under-simulating.
 */
export function resolveNpAttackOption(
  state: BattleState,
  servantId: number,
  np: NoblePhantasm.NoblePhantasm,
  targetNpcId: number,
  randomFn: () => number = Math.random,
): NpAttackOption | undefined {
  const servant = state.servants.find((candidate) => candidate.servantId === servantId && candidate.isFrontLine);
  const targetEnemy = state.enemies.find((candidate) => candidate.npcId === targetNpcId && candidate.currentHp > 0);
  if (servant === undefined || targetEnemy === undefined) return undefined;
  const randomModifier = 0.9 + randomFn() * 0.2;
  const baseGaugePercent = (servant.currentNpGauge / FULL_TD_POINT) * 100;
  const resolvedByBonus = [0, 1, 2].map((bonus) => buildResolvedAttack(state, servant, np, targetEnemy, overchargeStage(baseGaugePercent + bonus * 100), randomModifier));
  if (resolvedByBonus.some((resolved) => resolved === undefined)) return undefined;
  const base = resolvedByBonus[0] as ResolvedNpAttack;
  const targetNpcIds = base.targetHitContexts?.map((target) => target.targetNpcId) ?? [targetNpcId];
  return {
    servantId,
    cardType: np.card as Card,
    targetNpcIds,
    label: `NP:${np.name}`,
    ...base,
    resolveForNpChainBonus: (bonusStages) => resolvedByBonus[Math.min(2, Math.max(0, bonusStages))] as ResolvedNpAttack,
  };
}
