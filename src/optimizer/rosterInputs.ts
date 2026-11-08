import type { CraftEssence, Servant as ServantModule, Skill } from "@atlasacademy/api-connector";
import type { RosterProfile, SkillLevel } from "../account/types.js";
import type { EquippedCraftEssence } from "../battle/battleState.js";
import type { ServantSkillSource, SkillSlotSource } from "../battle/skillActivationResolver.js";
import type { ServantCandidate } from "./questOptimizer.js";

export interface RosterOptimizerInputs {
  readonly ownedServantCandidates: readonly ServantCandidate[];
  readonly skillSources: readonly ServantSkillSource[];
  readonly cePool: readonly EquippedCraftEssence[];
}

export function skillStrengtheningKey(skill: Skill.Skill): string {
  return `${skill.condQuestId}:${skill.condQuestPhase}`;
}

function isSkillUnlocked(skill: Skill.Skill, unlocked: ReadonlySet<string>): boolean {
  return skill.condQuestId === 0 || unlocked.has(skillStrengtheningKey(skill));
}

function strongerSkill(left: Skill.Skill, right: Skill.Skill): Skill.Skill {
  const leftStrength = left.strengthStatus ?? 0;
  const rightStrength = right.strengthStatus ?? 0;
  if (leftStrength !== rightStrength) return leftStrength > rightStrength ? left : right;
  const leftPriority = left.priority ?? 0;
  const rightPriority = right.priority ?? 0;
  if (leftPriority !== rightPriority) return leftPriority > rightPriority ? left : right;
  return left.id > right.id ? left : right;
}

export function skillSourceFor(
  niceServant: ServantModule.Servant,
  skillLevels: readonly [SkillLevel, SkillLevel, SkillLevel],
  unlockedStrengthenings: readonly string[],
): ServantSkillSource {
  const unlocked = new Set(unlockedStrengthenings);
  const bySlot = new Map<number, Skill.Skill>();
  for (const skill of niceServant.skills) {
    if (skill.num === undefined || skill.num < 1 || skill.num > 3 || !isSkillUnlocked(skill, unlocked)) continue;
    const current = bySlot.get(skill.num);
    bySlot.set(skill.num, current === undefined ? skill : strongerSkill(current, skill));
  }
  const slot = (num: 1 | 2 | 3): SkillSlotSource => {
    const skill = bySlot.get(num);
    if (skill === undefined) throw new RangeError(`Servant ${niceServant.id} has no unlocked skill data for slot ${num}`);
    return { skill, level: skillLevels[num - 1] as SkillLevel };
  };
  return { servantId: niceServant.id, skills: [slot(1), slot(2), slot(3)] };
}

/** Hydrates persisted account state with already-fetched Atlas records for optimizer use. */
export function buildRosterOptimizerInputs(
  profile: RosterProfile,
  niceServants: ReadonlyMap<number, ServantModule.Servant>,
  craftEssences: ReadonlyMap<number, CraftEssence.CraftEssence>,
): RosterOptimizerInputs {
  const owned = Object.values(profile.ownedServants).sort((a, b) => a.servantId - b.servantId);
  const ownedServantCandidates = owned.map((build): ServantCandidate => {
    const niceServant = niceServants.get(build.servantId);
    if (niceServant === undefined) throw new RangeError(`Missing Atlas data for owned servant ${build.servantId}`);
    return { niceServant, build: { ...build } };
  });
  const skillSources = ownedServantCandidates.map((candidate) => skillSourceFor(
    candidate.niceServant,
    candidate.build.skillLevels,
    candidate.build.unlockedStrengthenings ?? [],
  ));
  const cePool = profile.craftEssenceInventory.map((copy): EquippedCraftEssence => {
    const data = craftEssences.get(copy.craftEssenceId);
    if (data === undefined) throw new RangeError(`Missing Atlas data for owned CE ${copy.craftEssenceId}`);
    return {
      data,
      level: copy.level,
      inventoryId: copy.id,
      limitBreakCount: copy.limitBreakCount,
    };
  });
  return { ownedServantCandidates, skillSources, cePool };
}
