import type { ActiveBuffInstance } from "../buffs/types.js";

/**
 * Which ally/allies a `BuffGrantEffect` applies to, restricted to the 3 targeting shapes
 * this increment supports out of the API's full `FuncTargetType` enum (research/09 §7,
 * `@atlasacademy/api-connector`'s `Func.d.ts`): `self` (the acting servant, regardless of
 * front-line status — a servant can buff itself before being swapped in), `ptOne` (one
 * chosen front-line servant), and `ptAll` (every front-line servant — party-wide buffs
 * don't reach the bench, matching `ServantInstance`'s existing "only front-line servants
 * can act/be targeted" convention). Every other `FuncTargetType` (`ptAnother`, `ptRandom`,
 * etc.) is out of scope — a skill needing one of those targets simply can't be modeled by a
 * `BuffGrantEffect` yet. Ally-only: no live `addState` example this project has modeled
 * targets an enemy (a debuff would still be `addState`, just `funcTargetTeam: enemy` — out
 * of scope until a concrete case is worked through), unlike `RemoveBuffEffect` below, whose
 * one confirmed example (research/05 §5) is enemy-targeted.
 */
export type SkillTargetType = "self" | "ptOne" | "ptAll";

/**
 * One already-resolved buff grant a `useSkill`/`useMysticCodeSkill` `Action` applies —
 * the skill-level lookup (`NiceSkill.functions[].svals[level - 1]`, research/01 §6.3-6.4)
 * that would *produce* `buff`/`rawTurn`/`rawCount` from a skill's level and the caster's
 * NP level (for Overcharge-scaled skills) is the caller's responsibility, matching the
 * "already-resolved input" convention `HitResolutionContext`/`CommandSealEffect` already
 * use elsewhere in this file's siblings.
 *
 * Models the API's `addState`/`addStateShort` `FuncType` family (a plain buff grant, with
 * or without an on-screen buff icon). See `RemoveBuffEffect` below for the other modeled
 * family (`subState`, dispel); every other `FuncType` — `damage`, `gainNp`, `gainHp`, card
 * manipulation, NP-turn shortening, etc. — remains out of scope (research/09 §7: no general
 * skill/NP function-array interpreter exists yet).
 */
export interface BuffGrantEffect {
  readonly kind: "grantBuff";
  readonly buff: ActiveBuffInstance;
  /** Raw `Turn` `Vals` field (research/01 §6.3) — `-1` for unlimited, passed straight through to `grantBuff`. */
  readonly rawTurn: number;
  /** Raw `Count` `Vals` field (research/01 §6.4) — `-1` for unlimited, passed straight through to `grantBuff`. */
  readonly rawCount: number;
  readonly targetType: SkillTargetType;
}

/**
 * Which unit(s) a `RemoveBuffEffect` targets — a broader set than `SkillTargetType` since
 * this effect's one confirmed live example (research/05 §5: Taira-no-Kagekiyo's NP,
 * `subState`/`funcTargetType: "enemy"`) is enemy-side, unlike every modeled `BuffGrantEffect`
 * case so far. `enemyOne` resolves against `Action.targetNpcId`; `enemyAll` reaches every
 * enemy in `BattleState.enemies` (research/05 §5 gives no reason to think enemy-side dispel
 * is front-line-restricted the way ally targeting is — enemies don't have a bench concept
 * in this project's model, `src/quest/types.ts`).
 */
export type BuffRemovalTargetType = "self" | "ptOne" | "ptAll" | "enemyOne" | "enemyAll";

/**
 * One already-resolved buff removal (dispel) a `useSkill`/`useMysticCodeSkill` `Action`
 * applies — models the API's `subState` `FuncType` (research/05 §5): every buff on the
 * target(s) whose own classification traits (`ActiveBuffInstance.vals`, `../buffs/types.js`)
 * include `targetTrait` is removed outright, via `removeBuffsByTrait`
 * (`./buffLifecycle.js`). `releaseState` — a structurally separate removal `FuncType` with
 * zero live usages found (research/05 §5) — is not modeled; there is no live case to derive
 * its distinct behavior from.
 */
export interface RemoveBuffEffect {
  readonly kind: "removeBuff";
  /** The trait ID every removed buff's `vals` must contain (e.g. `buffPositiveEffect` to strip every buff). */
  readonly targetTrait: number;
  readonly targetType: BuffRemovalTargetType;
}

/**
 * One already-resolved NP-gauge charge a `useSkill`/`useMysticCodeSkill` `Action` applies —
 * models the API's `gainNp` `FuncType` (research/07 §2: MC "Spiritron Transfer", `ptOne`).
 * `rawAmount` is a raw gauge-unit addition (`FULL_TD_POINT` convention, e.g. `3000` for
 * +30%), not a set-to-value — added to the target's `currentNpGauge`, capped at that
 * servant's own `NP_GAUGE_CAP_BY_LEVEL` ceiling (`./turnLoop.js`), same cap `applyHit`'s
 * passive gauge gain already respects. This "raw amount added" reading follows the API's
 * general `DataVal.Value` convention already relied on elsewhere in this project (e.g. buff
 * magnitudes) rather than a session-specific primary-source confirmation for `gainNp`
 * itself — flagged as a documented, provisional reading, not a confirmed citation, same
 * standing as this project's other open-item defaults.
 *
 * Ally-only (`SkillTargetType`) — every `gainNp` example surveyed (research/07 §2) targets
 * the caster's own side.
 */
export interface GainNpEffect {
  readonly kind: "gainNp";
  readonly rawAmount: number;
  readonly targetType: SkillTargetType;
}

/**
 * One already-resolved flat heal a `useSkill`/`useMysticCodeSkill` `Action` applies — models
 * the API's `gainHp` `FuncType` (research/07 §2: MC "First Aid" `ptOne`, "Cure-All"
 * `ptAll`), distinct from the percentage-of-max-HP `gainHpPer` `FuncType` (`GainHpPercentEffect` below).
 * `rawAmount` is a flat HP addition, capped at the target's `maxHp` (no overheal modeled,
 * matching `useCommandSeal`'s `healHp` effect, `./action.js`) — same provisional-reading
 * standing as `GainNpEffect` above, not a session-specific primary-source confirmation.
 *
 * Applying this to an already-dead (`currentHp <= 0`) servant is **not specially guarded**
 * here, matching `useCommandSeal`'s `healHp` precedent — reviving a dead servant is a
 * distinct `FuncType` (`revival`) this project doesn't model at all yet, so if that
 * distinction matters for a specific skill, the caller is responsible for not issuing a
 * `gainHp` effect at a dead servant in the first place.
 *
 * Ally-only (`SkillTargetType`) — same targeting shapes as `GainNpEffect`.
 */
export interface GainHpEffect {
  readonly kind: "gainHp";
  readonly rawAmount: number;
  readonly targetType: SkillTargetType;
}

/**
 * One already-resolved percentage-of-`maxHp` heal a `useSkill`/`useMysticCodeSkill` `Action`
 * applies — models the API's `gainHpPer` `FuncType`, distinct from the flat-amount `gainHp`
 * `FuncType` (`GainHpEffect` above). `rawPercent` follows this project's already-established
 * per-mille rate convention (e.g. `CRITICAL_RATE_PER_STAR`/buff `baseValue`, research/04
 * §6.1/research/05 §2 — divide by 1000 to get the real rate): `3000` → 30% of `maxHp`,
 * rounded and added to `currentHp`, capped at `maxHp` (no overheal, same as `GainHpEffect`).
 * This project has no live-verified primary-source example of `gainHpPer`'s exact `Vals`
 * shape — this reading is a provisional extension of the same convention `GainNpEffect`/
 * `GainHpEffect`'s own doc comments already flag as unconfirmed-but-consistent, not a
 * session-specific citation.
 *
 * Same "not specially guarded against a dead target" and ally-only-`SkillTargetType`
 * standing as `GainHpEffect`.
 */
export interface GainHpPercentEffect {
  readonly kind: "gainHpPercent";
  /** Raw per-mille `Vals` field — `3000` = 30% of `maxHp`. */
  readonly rawPercent: number;
  readonly targetType: SkillTargetType;
}

/**
 * One already-resolved revival a `useSkill`/`useMysticCodeSkill` `Action` applies — models
 * the API's `revival` `FuncType`. Only affects a target already at `currentHp <= 0`; a
 * still-living target in `targetType`'s reach is left completely untouched (a revival effect
 * doesn't also heal the living, matching `useCommandSeal`'s `reviveParty` precedent,
 * `./action.js`, research/00 §6 confirmed by the project owner). A revived servant is set to
 * full `maxHp` and its own `NP_GAUGE_CAP_BY_LEVEL` ceiling (`./turnLoop.js`) — the same
 * "mentokin NP gauge juga" (maxes the gauge too) behavior `reviveParty` already confirms,
 * rather than a partial/percentage revive: this project has no live-verified example of
 * `revival`'s `Vals` shape suggesting anything other than a full restore, so — unlike
 * `GainHpPercentEffect` above, which extends an already-confirmed per-mille convention —
 * this effect deliberately carries no numeric field at all rather than guess at an
 * unconfirmed one.
 *
 * Ally-only (`SkillTargetType`) — no live `revival` example this project has modeled targets
 * an enemy.
 */
export interface RevivalEffect {
  readonly kind: "revival";
  readonly targetType: SkillTargetType;
}

/**
 * One already-resolved flat critical-star grant a `useSkill`/`useMysticCodeSkill` `Action`
 * applies — models the API's `gainStar` `FuncType` (research/09 §7 follow-up pass: a live
 * `NiceServant.json` pull, ranking every `FuncType` used by a playable servant's `skills[]`
 * by frequency, found 203 live `gainStar` instances — e.g. Altria Pendragon's "Intuition"
 * skill, `svals: [{ Rate: 1000, Value: 5..15 }]` across its 10 skill levels — `Rate: 1000`
 * is a constant "always applies" marker on every instance surveyed, not a variable
 * probability; `Value` is the raw star count for that skill level).
 *
 * Unlike `GainNpEffect`/`GainHpEffect`, this effect carries no `targetType`/target at all:
 * critical stars are a **Master-wide** resource (`BattleState.starsCarried`, a single
 * number, not per-servant), so there's no ally to target — `rawAmount` is simply added to
 * `starsCarried` directly, exactly like `CHAINBONUS_QUICK_STARS`'s existing chain-completion
 * grant (`src/battle/turnLoop.ts`'s `applyChainCompletionBonus`). This also means a
 * `gainStar` effect used mid-turn doesn't affect the *current* turn's already-dealt hand —
 * it's consumed by `resolveEndTurn`'s `allocateCritStars` call for the *next* turn's hand,
 * the same one-turn-delayed lifecycle every other `starsCarried` contributor already has
 * (research/04 §6.2/§6.3).
 */
export interface GainStarEffect {
  readonly kind: "gainStar";
  readonly rawAmount: number;
}

/** One already-resolved skill/NP effect a `useSkill`/`useMysticCodeSkill` `Action` can carry (research/09 §7's still-limited scope). */
export type SkillEffect = BuffGrantEffect | RemoveBuffEffect | GainNpEffect | GainHpEffect | GainHpPercentEffect | RevivalEffect | GainStarEffect;
