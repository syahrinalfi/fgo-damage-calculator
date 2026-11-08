import type { Action } from "../battle/action.js";
import { enumerateSkillUsageSubsets } from "./candidateGeneration.js";
import type { ActionSequenceCandidate } from "./turnSearch.js";

/**
 * A fully-resolved skill or Mystic Code skill activation a candidate turn plan may choose
 * to include — same "already-resolved input" convention `DerivedHitContext` templates use
 * elsewhere in this project (`effects`/`cooldownTurns`/targets are the caller's
 * responsibility to source, e.g. via `resolveSkillEffects`/`resolveNpEffects`,
 * `../battle/funcInterpreter.js`); this module only decides *whether* a given activation is
 * included in a candidate plan, never what it does.
 */
export type SkillActivation = Extract<Action, { readonly type: "useSkill" | "useMysticCodeSkill" }>;

function labelForSkillActivation(action: SkillActivation): string {
  const target = action.targetServantId === undefined ? "" : `>${action.targetServantId}`;
  return action.type === "useSkill" ? `useSkill:${action.servantId}.${action.skillSlot}${target}` : `useMysticCodeSkill:${action.slot}${target}`;
}

/**
 * Wires `enumerateSkillUsageSubsets` (research/09 §4's "skill-usage plan per turn" axis,
 * `./candidateGeneration.js`) into full-turn `ActionSequenceCandidate`s by crossing every
 * skill-usage subset with every already-built card-order candidate
 * (`./cardOrderCandidates.js`) — the same "given already-generated pieces, combine into
 * full candidates" role `buildCardOrderCandidates` itself plays for the card-order axis
 * alone. Each returned candidate plays its chosen skill subset first, then the card-order
 * candidate's own actions unchanged — skills are resolved before cards, matching how a
 * skill's buffs commonly need to already be active for the cards they're meant to boost
 * (research/09 §1's strict-sequence `Action` resolution; this ordering choice is this
 * function's own convention, not sourced beyond "buffs must land before what they buff").
 *
 * Grows as `2^n * m` for `n` skill options and `m` card-order candidates — a caller should
 * keep `skillOptions` narrowed to genuinely available (off-cooldown) activations, same
 * caveat `enumerateSkillUsageSubsets` itself documents.
 */
export function buildSkillAndCardOrderCandidates(
  skillOptions: readonly SkillActivation[],
  cardOrderCandidates: readonly ActionSequenceCandidate[],
): readonly ActionSequenceCandidate[] {
  const results: ActionSequenceCandidate[] = [];
  for (const setup of buildSkillSetups(skillOptions)) {
    for (const cardCandidate of cardOrderCandidates) {
      results.push({
        label: `${setup.label}|${cardCandidate.label}`,
        actions: [...setup.actions, ...cardCandidate.actions],
      });
    }
  }
  return results;
}

/** Every skill-usage subset as a setup (no card actions), labelled as `buildSkillAndCardOrderCandidates` labels its prefix. */
export function buildSkillSetups(skillOptions: readonly SkillActivation[]): readonly ActionSequenceCandidate[] {
  return enumerateSkillUsageSubsets(skillOptions).map((subset) => ({
    label: subset.length === 0 ? "noSkills" : subset.map(labelForSkillActivation).join("+"),
    actions: subset,
  }));
}
