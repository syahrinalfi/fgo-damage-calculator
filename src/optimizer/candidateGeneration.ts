/**
 * Pure combinatorics for research/09 §4's search space: `{candidate servant subset} ×
 * {CE assignment per slot} × {card-play order per turn}` — the "servant-subset/CE-
 * assignment/card-order enumeration" this project's own tracking notes flagged as "the last
 * blocker before real candidate generation" now that both prerequisite resolvers exist
 * (`buildServantInstance` for stats, `resolveSkillEffects`/`resolveNpEffects` for skill/NP
 * effects, `src/battle/`). Each function here only *enumerates* — turning one enumerated
 * combination into an actual `ActionSequenceCandidate` (`./turnSearch.js`) still needs a
 * caller to resolve stats/effects and build `Action`s from it, which is deliberately not
 * this module's job (keeps these functions plain, type-agnostic, and independently
 * testable rather than coupled to `BattleState`/account-data shapes).
 *
 * **Not attempted here, still genuinely open** (§4's remaining search-space axis):
 * "Order Change timing" (when in a turn to swap, if at all — a much larger space than a
 * simple enumeration since it interacts with cooldown/backline-freeze state, research/07
 * §4). Needs its own dedicated pass once there's a concrete end-to-end candidate-builder to
 * validate it against, same as `enumerateSkillUsageSubsets` below needed before
 * `../optimizer/skillUsageCandidates.js` was built.
 *
 * **Combinatorial explosion is the caller's problem, not this module's** — these functions
 * enumerate *everything* satisfying the constraint (no pruning, no heuristic seeding); §4's
 * own coarse-pruning-then-fine-search two-tier strategy is exactly what's expected to sit on
 * top of a caller that first narrows a shortlist/pool down before calling these, not
 * something baked in here.
 */

/** Every unordered `subsetSize`-element combination of `shortlist`, preserving each element's original relative order within a combination (research/09 §4's "candidate servant subset, ≤6, user-shortlisted" axis — the caller picks `subsetSize`, e.g. 6 for a full party, and re-calls per size if "up to 6" is wanted). Returns `[[]]` for `subsetSize === 0`, `[]` when `subsetSize` exceeds `shortlist.length`. */
export function enumerateServantSubsets<T>(shortlist: readonly T[], subsetSize: number): readonly (readonly T[])[] {
  if (subsetSize === 0) return [[]];
  if (subsetSize > shortlist.length) return [];
  const results: T[][] = [];
  const current: T[] = [];
  function backtrack(start: number): void {
    if (current.length === subsetSize) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < shortlist.length; i++) {
      current.push(shortlist[i] as T);
      backtrack(i + 1);
      current.pop();
    }
  }
  backtrack(0);
  return results;
}

/**
 * Every way to assign `pool` items to `slotCount` ordered slots such that no `pool` item
 * (compared by reference/identity, i.e. array position — two structurally-identical items
 * are still distinct) is assigned to more than one slot at once, and each slot may
 * independently be left `undefined` (no item assigned) — research/09 §4's "CE assignment
 * per slot, respecting owned-copy counts" axis: pass each servant slot's *eligible* CE
 * pool (already filtered to actually-owned copies) as `pool`, and `slotCount` fielded
 * servants; identity-based exclusion is exactly "a specific owned CE copy can't equip two
 * servants simultaneously," matching `OwnedCraftEssence`'s per-copy inventory model
 * (`src/account/types.ts`) without this function needing to know that type at all.
 *
 * Grows fast: for `slotCount` = n and `pool.length` = m, the result has
 * `sum(k=0..min(n,m)) of C(n,k) * P(m,k)` rows — a caller should pass an already-narrowed
 * pool (e.g. only CEs relevant to the servants in this candidate subset), not a user's
 * entire CE inventory.
 */
export function enumerateCeAssignments<CE>(pool: readonly CE[], slotCount: number): readonly (readonly (CE | undefined)[])[] {
  const results: (CE | undefined)[][] = [];
  const current: (CE | undefined)[] = new Array(slotCount).fill(undefined);
  function fillSlot(slotIndex: number, usedIndices: ReadonlySet<number>): void {
    if (slotIndex === slotCount) {
      results.push([...current]);
      return;
    }
    current[slotIndex] = undefined;
    fillSlot(slotIndex + 1, usedIndices);
    for (let i = 0; i < pool.length; i++) {
      if (usedIndices.has(i)) continue;
      current[slotIndex] = pool[i];
      fillSlot(slotIndex + 1, new Set([...usedIndices, i]));
    }
    current[slotIndex] = undefined;
  }
  fillSlot(0, new Set());
  return results;
}

/**
 * Every ordered selection of `selectCount` distinct items from `items` (an "n permute r,"
 * `nPr = n!/(n-r)!`) — research/09 §4's "card-play order per turn" axis: pass a turn's
 * `handCards` (or their indices) as `items` and the number of cards the candidate plans to
 * play as `selectCount` to get every "which cards, in what order" line worth simulating.
 * `selectCount === 0` returns `[[]]` (one empty selection); `selectCount > items.length`
 * returns `[]` (not enough distinct items to select that many).
 */
export function enumerateOrderedSelections<T>(items: readonly T[], selectCount: number): readonly (readonly T[])[] {
  if (selectCount === 0) return [[]];
  if (selectCount > items.length) return [];
  const results: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of enumerateOrderedSelections(rest, selectCount - 1)) {
      results.push([items[i] as T, ...tail]);
    }
  }
  return results;
}

/**
 * Every subset of `options` (a power set, `2^n` subsets including the empty one),
 * preserving each element's original relative order within a subset — research/09 §4's
 * "skill-usage plan per turn" axis: pass a turn's available (off-cooldown) skill/Mystic
 * Code skill activations as `options` to get every "use none of these / use exactly these
 * (in this relative order)" combination worth simulating.
 *
 * Skill-cast **order** within a chosen subset is deliberately not itself varied here
 * (unlike `enumerateOrderedSelections`'s card-order axis, which does vary order) — no
 * primary source in this project models same-turn skill-activation-order interactions
 * beyond the NP-function-order finding `Action`'s own doc comment already covers for
 * `castNp`'s `effects`, so permuting skill order would be searching a dimension nothing
 * sources, not a scoped simplification of a known-important one. A caller who wants a
 * specific cast order can simply pass `options` pre-ordered the way they want it applied.
 *
 * Grows fast (`2^n`); a caller should pass an already-narrowed list (e.g. only skills
 * actually off cooldown this turn), not every skill a party could ever know.
 */
export function enumerateSkillUsageSubsets<T>(options: readonly T[]): readonly (readonly T[])[] {
  const results: T[][] = [];
  const current: T[] = [];
  function backtrack(index: number): void {
    if (index === options.length) {
      results.push([...current]);
      return;
    }
    backtrack(index + 1);
    current.push(options[index] as T);
    backtrack(index + 1);
    current.pop();
  }
  backtrack(0);
  return results;
}
