import type { Servant as ServantModule } from "@atlasacademy/api-connector";
import type { ServantBuild } from "../account/types.js";
import { npStrengtheningKey } from "./npVersionSelection.js";
import type { ServantCandidate } from "./questOptimizer.js";
import { skillStrengtheningKey } from "./rosterInputs.js";

/** Every NP and skill strengthening quest key present in this region's servant data. */
function allStrengtheningKeys(niceServant: ServantModule.Servant): string[] {
  const keys = new Set<string>();
  for (const np of niceServant.noblePhantasms ?? []) {
    if (np.condQuestId !== 0) keys.add(npStrengtheningKey(np));
  }
  for (const skill of niceServant.skills ?? []) {
    if (skill.condQuestId !== 0) keys.add(skillStrengtheningKey(skill));
  }
  return [...keys];
}

/**
 * The standard borrowed-support build from PRODUCT.md: natural maximum level (no Grails),
 * Ascension 4, NP1, Fou +1000 ATK/HP, skills 10/10/10, append skills disabled, and every
 * strengthening in the selected region's data unlocked. No Craft Essence: support CE effects
 * are deliberately ignored in the first milestone.
 */
export function buildBorrowedSupportCandidate(niceServant: ServantModule.Servant): ServantCandidate {
  const build: ServantBuild = {
    servantId: niceServant.id,
    level: niceServant.lvMax,
    ascension: 4,
    skillLevels: [10, 10, 10],
    appendSkillLevels: {},
    npLevel: 1,
    unlockedStrengthenings: allStrengtheningKeys(niceServant),
    fou: { atk: 1000, hp: 1000 },
    commandCodeIds: [],
  };
  return { niceServant, build };
}
