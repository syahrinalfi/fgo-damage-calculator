/**
 * The general "buff action" resolution algorithm underlying every summed/capped modifier
 * value in the damage, NP-gain, and crit-star formulas (research/02-damage-formula.md §3):
 * multiple buffs mapping to the same action (e.g. "ATK up") stack additively, then the
 * combined total is bounded per the action's limit mode and maxRate. This is the one
 * mechanism the whole engine reuses for every "sum of active buffs of this type" lookup
 * (atk, defence, cardMod, powerMod's sub-parts, ...) rather than a per-term bespoke
 * calculation — confirming the project's "generic engine" decision (research/00 §3).
 */
export type BuffActionLimit = "normal" | "lower" | "upper";

export interface BuffActionInput {
  /** The action's starting value before any buff contribution (usually 0). */
  baseParam: number;
  /** Sum of all currently-active "plus"-type buff values mapped to this action. */
  plusTotal: number;
  /** Sum of all currently-active "minus"-type buff values mapped to this action. */
  minusTotal: number;
  /** Subtracted after the floor check and before the ceiling check, per the source algorithm. */
  baseValue: number;
  /** Per-action hard ceiling — the last-applied buff's maxRate, per research/02 §3. */
  maxRate: number;
  /** Which of the floor-at-0 / ceiling-at-maxRate checks apply to this action. */
  limit: BuffActionLimit;
}

/** Implements research/02-damage-formula.md §3's buff-action algorithm exactly. */
export function resolveBuffAction(input: BuffActionInput): number {
  let num = input.baseParam + input.plusTotal - input.minusTotal;

  if ((input.limit === "normal" || input.limit === "lower") && num < 0) {
    num = 0;
  }

  num = num - input.baseValue;

  if ((input.limit === "normal" || input.limit === "upper") && input.maxRate < num) {
    num = input.maxRate;
  }

  return num;
}
