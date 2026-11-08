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
 * `enumerateCeAssignments`, but copies with the same `keyOf` are treated as interchangeable:
 * each arrangement of CE kinds is produced once, and a kind is used at most as many times as
 * there are copies (each slot still gets a different copy, taken in pool order). Swapping two
 * identical copies can't change a simulation, so this drops only repeated work. With no shared
 * keys the output equals `enumerateCeAssignments` row for row.
 */
export function enumerateDistinctCeAssignments<CE>(
  pool: readonly CE[],
  slotCount: number,
  keyOf: (ce: CE) => string,
): readonly (readonly (CE | undefined)[])[] {
  const kinds: CE[][] = [];
  const kindByKey = new Map<string, CE[]>();
  for (const ce of pool) {
    const key = keyOf(ce);
    const copies = kindByKey.get(key);
    if (copies === undefined) {
      const kind = [ce];
      kindByKey.set(key, kind);
      kinds.push(kind);
    } else {
      copies.push(ce);
    }
  }
  const used: number[] = kinds.map(() => 0);
  const results: (CE | undefined)[][] = [];
  const current: (CE | undefined)[] = new Array(slotCount).fill(undefined);
  function fillSlot(slotIndex: number): void {
    if (slotIndex === slotCount) {
      results.push([...current]);
      return;
    }
    current[slotIndex] = undefined;
    fillSlot(slotIndex + 1);
    kinds.forEach((copies, kindIndex) => {
      const usedCount = used[kindIndex] as number;
      if (usedCount === copies.length) return;
      current[slotIndex] = copies[usedCount];
      used[kindIndex] = usedCount + 1;
      fillSlot(slotIndex + 1);
      used[kindIndex] = usedCount;
    });
    current[slotIndex] = undefined;
  }
  fillSlot(0);
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

/**
 * One caller-supplied Order Change option, timed relative to this turn's skill-usage plan
 * (`enumerateSkillUsageSubsets` above) — `afterSkills: false` places the swap before the
 * turn's skills resolve, `true` places it after them, but **always** before any card is
 * played, same restriction `enumerateOrderChangeTimings` below documents.
 */
export interface OrderChangeChoice<T> {
  readonly swap: T;
  readonly afterSkills: boolean;
}

/**
 * Research/09 §4's last remaining search-space axis, "Order Change timing" — every subset
 * of `swapOptions` **of size 0 or 1** (never more than one swap per turn: this project's
 * only modeled source of Order Change, a Mystic Code's 3rd skill slot, has a single 15→13-
 * turn cooldown, research/07 §2, so a party can't perform two in the same turn), each timed
 * `afterSkills: true` or `false` relative to the skill-usage-plan axis. Returns `[[]]`
 * prepended (the "don't swap this turn" option, matching `enumerateSkillUsageSubsets`'s own
 * "use none" convention) followed by 2 entries per swap option (one per timing).
 *
 * **Scoped to "before any card is played," not full within-turn timing** — deliberately
 * narrower than the phrase "when in a turn to swap" might suggest. Unlike a skill-usage
 * subset (which only ever *adds* buffs/resources a later `playCard`'s `context` doesn't
 * itself encode), an Order Change reassigns which servant a hand-card slot resolves against
 * (research/07 §4) — a `playCard` `Action` already built against the pre-swap owner would
 * have a stale `servantId`/`context` if the swap it depends on were spliced in *after* that
 * `Action` was constructed, mismatching the post-swap `state.handCards` at simulation time
 * (`resolvePlayCard`'s own owner-mismatch check, `../battle/turnLoop.js`) and throwing. This
 * project has no resolver that re-derives a specific card's `DerivedHitContext` against a
 * *different* servant mid-sequence, so inserting between/after card plays isn't attempted —
 * `../optimizer/orderChangeCandidates.js`'s `buildOrderChangeCandidates` instead rebuilds the
 * hand's ownership (`reassignHandCardOwnership`) *before* generating any card-order candidate
 * for a given swap choice, sidestepping the trap entirely rather than working around it here.
 */
export function enumerateOrderChangeTimings<T>(swapOptions: readonly T[]): readonly (readonly OrderChangeChoice<T>[])[] {
  const results: OrderChangeChoice<T>[][] = [[]];
  for (const swap of swapOptions) {
    results.push([{ swap, afterSkills: false }]);
    results.push([{ swap, afterSkills: true }]);
  }
  return results;
}

/** One party formation: which shortlist members are front-line vs. benched sub-members (research/00 §4). */
export interface PartyFormation<T> {
  readonly frontLine: readonly T[];
  readonly bench: readonly T[];
}

/**
 * Every way to form a party from `shortlist` with exactly `frontLineCount` front-line
 * servants plus 0 to `maxBenchCount` benched sub-members (research/00 §4's "up to 3
 * sub-members") — research/09 §4's "candidate servant subset, ≤6, user-shortlisted" axis in
 * full, superseding a caller re-calling `enumerateServantSubsets` itself per party size: for
 * every total party size from `frontLineCount` to `min(shortlist.length, frontLineCount +
 * maxBenchCount)`, every `enumerateServantSubsets(shortlist, partySize)` combination is
 * further split into every way to choose which `frontLineCount` of that combination are
 * front-line, the remainder becoming bench. `maxBenchCount: 0` degenerates to exactly
 * `enumerateServantSubsets(shortlist, frontLineCount)` with an always-empty `bench` — this
 * project's own search behavior before this function existed.
 *
 * A benched member still needs its own CE assignment (`enumerateCeAssignments`, sized to
 * `frontLine.length + bench.length` fielded slots, not just `frontLineCount`) — a benched
 * servant's stats matter the instant an Order Change (`enumerateOrderChangeTimings` above)
 * swaps it in mid-turn, so its CE can't be skipped as "doesn't matter while benched" the way
 * its per-turn state advancement is (research/07 §4).
 */
export function enumeratePartyFormations<T>(shortlist: readonly T[], frontLineCount: number, maxBenchCount: number): readonly PartyFormation<T>[] {
  const results: PartyFormation<T>[] = [];
  const maxPartySize = Math.min(shortlist.length, frontLineCount + maxBenchCount);
  for (let partySize = frontLineCount; partySize <= maxPartySize; partySize++) {
    for (const partySubset of enumerateServantSubsets(shortlist, partySize)) {
      for (const frontLine of enumerateServantSubsets(partySubset, frontLineCount)) {
        const frontLineSet = new Set<T>(frontLine);
        const bench = partySubset.filter((member) => !frontLineSet.has(member));
        results.push({ frontLine, bench });
      }
    }
  }
  return results;
}
