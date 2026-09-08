import { Func, type Buff, type DataVal, type Skill } from "@atlasacademy/api-connector";
import type { ActiveBuffInstance } from "../buffs/types.js";
import type {
  BuffGrantEffect,
  BuffRemovalTargetType,
  DelayNpTurnEffect,
  GainHpEffect,
  GainHpPercentEffect,
  GainNpEffect,
  GainStarEffect,
  LossHpPercentEffect,
  LossHpSafeEffect,
  LossNpEffect,
  LossStarEffect,
  RemoveBuffEffect,
  RevivalEffect,
  ShortenSkillEffect,
  SkillEffect,
  SkillTargetType,
} from "./skillEffect.js";

/**
 * The general skill `FuncType`-array interpreter research/09 §7/§4 flagged as "still not
 * built" — reads a `NiceSkill.functions[]` (`@atlasacademy/api-connector`'s `Skill.Skill`)
 * at a specific skill level and produces the `SkillEffect[]` a `useSkill`/
 * `useMysticCodeSkill` `Action` needs, instead of requiring a caller to hand-construct each
 * one (every existing test/fixture in this project does that manually). This is the second
 * of the two blockers identified for the optimizer's candidate-generation layer (research/09
 * §4) — the first, `buildServantInstance`, resolves a servant's *stats*; this resolves a
 * servant's *skills* into playable `Action.useSkill.effects`.
 *
 * **Scope: skill-level-indexed `FuncType`s only — NP-only, Overcharge-indexed `FuncType`s
 * are deliberately excluded.** `instantDeath`/`forceInstantDeath` never appear on skill
 * `functions[]` in this project's own live-data survey (research/09 §7: "64 live **NP**
 * instances", "9 live **NP** instances") — they're structurally NP-only, and their `svals`
 * quintet (`svals`/`svals2`/.../`svals5`) is indexed by **Overcharge stage**, not skill
 * level, the opposite convention from every skill `FuncType` here (`svals[level - 1]`,
 * research/01 §6.3-6.4). Building a parallel NP-function interpreter (Overcharge-indexed,
 * feeding `castNp.effects`) is a separate, still-unbuilt follow-up — `castNp`'s existing
 * `InstantDeathEffect`/`ForceInstantDeathEffect` path is still hand-constructed by the
 * caller, same as before this pass.
 *
 * Every unmapped `Func` — an out-of-scope `FuncType`, or a supported `FuncType` whose
 * `funcTargetType` this project doesn't model for it (e.g. `ptOther`, flagged throughout
 * `skillEffect.ts`'s own doc comments) — is silently **skipped, not thrown**, and its
 * `funcType` collected into `unmodeled` instead: a candidate-generation caller needs to know
 * a servant's skill couldn't be fully modeled (so it can exclude that servant from automatic
 * search, or fall back to manual entry) rather than have the interpreter either crash the
 * whole resolution or under-represent the skill without saying so.
 */
export interface FuncInterpretationResult {
  readonly effects: readonly SkillEffect[];
  readonly unmodeled: readonly Func.FuncType[];
}

function allyTargetType(target: Func.FuncTargetType): SkillTargetType | null {
  switch (target) {
    case Func.FuncTargetType.SELF:
      return "self";
    case Func.FuncTargetType.PT_ONE:
      return "ptOne";
    case Func.FuncTargetType.PT_ALL:
      return "ptAll";
    default:
      return null;
  }
}

function enemyTargetType(target: Func.FuncTargetType): "enemyOne" | "enemyAll" | null {
  switch (target) {
    case Func.FuncTargetType.ENEMY:
      return "enemyOne";
    case Func.FuncTargetType.ENEMY_ALL:
      return "enemyAll";
    default:
      return null;
  }
}

function removalTargetType(target: Func.FuncTargetType): BuffRemovalTargetType | null {
  return allyTargetType(target) ?? enemyTargetType(target);
}

/** `Turn`/`Count` `Vals` fields absent from a live `DataVal` read the same as an explicit `-1` (research/01 §6.3-6.4's "unlimited" marker, `grantBuff`'s own `rawDurationToRemaining`, `./buffLifecycle.js`) — a buff with no stated duration limit is not itself a signal this interpreter treats as unmodelable. */
function rawOrUnlimited(value: number | undefined): number {
  return value ?? -1;
}

/** Builds the `ActiveBuffInstance` a `BuffGrantEffect` carries from a live `Buff.Buff` (`funcs[].buffs[]`) plus its already-level-resolved magnitude. */
function buildActiveBuffInstance(buff: Buff.Buff, amount: number): ActiveBuffInstance {
  return {
    type: buff.type,
    amount,
    ckSelfIndv: buff.ckSelfIndv,
    ckOpIndv: buff.ckOpIndv,
    buffGroup: buff.buffGroup,
    vals: new Set(buff.vals.map((trait) => trait.id)),
  };
}

/** Resolves one already-level-selected `svals` entry's `funcType` into 0 or more `SkillEffect`s — 0 when the `funcType`/`funcTargetType` combination isn't modeled. */
function resolveFunc(func: Func.Func, svals: DataVal.DataVal): readonly SkillEffect[] {
  switch (func.funcType) {
    case Func.FuncType.ADD_STATE:
    case Func.FuncType.ADD_STATE_SHORT: {
      const target = allyTargetType(func.funcTargetType);
      if (target === null || svals.Value === undefined) return [];
      const rawTurn = rawOrUnlimited(svals.Turn);
      const rawCount = rawOrUnlimited(svals.Count);
      return func.buffs.map(
        (buff): BuffGrantEffect => ({
          kind: "grantBuff",
          buff: buildActiveBuffInstance(buff, svals.Value as number),
          rawTurn,
          rawCount,
          targetType: target,
        }),
      );
    }
    case Func.FuncType.SUB_STATE: {
      const target = removalTargetType(func.funcTargetType);
      const targetTrait = func.functvals[0]?.id;
      if (target === null || targetTrait === undefined) return [];
      const effect: RemoveBuffEffect = { kind: "removeBuff", targetTrait, targetType: target };
      return [effect];
    }
    case Func.FuncType.GAIN_NP: {
      const target = allyTargetType(func.funcTargetType);
      if (target === null || svals.Value === undefined) return [];
      const effect: GainNpEffect = { kind: "gainNp", rawAmount: svals.Value, targetType: target };
      return [effect];
    }
    case Func.FuncType.GAIN_HP: {
      const target = allyTargetType(func.funcTargetType);
      if (target === null || svals.Value === undefined) return [];
      const effect: GainHpEffect = { kind: "gainHp", rawAmount: svals.Value, targetType: target };
      return [effect];
    }
    case Func.FuncType.GAIN_HP_PER: {
      const target = allyTargetType(func.funcTargetType);
      if (target === null || svals.Value === undefined) return [];
      const effect: GainHpPercentEffect = { kind: "gainHpPercent", rawPercent: svals.Value, targetType: target };
      return [effect];
    }
    case Func.FuncType.REVIVAL: {
      const target = allyTargetType(func.funcTargetType);
      if (target === null) return [];
      const effect: RevivalEffect = { kind: "revival", targetType: target };
      return [effect];
    }
    case Func.FuncType.GAIN_STAR: {
      if (svals.Value === undefined) return [];
      const effect: GainStarEffect = { kind: "gainStar", rawAmount: svals.Value };
      return [effect];
    }
    case Func.FuncType.LOSS_STAR: {
      if (svals.Value === undefined) return [];
      const effect: LossStarEffect = { kind: "lossStar", rawAmount: svals.Value };
      return [effect];
    }
    case Func.FuncType.LOSS_NP: {
      // Enemy-targeted lossNp is a confirmed no-op (skillEffect.ts's LossNpEffect doc
      // comment, live-tested 2026-09-08) — only the ally-side reading is real.
      const target = allyTargetType(func.funcTargetType);
      if (target === null || svals.Value === undefined) return [];
      const effect: LossNpEffect = { kind: "lossNp", rawAmount: svals.Value, targetType: target };
      return [effect];
    }
    case Func.FuncType.LOSS_HP_SAFE: {
      const target = allyTargetType(func.funcTargetType);
      if (target === null || svals.Value === undefined) return [];
      const effect: LossHpSafeEffect = { kind: "lossHpSafe", rawPercent: svals.Value, targetType: target };
      return [effect];
    }
    case Func.FuncType.LOSS_HP: {
      const target = allyTargetType(func.funcTargetType);
      if (target === null || svals.Value === undefined) return [];
      const effect: LossHpPercentEffect = { kind: "lossHpPercent", rawPercent: svals.Value, targetType: target };
      return [effect];
    }
    case Func.FuncType.SHORTEN_SKILL: {
      const target = allyTargetType(func.funcTargetType);
      if (target === null || svals.Value === undefined) return [];
      const effect: ShortenSkillEffect = { kind: "shortenSkill", rawTurns: svals.Value, targetType: target };
      return [effect];
    }
    case Func.FuncType.DELAY_NPTURN: {
      // Self/ally-targeted delayNpturn is a confirmed no-op (DelayNpTurnEffect's doc
      // comment, live-tested 2026-09-08) — only the enemy-side reading is real.
      const target = enemyTargetType(func.funcTargetType);
      if (target === null || svals.Value === undefined) return [];
      const effect: DelayNpTurnEffect = { kind: "delayNpTurn", rawTurns: svals.Value, targetType: target };
      return [effect];
    }
    default:
      return [];
  }
}

/**
 * Resolves every `Func` in `skill.functions` at `skillLevel` (1-indexed, `NiceSkill.svals`
 * convention, research/01 §6.3-6.4) into the `SkillEffect[]` a `useSkill`/
 * `useMysticCodeSkill` `Action` carries — see this module's own doc comment for full scope
 * and the silent-skip/`unmodeled` convention.
 */
export function resolveSkillEffects(skill: Pick<Skill.Skill, "functions">, skillLevel: number): FuncInterpretationResult {
  const effects: SkillEffect[] = [];
  const unmodeled: Func.FuncType[] = [];
  for (const func of skill.functions) {
    const svals = func.svals[skillLevel - 1];
    if (svals === undefined) {
      unmodeled.push(func.funcType);
      continue;
    }
    const resolved = resolveFunc(func, svals);
    if (resolved.length === 0) {
      unmodeled.push(func.funcType);
    } else {
      effects.push(...resolved);
    }
  }
  return { effects, unmodeled };
}
