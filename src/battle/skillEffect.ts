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

/**
 * One already-resolved NP-gauge drain a `useSkill`/`useMysticCodeSkill` `Action` applies —
 * models the API's `lossNp` `FuncType` (research/09 §7 follow-up pass: 50 live instances
 * across playable servants' `skills[]`). `rawAmount` is a raw gauge-unit subtraction, the
 * exact mirror of `GainNpEffect.rawAmount` (`FULL_TD_POINT` convention, e.g. `10000` for
 * -100%) — subtracted from the target's `currentNpGauge`, floored at `0` rather than
 * `gainNp`'s `NP_GAUGE_CAP_BY_LEVEL` ceiling.
 *
 * **Ally-only, unlike the live data's own distribution — confirmed correct by live testing,
 * 2026-09-08.** The live frequency pull found `lossNp` is actually *majority enemy-targeted*
 * (37 of 50 live instances use `enemy`/`enemyAll`) with only 13 self/`ptOne` instances. The
 * project owner tested both sides in-game and both resolve the same way `hastenNpturn` did
 * (research/09 §7) — the *other* paired `FuncType` on the same skill turns out to be the
 * real mechanism, and this one (or its counterpart) is redundant:
 *
 * - **Self/`ptOne`-targeted `lossNp` is the real effect; the `delayNpturn` it's always
 *   paired with is a no-op.** Ryougi Shiki's "陰陽魚 A" skill 3 (`self`, `lossNp: 1000` +
 *   `delayNpturn: 1`) measured exactly -10% NP gauge — fully explained by `lossNp`'s own
 *   `1000/FULL_TD_POINT` reading alone, this effect's existing formula, no extra
 *   contribution from `delayNpturn`. Elizabeth Bathory (Brave)'s "真紅の勇者伝説・劇場版
 *   EX" skill 3 (`self`, `lossNp: 5000` + `delayNpturn: 2`) measured exactly -50%, same
 *   story. Both a flat, fixed-point subtraction (confirmed explicitly by the project owner:
 *   *not* a percentage of the servant's current gauge) — exactly this effect's existing
 *   `Math.max(currentNpGauge - rawAmount, 0)` behavior. **No code change was needed**: this
 *   effect already modeled the real mechanism correctly; see `DelayNpTurnEffect` below for
 *   the now-confirmed no-op half.
 * - **Enemy-targeted `lossNp` is the no-op; `DelayNpTurnEffect` is the real effect.** Tamamo
 *   Cat's "呪術 E" skill (`enemy`, `delayNpturn: 1` + `lossNp: 2000`) and Waver/Zhuge
 *   Liang's NP (`enemyAll`, same pairing) both measured the enemy NP bar dropping by exactly
 *   1 pip — fully explained by `delayNpturn` alone (already modeled, `DelayNpTurnEffect`),
 *   confirming the earlier "suspicious 2:1 ratio" guess was wrong to worry about: `lossNp`
 *   contributes nothing extra against an enemy. Deliberately still not modeled — there's
 *   nothing to model, not an open gap.
 */
export interface LossNpEffect {
  readonly kind: "lossNp";
  readonly rawAmount: number;
  readonly targetType: SkillTargetType;
}

/**
 * One already-resolved "safe" (non-lethal) self-damage a `useSkill`/`useMysticCodeSkill`
 * `Action` applies — models the API's `lossHpSafe` `FuncType` (research/09 §7 follow-up
 * pass: 29 live instances, `Value` constant across all 10 skill levels in every example
 * surveyed, e.g. `500` — unlike most other per-level `svals`, this one doesn't scale with
 * skill level at all). `amount` is a **flat HP amount**, not a share of `maxHp`: `500` →
 * subtract 500 HP from `currentHp` (live NA text, e.g. Chiron's "Eternal Dedication EX":
 * "Decrease your HP by 500"; percentage HP loss is the separate `lossHpPerSafe` `FuncType`,
 * not modeled here). "Safe" means exactly what
 * `lossHpSafe`'s name states and what every live example's `funcPopupText`/usage pattern
 * implies (a self-cost `Vals` for an otherwise-beneficial skill, never a lethal effect): the
 * target's `currentHp` is floored at `1`, never `0` or below — the one deliberate
 * distinction from `GainHpEffect`/`GainHpPercentEffect`'s own "not specially guarded"
 * standing (research/09 §7).
 *
 * Ally-only (`SkillTargetType`) — matches 27 of 29 live instances (`self`/`ptOne`/`ptAll`);
 * the 2 remaining live instances use `ptOther` ("every front-line ally except the caster"),
 * a `FuncTargetType` this project doesn't model at all (no existing `SkillTargetType`
 * variant covers it) — out of scope for the same reason `RemoveBuffEffect`'s doc comment
 * already flags unsupported `FuncTargetType`s elsewhere in this file.
 */
export interface LossHpSafeEffect {
  readonly kind: "lossHpSafe";
  readonly amount: number;
  readonly targetType: SkillTargetType;
}

/**
 * One already-resolved skill-cooldown reduction a `useSkill`/`useMysticCodeSkill` `Action`
 * applies — models the API's `shortenSkill` `FuncType` (research/09 §7 follow-up pass: 30
 * live instances). `rawTurns` is a flat turn count (e.g. `1`, `2` — small integers in every
 * live example, never a per-mille rate) subtracted from **every one of the target's 3
 * `skillCooldowns` entries** (`ServantInstance.skillCooldowns`, `./battleState.js`), each
 * floored at `0` — no live example carries a `functvals`/target-skill-slot specifier, so a
 * `shortenSkill` effect reduces a servant's whole kit at once rather than one chosen skill
 * slot (matching the well-known in-game "reduce your own skills' cooldowns by N" wording,
 * as opposed to a narrower "reduce this one skill's cooldown" effect this project has no
 * live example of).
 *
 * Ally-only (`SkillTargetType`) — matches 28 of 30 live instances (`self`/`ptOne`/`ptAll`);
 * the 2 remaining live instances use `ptOther`, out of scope for the same reason
 * `LossHpSafeEffect` above flags it.
 */
export interface ShortenSkillEffect {
  readonly kind: "shortenSkill";
  readonly rawTurns: number;
  readonly targetType: SkillTargetType;
}

/**
 * One already-resolved flat critical-star loss a `useSkill`/`useMysticCodeSkill` `Action`
 * applies — models the API's `lossStar` `FuncType` (research/09 §7 bulk long-tail pass: 7
 * live instances, all `funcTargetType: "self"`). The exact mirror of `GainStarEffect`:
 * critical stars are a Master-wide resource, so `rawAmount` is simply subtracted from
 * `BattleState.starsCarried` directly, floored at `0` (a negative star pool makes no sense),
 * with the same one-turn-delayed consumption lifecycle (research/04 §6.2/§6.3).
 */
export interface LossStarEffect {
  readonly kind: "lossStar";
  readonly rawAmount: number;
}

/**
 * One already-resolved flat-HP self-damage a `useSkill`/`useMysticCodeSkill`
 * `Action` applies — models the API's `lossHp` `FuncType` (research/09 §7 bulk long-tail
 * pass: 11 live NP instances, 10 of 11 `funcTargetType: "self"`). `amount` is a **flat HP
 * amount**, not a share of `maxHp`: Cleopatra's NP carries `Value: 1000` and its live NA
 * text reads "Reduce your HP by 1000" (percentage HP loss is the separate `lossHpPer`
 * `FuncType`, not modeled here). **Unlike `LossHpSafeEffect`, this is not "safe"** — floored at
 * `0`, not `1`, so this can bring a servant's `currentHp` to exactly `0` (a real, if rare,
 * "this NP can kill its own caster" mechanic, distinct from `lossHpSafe`'s guaranteed-
 * survival cost). The one live `enemy`-targeted example found carries `Value: 0` (a
 * template/no-op artifact, not a real "true damage vs. an enemy's max HP" mechanic) — ally-
 * only (`SkillTargetType`) accordingly, matching `lossHpSafe`'s and every other HP/NP-gauge
 * effect's targeting shape.
 */
export interface LossHpEffect {
  readonly kind: "lossHp";
  readonly amount: number;
  readonly targetType: SkillTargetType;
}

/**
 * One already-resolved instant-death roll a `castNp` `Action` applies — models the API's
 * `instantDeath` `FuncType` (research/09 §7 dedicated pass: 64 live NP instances, **every**
 * one enemy-targeted — 35 `enemy` (single) + 37 `enemyAll`, none self/ally-targeted; the
 * separate `forceInstantDeath` `FuncType`, 9 instances, includes a `self`-targeted example
 * — a self-sacrifice NP cost, a structurally different use case this effect does not model).
 *
 * **The percentage lives in the `Rate` field, not `Value`** (`instantDeath`'s `svals` carry
 * no `Value` at all — every live example is `{ Rate: N }` only), and — unlike every other
 * modeled `FuncType`'s `svals`/`svals2`/.../`svals5` quintet, which vary by *NP level* — this
 * one's 5 arrays vary by **Overcharge stage** while staying constant across NP level within
 * each array (e.g. one live NP: `Rate` 600/700/800/900/1000 at OC1–OC5, identical across all
 * 5 NP-level entries within each stage) — a live-confirmed instance of the death chance
 * scaling with Overcharge, matching the widely-known "instant death % increases with
 * Overcharge" in-game behavior. `deathRate` here is the single already-OC-resolved per-mille
 * value (the caller picks the right `svalsN` entry via `overchargeStage()`, `../engine/
 * overcharge.js`, the same convention this project already uses for NP damage's own OC-stage
 * selection) — `1000` = 100%, rolled once per targeted enemy against `randomFn()`.
 *
 * **The full formula is now folded in at apply time, not modeled in this interface**:
 * `turnLoop.ts`'s `applyInstantDeathEffect` computes `finalChance = deathRate/1000 *
 * (enemy.deathRate/1000) * (1 + grant - resist + nonresist)` — this field itself stays the
 * skill/NP's own raw `hitRate` term only. `enemy.deathRate` (`EnemyInstance.deathRate`,
 * `./battleState.js`, research/08 §2's `QuestEnemy.deathRate`) is the enemy's own base
 * susceptibility; `grant`/`resist`/`nonresist` are the 3 buff-action terms documented on
 * `BUFF_ACTION_KEYS` (`./buffActionKeys.ts`). Sourcing tier: community (firq.dev), not
 * project-owner live-tested — the one tier below this project's strongest findings, flagged
 * accordingly rather than silently treated as equally solid.
 *
 * **Guts is now wired in.** `applyInstantDeathEffect` routes a successful roll through
 * `resolveGuts` (`../buffs/guts.js`) the same way `resolveHit` already does for ordinary
 * lethal damage — cross-corroborated community sources (GameFAQs, GamePress Q&A) confirm
 * instant death triggers Guts normally, closing the earlier "bypasses `resolveGuts`
 * entirely" gap. `ForceInstantDeathEffect` below deliberately does NOT get the same
 * treatment — see its own doc comment for why.
 *
 * Enemy-only, matching the live data above — no `SkillTargetType`/ally-side variant exists.
 */
export interface InstantDeathEffect {
  readonly kind: "instantDeath";
  /** Per-mille death chance, already Overcharge-stage-resolved by the caller — `1000` = 100%. */
  readonly deathRate: number;
  readonly targetType: "enemyOne" | "enemyAll";
}

/**
 * One already-resolved unconditional self-kill a `castNp` `Action` applies — models the
 * API's `forceInstantDeath` `FuncType` (research/09 §7 dedicated pass: 9 live NP instances).
 * A structurally different mechanic from `InstantDeathEffect` above, not its "always
 * succeeds" variant: **every** live example targets the caster's own side (8 of 9 `self`, 1
 * `ptSelfAnotherFirst` — a paired/duo-NP targeting shape this project doesn't model, out of
 * scope for the same single-example reason `ShortenSkillEffect`/`LossHpSafeEffect` flag
 * `ptOther`), never an enemy — this reads as a self-sacrifice NP cost (some NPs kill their
 * own caster as part of the attack), not "guaranteed-kill the enemy." `svals.Rate` is a
 * constant `5000` across every live example — out of the normal 0–1000 per-mille probability
 * range and never varying by Overcharge stage or NP level the way `instantDeath`'s does,
 * consistent with the reading that `Rate` is a vestigial/unused field here: `force` means
 * unconditional, no roll needed, so this effect carries no numeric field at all (the same
 * "no live example suggests anything but a full, unconditional effect" reasoning
 * `RevivalEffect`'s doc comment already used for its own `Vals` shape).
 *
 * Sets `currentHp` straight to `0`, no `resolveGuts` check (../buffs/guts.js) — **unlike**
 * `InstantDeathEffect`, which now does route a successful roll through `resolveGuts`
 * (community-sourced: instant death from an attack triggers Guts normally). This effect is
 * deliberately NOT given the same treatment: no source addresses whether a self-sacrifice
 * NP *cost* (paying HP to cast, not being killed by an attack) should respect the caster's
 * own Guts, and `forceInstantDeath` is already documented above as a structurally different
 * mechanic from `instantDeath` — assuming the same Guts treatment applies would repeat this
 * project's own `hastenNpturn`/`delayNpturn` "don't assume mirror-symmetry between two
 * different `FuncType`s" lesson.
 *
 * Ally-only (`SkillTargetType`) — only `self` has a live example; `ptOne`/`ptAll` are typed
 * for consistency with every other ally-side effect but have no confirmed live usage here.
 */
export interface ForceInstantDeathEffect {
  readonly kind: "forceInstantDeath";
  readonly targetType: SkillTargetType;
}

/**
 * One already-resolved enemy NP-charge delay a `castNp` `Action` applies — models the API's
 * `delayNpturn` `FuncType` **against an enemy target only** (research/09 §7 / research/08
 * §5). Unlike `ServantInstance.currentNpGauge` (a continuous, formula-driven percentage), an
 * enemy's NP-charge state (`EnemyInstance.currentNpTurns`/`npTurnLimit`) is a discrete
 * integer countdown that advances `+1` per turn unconditionally — against that mechanism,
 * `delayNpturn`'s raw `Value` reads cleanly and directly as a turn count (every live example
 * surveyed is a small integer, e.g. `1`, matching `npTurnLimit`'s own scale, not a per-mille
 * rate needing a `/1000` conversion the way `GainNpEffect`'s `rawAmount` does): `rawTurns` is
 * subtracted straight from `currentNpTurns`, floored at `0`.
 *
 * **The self/ally-targeted minority of live `delayNpturn` usage needs no `SkillEffect` at
 * all — confirmed a no-op by live testing, 2026-09-08, resolved the same way `hastenNpturn`
 * was.** Every live example pairs self-targeted `delayNpturn` with a self-targeted `lossNp`
 * on the identical target; the project owner tested two independent skills (Ryougi Shiki's
 * "陰陽魚 A"/"A+", Elizabeth Bathory (Brave)'s "真紅の勇者伝説"/"劇場版 EX", 3 variants
 * total) and every measured NP-gauge change was fully explained by the paired `lossNp`'s own
 * `LossNpEffect` reading alone — see `LossNpEffect`'s doc comment above for the measurements.
 * `delayNpturn` against a servant contributes nothing measurable, exactly like `hastenNpturn`
 * against a servant's own gauge — a caller can just drop it from a skill's raw `functions[]`
 * the same way. `targetType` stays typed `"enemyOne" | "enemyAll"` only (not the broader
 * ally-capable `SkillTargetType`) since there's genuinely nothing to model on that side, not
 * an untested gap.
 *
 * The much more common companion `FuncType` in the same live skills, enemy-targeted
 * `lossNp` (37 of 50 live `lossNp` instances — research/09 §7), is **also now confirmed a
 * no-op** by the same testing pass (Tamamo Cat's "呪術 E", Waver/Zhuge Liang's NP) — see
 * `LossNpEffect`'s doc comment for the measurements. `delayNpturn` (this effect) is the real
 * mechanism on that side; `lossNp` contributes nothing extra.
 */
export interface DelayNpTurnEffect {
  readonly kind: "delayNpTurn";
  readonly rawTurns: number;
  readonly targetType: "enemyOne" | "enemyAll";
}

/** One already-resolved skill/NP effect a `useSkill`/`useMysticCodeSkill` `Action` can carry (research/09 §7's still-limited scope). */
export type SkillEffect =
  | BuffGrantEffect
  | RemoveBuffEffect
  | GainNpEffect
  | GainHpEffect
  | GainHpPercentEffect
  | RevivalEffect
  | GainStarEffect
  | LossNpEffect
  | LossHpSafeEffect
  | ShortenSkillEffect
  | LossStarEffect
  | LossHpEffect
  | ForceInstantDeathEffect
  | InstantDeathEffect
  | DelayNpTurnEffect;
