import type { Func, Servant as ServantModule, Skill } from "@atlasacademy/api-connector";

/**
 * Buff types that run another skill after the holder's normal attack: `svals.Value` names that
 * skill and `svals.Value2` its level (Koyanskaya of Light's "Massacring Technique" grants
 * `commandattackAfterFunctionMainOnly` → skill 966533, a self `gainNp`, "Increase NP Gauge for
 * yourself during normal Buster Card attacks"). Atlas does not embed the triggered skill.
 */
export const AFTER_ATTACK_TRIGGER_BUFF_TYPES: ReadonlySet<string> = new Set([
  "commandattackAfterFunction",
  "commandattackAfterFunctionMainOnly",
]);

/** A function whose trigger buff's skills were attached by `attachTriggerSkills`, keyed by skill id. */
export type FuncWithTriggerSkills = Func.Func & { triggerSkills?: Readonly<Record<number, Skill.Skill>> };

/** Fetches every skill a servant's after-attack trigger buffs name and attaches them to those functions. */
export async function attachTriggerSkills(servant: ServantModule.Servant, loadSkill: (id: number) => Promise<Skill.Skill>): Promise<void> {
  const functions = [
    ...(servant.skills ?? []),
    ...(servant.classPassive ?? []),
    ...(servant.appendPassive ?? []).map((append) => append.skill),
    ...(servant.noblePhantasms ?? []),
  ].flatMap((owner) => owner.functions);
  const triggerFunctions = functions.filter((func) => func.buffs.some((buff) => AFTER_ATTACK_TRIGGER_BUFF_TYPES.has(buff.type)));
  const ids = [...new Set(triggerFunctions.flatMap((func) => (func.svals ?? []).map((vals) => vals.Value)).filter((id): id is number => id !== undefined))];
  if (ids.length === 0) return;
  const skills: Record<number, Skill.Skill> = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await loadSkill(id)] as const)));
  for (const func of triggerFunctions) (func as FuncWithTriggerSkills).triggerSkills = skills;
}
