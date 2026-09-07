import type { Buff } from "@atlasacademy/api-connector";

/**
 * Live string keys of `NiceBuffList.ActionList.json` (the `BuffConstantMap` fetched by
 * `GameDataClient.buffConstant()`) that the damage/NP-gain/star-drop formula inputs are
 * built from. Every key below was confirmed present in a live `JP` fetch this session.
 *
 * **`SELF_DAMAGE` is deliberately a raw string literal, not `Buff.BuffAction.DAMAGE_DEF`.**
 * The `@atlasacademy/api-connector` package's `BuffAction` enum declares
 * `DAMAGE_DEF = "selfdamage"`, but the live export has no `"selfdamage"` key at all — the
 * actual data (`plusTypes: ["upSelfdamage"]`, `minusTypes: ["downSelfdamage"]`) lives under
 * the key `"damageDef"`. Indexing the map with the enum member for this one action would
 * silently look up a key that doesn't exist and resolve to `undefined` — a real, confirmed
 * discrepancy between the connector's declared enum and the live data, not a typo here.
 */
export const BUFF_ACTION_KEYS = {
  ATK: "atk",
  DEFENCE: "defence",
  COMMAND_ATK: "commandAtk",
  COMMAND_DEF: "commandDef",
  SPECIAL_DEFENCE: "specialdefence",
  DAMAGE: "damage",
  DAMAGE_INDIVIDUALITY: "damageIndividuality",
  DAMAGE_INDIVIDUALITY_ACTIVEONLY: "damageIndividualityActiveonly",
  SELF_DAMAGE: "damageDef",
  CRITICAL_DAMAGE: "criticalDamage",
  NP_DAMAGE: "npdamage",
  GIVEN_DAMAGE: "givenDamage",
  RECEIVE_DAMAGE: "receiveDamage",
  COMMAND_NP_ATK: "commandNpAtk",
  COMMAND_NP_DEF: "commandNpDef",
  DROP_NP: "dropNp",
  DROP_NP_DAMAGE: "dropNpDamage",
  COMMAND_STAR_ATK: "commandStarAtk",
  COMMAND_STAR_DEF: "commandStarDef",
  CRITICAL_POINT: "criticalPoint",
} as const;

/**
 * Looks up one action's `BuffConstant` by its live string key (see `BUFF_ACTION_KEYS`
 * above). Typed as a plain string rather than `Buff.BuffAction` because at least one of
 * the keys this module needs (`"damageDef"`) isn't a value the connector's `BuffAction`
 * enum actually contains.
 */
export function getBuffConstant(
  map: Buff.BuffConstantMap,
  key: (typeof BUFF_ACTION_KEYS)[keyof typeof BUFF_ACTION_KEYS],
): Buff.BuffConstant | undefined {
  return (map as Record<string, Buff.BuffConstant | undefined>)[key];
}
