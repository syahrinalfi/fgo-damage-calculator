import type { Servant as ServantModule, Skill } from "@atlasacademy/api-connector";
import type { AppendSkillSlot, ServantBuild } from "../account/types.js";
import { grantBuff } from "./buffLifecycle.js";
import type { EquippedCraftEssence, ServantInstance } from "./battleState.js";
import { resolveSkillEffects } from "./funcInterpreter.js";
import type { SkillEffect, SkillTargetType } from "./skillEffect.js";
import { NP_GAUGE_CAP_BY_LEVEL } from "./turnLoop.js";

/** One always-on passive skill and the level its `svals` are read at. */
export interface PassiveSkillAtLevel {
  readonly skill: Pick<Skill.Skill, "functions">;
  readonly level: number;
}

export interface CraftEssencePassiveSource {
  readonly servantId: number;
  readonly isFrontLine: boolean;
  readonly equippedCe?: EquippedCraftEssence;
  /** The servant's own always-on passives (`servantPassiveSkills`), applied before its CE. */
  readonly servantPassives?: readonly PassiveSkillAtLevel[];
}

/** Atlas numbers a servant's append skills from 100, in the in-game slot order. */
const FIRST_APPEND_SKILL_NUM = 100;

/**
 * A servant's own always-on passives (research/00 "Passive/innate skills"): every
 * `classPassive` entry, which mixes class skills (Magic Resistance) with the servant's own
 * innate ones, plus each append skill the build has unlocked, at its level. `extraPassive` is
 * left out: it holds event-only bonuses, not part of a general calculation.
 */
export function servantPassiveSkills(niceServant: ServantModule.Servant, build: Pick<ServantBuild, "appendSkillLevels">): readonly PassiveSkillAtLevel[] {
  const classPassives = (niceServant.classPassive ?? []).map((skill) => ({ skill, level: 1 }));
  const appends = (niceServant.appendPassive ?? []).flatMap((append) => {
    const level = build.appendSkillLevels[(append.num - FIRST_APPEND_SKILL_NUM + 1) as AppendSkillSlot];
    return level === undefined ? [] : [{ skill: append.skill, level }];
  });
  return [...classPassives, ...appends];
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

/**
 * Applies supported pre-battle passive effects in party order before turn 1 is dealt: each
 * member's own passives, then its CE's. Both use the same self-only rules above.
 */
export function applyCraftEssencePassives(
  servants: readonly ServantInstance[],
  sources: readonly CraftEssencePassiveSource[],
): CraftEssencePassiveResult {
  let currentServants = servants;
  let startingStars = 0;
  for (const source of sources) {
    const ceSkills = source.equippedCe === undefined ? [] : selectCraftEssencePassiveSkills(source.equippedCe).map((skill) => ({ skill, level: 1 }));
    for (const { skill, level } of [...(source.servantPassives ?? []), ...ceSkills]) {
      const { effects } = resolveSkillEffects(skill, level);
      for (const effect of effects) {
        const applied = applyPassiveEffect(currentServants, source, effect);
        currentServants = applied.servants;
        startingStars += applied.startingStars;
      }
    }
  }
  return { servants: currentServants, startingStars };
}
