import type { Skill } from "@atlasacademy/api-connector";
import { grantBuff } from "./buffLifecycle.js";
import type { EquippedCraftEssence, ServantInstance } from "./battleState.js";
import { resolveSkillEffects } from "./funcInterpreter.js";
import type { SkillEffect, SkillTargetType } from "./skillEffect.js";
import { NP_GAUGE_CAP_BY_LEVEL } from "./turnLoop.js";

export interface CraftEssencePassiveSource {
  readonly servantId: number;
  readonly isFrontLine: boolean;
  readonly equippedCe?: EquippedCraftEssence;
}

export interface CraftEssencePassiveResult {
  readonly servants: readonly ServantInstance[];
  readonly startingStars: number;
}

/** Selects one highest eligible LB tier for every independent CE skill slot. */
export function selectCraftEssencePassiveSkills(equippedCe: EquippedCraftEssence): readonly Skill.Skill[] {
  const limitBreakCount = equippedCe.limitBreakCount ?? 0;
  const selected = new Map<number, Skill.Skill>();
  for (const skill of equippedCe.data.skills ?? []) {
    if (skill.condLimitCount > limitBreakCount) continue;
    const key = skill.num ?? 0;
    const current = selected.get(key);
    if (
      current === undefined ||
      skill.condLimitCount > current.condLimitCount ||
      (skill.condLimitCount === current.condLimitCount && (skill.priority ?? 0) > (current.priority ?? 0))
    ) {
      selected.set(key, skill);
    }
  }
  return [...selected.values()].sort((a, b) => (a.num ?? 0) - (b.num ?? 0));
}

function targetIds(
  _servants: readonly ServantInstance[],
  source: CraftEssencePassiveSource,
  targetType: SkillTargetType,
): ReadonlySet<number> {
  switch (targetType) {
    case "self":
      return new Set([source.servantId]);
    case "ptAll":
    case "ptOne":
      // Field-dependent CE auras need add/remove handling across Order Change.
      // Ignoring them is conservative; applying them permanently could invent a clear.
      return new Set();
  }
}

function applyPassiveEffect(
  servants: readonly ServantInstance[],
  source: CraftEssencePassiveSource,
  effect: SkillEffect,
): CraftEssencePassiveResult {
  switch (effect.kind) {
    case "grantBuff": {
      const targets = targetIds(servants, source, effect.targetType);
      return {
        servants: servants.map((servant) => targets.has(servant.servantId)
          ? { ...servant, activeBuffs: grantBuff(servant.activeBuffs, effect.buff, effect.rawTurn, effect.rawCount) }
          : servant),
        startingStars: 0,
      };
    }
    case "gainNp": {
      const targets = targetIds(servants, source, effect.targetType);
      return {
        servants: servants.map((servant) => targets.has(servant.servantId)
          ? {
              ...servant,
              currentNpGauge: Math.min(
                servant.currentNpGauge + effect.rawAmount,
                NP_GAUGE_CAP_BY_LEVEL[servant.npLevel],
              ),
            }
          : servant),
        startingStars: 0,
      };
    }
    case "gainStar":
      // Entry star bombs trigger only for a holder that starts on the field. Re-triggering
      // them when a benched holder enters is a separate Order Change lifecycle concern.
      return { servants, startingStars: source.isFrontLine ? effect.rawAmount : 0 };
    default:
      return { servants, startingStars: 0 };
  }
}

/** Applies supported pre-battle CE effects in party order before turn 1 is dealt. */
export function applyCraftEssencePassives(
  servants: readonly ServantInstance[],
  sources: readonly CraftEssencePassiveSource[],
): CraftEssencePassiveResult {
  let currentServants = servants;
  let startingStars = 0;
  for (const source of sources) {
    if (source.equippedCe === undefined) continue;
    for (const skill of selectCraftEssencePassiveSkills(source.equippedCe)) {
      const { effects } = resolveSkillEffects(skill, 1);
      for (const effect of effects) {
        const applied = applyPassiveEffect(currentServants, source, effect);
        currentServants = applied.servants;
        startingStars += applied.startingStars;
      }
    }
  }
  return { servants: currentServants, startingStars };
}
