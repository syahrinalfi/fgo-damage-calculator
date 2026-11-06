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
  /** Damage formula term 18 (`upDamageSpecial`, `limit: "upper"`) — fgo-docs `deeper/battle/damage.md`. */
  DAMAGE_SPECIAL: "damageSpecial",
  GIVEN_DAMAGE: "givenDamage",
  RECEIVE_DAMAGE: "receiveDamage",
  COMMAND_NP_ATK: "commandNpAtk",
  COMMAND_NP_DEF: "commandNpDef",
  DROP_NP: "dropNp",
  DROP_NP_DAMAGE: "dropNpDamage",
  COMMAND_STAR_ATK: "commandStarAtk",
  COMMAND_STAR_DEF: "commandStarDef",
  CRITICAL_POINT: "criticalPoint",
  /** Star-drop term 34, read from the defender (`up`/`downCriticalStarDamageTaken`) — replaced the old `-defSvt.criticalPoint` (fgo-docs `deeper/battle/critstars.md`). */
  CRITICAL_STAR_DAMAGE_TAKEN: "criticalStarDamageTaken",
  /**
   * The instant-death formula's 3 buff-action terms — resolved this session (community
   * source: firq.dev's "Instant Death Success Rate" formula, cross-referenced against live
   * `funcTargetType` data for each buff type, not project-owner live-tested): `finalChance =
   * hitRate * enemyDeathRate * (1 + grant - resist + nonresist)`.
   *
   * - `RESIST_INSTANT_DEATH` (`upResistInstantdeath` only) — **target-side**: every live
   *   example is `self`/`ptAll`-targeted (e.g. Taira no Kagekiyo's skill 2, firq.dev's own
   *   "Taira S2" example) — an ally buffing their *own* resistance.
   * - `NONRESIST_INSTANT_DEATH` (`upNonresistInstantdeath` only) — **also target-side**,
   *   despite the "ignore resistance" reading its name might suggest: every live example is
   *   `enemy`/`enemyAll`-targeted (e.g. Void Shiki's skill 1, firq.dev's own "Void Shiki S1"
   *   example) — a debuff cast *onto* the enemy lowering their effective resistance. Both
   *   this and `RESIST_INSTANT_DEATH` are resolved against the *same* target's `activeBuffs`
   *   (opposite signs in the formula above), not split across attacker/defender contexts.
   * - `GRANT_INSTANT_DEATH` (`upGrantInstantdeath`/`downGrantInstantdeath`) —
   *   **attacker-side**: every live example is `self`-targeted (e.g. Nitocris' skill 1,
   *   firq.dev's own "Nitocris S1" example) — a servant buffing their *own* success rate.
   */
  RESIST_INSTANT_DEATH: "resistInstantdeath",
  NONRESIST_INSTANT_DEATH: "nonresistInstantdeath",
  GRANT_INSTANT_DEATH: "grantInstantdeath",
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
