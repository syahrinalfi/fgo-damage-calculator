import type { Skill } from "@atlasacademy/api-connector";
import type { Action } from "./action.js";
import type { BattleState } from "./battleState.js";
import { resolveSkillEffects } from "./funcInterpreter.js";
import type { SkillEffect } from "./skillEffect.js";

/** A fully-resolved skill activation, as `../optimizer/skillUsageCandidates.js`'s own `SkillActivation` alias (structurally identical — this project's search axes only ever consume the plain `Action` shape, so both modules declare it independently rather than one importing across the battle/optimizer layer boundary). */
export type SkillActivation = Extract<Action, { readonly type: "useSkill" | "useMysticCodeSkill" }>;

/** One servant skill slot's raw data this resolver needs — the `NiceSkill` fields `resolveSkillEffects` (`./funcInterpreter.js`) and cooldown lookup actually read, plus the account's own invested level for that slot. */
export interface SkillSlotSource {
  readonly skill: Pick<Skill.Skill, "functions" | "coolDown">;
  readonly level: number;
}

/** One fielded servant's 3 skill slots' raw data — the caller's own account/roster lookup, keyed by `servantId` so this resolver can match it against `BattleState.servants`. */
export interface ServantSkillSource {
  readonly servantId: number;
  readonly skills: readonly [SkillSlotSource, SkillSlotSource, SkillSlotSource];
}

export interface ResolveSkillActivationOptionsConfig {
  /** Picks the `targetServantId` a `ptOne`-targeted effect needs when the caller doesn't want the default. Defaults to the acting servant itself (`(id) => id`) — a defensible, documented default ("this ally chooses to cast the skill on themselves"), not a guess: many `ptOne` skills genuinely are self-targeted in practice (e.g. a self buff typed `ptOne` rather than `self` for schema reasons), and a caller who wants a different target for a specific skill can always hand-build that one `SkillActivation` directly instead of going through this resolver. */
  readonly defaultTargetServantId?: (actingServantId: number) => number;
}

function needsUnresolvableEnemyTarget(effect: SkillEffect): boolean {
  return effect.kind === "removeBuff" && (effect.targetType === "enemyOne" || effect.targetType === "enemyAll");
}

function needsAllyTarget(effect: SkillEffect): boolean {
  return "targetType" in effect && effect.targetType === "ptOne";
}

/**
 * Auto-resolves research/09 §4's "skill-usage plan per turn" axis input (`optimizeQuest`'s
 * optional `resolveSkillOptions`) from raw account/skill data — closing (for the common case)
 * the "already-resolved input, caller supplies it" gap every skill-axis doc comment in this
 * project has flagged since `enumerateSkillUsageSubsets` was built. For each fielded (front-
 * line) servant in `skillSources` with a matching `BattleState.servants` entry, checks all 3
 * skill slots: a slot whose `ServantInstance.skillCooldowns` entry isn't `0` yet is skipped
 * (not off cooldown), and `resolveSkillEffects` (`./funcInterpreter.js`) resolves the rest into
 * `SkillEffect[]`.
 *
 * **Skipped, not offered, rather than partially represented**: any skill whose
 * `resolveSkillEffects` call reports `unmodeled.length > 0` (this project's general skill/NP
 * function-array interpreter still only covers a subset of `FuncType`s, research/09 §7) — an
 * automatic search offering a skill whose real effect isn't fully captured would silently
 * misrepresent that line's actual in-game outcome, worse than simply not suggesting it; a
 * caller who wants a partially-modeled skill searched anyway can hand-build that
 * `SkillActivation` directly, bypassing this resolver. Also skipped: any skill containing a
 * `removeBuff` effect whose `targetType` is enemy-side (`enemyOne`/`enemyAll`) — this resolver
 * has no target enemy in scope to pick automatically (unlike `resolveCardHitContext`, which
 * always receives one explicit `targetEnemy`), so an enemy-targeted dispel skill needs the same
 * manual-construction fallback. Every other targeting shape this project models
 * (`SkillTargetType`'s `self`/`ptOne`/`ptAll`, `GainStarEffect`/`LossStarEffect`'s no-target-at-
 * all Master-wide resource) is fully auto-resolvable, `ptOne` via `defaultTargetServantId`.
 */
export function resolveSkillActivationOptions(
  state: BattleState,
  skillSources: readonly ServantSkillSource[],
  config: ResolveSkillActivationOptionsConfig = {},
): readonly SkillActivation[] {
  const defaultTarget = config.defaultTargetServantId ?? ((servantId: number) => servantId);
  const results: SkillActivation[] = [];
  for (const source of skillSources) {
    const servant = state.servants.find((s) => s.servantId === source.servantId);
    if (servant === undefined || !servant.isFrontLine) continue;

    source.skills.forEach((slotSource, index) => {
      if (servant.skillCooldowns[index] !== 0) return;
      const { effects, unmodeled } = resolveSkillEffects(slotSource.skill, slotSource.level);
      if (unmodeled.length > 0 || effects.length === 0) return;
      if (effects.some(needsUnresolvableEnemyTarget)) return;
      const cooldownTurns = slotSource.skill.coolDown[slotSource.level - 1];
      if (cooldownTurns === undefined) return;

      const skillSlot = (index + 1) as 1 | 2 | 3;
      results.push(
        effects.some(needsAllyTarget)
          ? { type: "useSkill", servantId: source.servantId, skillSlot, effects, cooldownTurns, targetServantId: defaultTarget(source.servantId) }
          : { type: "useSkill", servantId: source.servantId, skillSlot, effects, cooldownTurns },
      );
    });
  }
  return results;
}
