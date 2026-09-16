import type { Action } from "../battle/action.js";
import { ActionUnavailableError } from "../battle/actionError.js";
import type { BattleState } from "../battle/battleState.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { resolveAction } from "../battle/turnLoop.js";
import { simulateActionSequence, type ActionSequenceCandidate, type SequenceScoreFn } from "./turnSearch.js";

/**
 * Research/09 §5's ST Burst Finder specialization — "the search space's turn dimension is not
 * capped at 1": a multi-turn plan (e.g. turn 1 setup/buff-stack, turn 2 the actual burst) is
 * found "the same way a 3T-clear line is found: simulate turn 1 fully ..., then search turn 2
 * from the resulting `BattleState`." This module is exactly that driver, reusing the existing
 * single-turn machinery (`./turnSearch.js`) per turn rather than introducing new mechanics —
 * §5 itself says this "falls out of the same engine with a different objective + horizon, not
 * new mechanics." No battle-layer changes were needed to build this: `resolveAction`'s
 * `endTurn` case already advances cooldowns, per-turn buff/enemy state, and redraws the next
 * turn's hand (`resolveEndTurn`, `../battle/turnLoop.js`) and already resolves break-bar
 * `shift` transitions on enemy death (`applyShiftTransitions`) — every mechanic §5's "turn 1:
 * ...unblock a target...; turn 2: execute the burst" scenario needs already exists.
 *
 * **Deliberately a full cross-product search, not a greedy per-turn one** — scoring only
 * happens once, at the very end of the horizon, via the *same* `SequenceScoreFn` shape
 * single-turn search already uses (`(finalState, initialState) => number`). A greedy "pick
 * the best-scoring candidate each turn in isolation" strategy would be actively wrong for the
 * exact scenario §5 describes: a deliberately non-damage-optimal setup turn (buff-stacking, a
 * sacrifice kill to trigger a `call`) that only pays off on a *later* turn would never be
 * picked by a per-turn objective. Consistent with this project's own stated stance elsewhere
 * (`candidateGeneration.ts`'s own doc comment: "combinatorial explosion is the caller's
 * problem, not this module's") — a caller should keep `buildCandidatesForTurn` narrowed to a
 * small candidate set per turn and `turnCount` small (2-3, matching §5's own example), since
 * this grows as the product of every turn's own candidate count.
 */

/** Resolves a `BattleState` to that turn's candidate `ActionSequenceCandidate`s (not including a trailing `endTurn` — this module appends that itself once a candidate is chosen for simulation). Receives the 0-indexed turn number within this multi-turn search (not `BattleState.currentTurn`, which already reflects however many turns preceded this search) so a caller can vary its own per-turn options if needed, though most callers can ignore it and derive everything from `state` alone (skill cooldowns, hand, etc. are already reflected there). */
export type PerTurnCandidateBuilder = (state: BattleState, turnIndex: number) => readonly ActionSequenceCandidate[];

/** One fully-simulated multi-turn line — `turnActions[i]` is turn `i`'s chosen candidate's own actions (no trailing `endTurn`, which was still applied to produce `finalState`). */
export interface MultiTurnResult {
  readonly label: string;
  readonly turnActions: readonly (readonly Action[])[];
  readonly finalState: BattleState;
  readonly score: number;
}

/**
 * Searches every full `turnCount`-turn action sequence reachable from `initialState`, one
 * `buildCandidatesForTurn` call's worth of candidates per turn, applying each chosen
 * candidate's actions *plus* a trailing `endTurn` (`resolveAction`) before recursing into the
 * next turn — mirroring `searchBestActionSequence`'s single-turn shape but scoring only the
 * final state reached after all `turnCount` turns, via `scoreFn(finalState, initialState)`
 * (the *original* `initialState`, not any intermediate turn's start-of-turn state — so a
 * ready-made objective like `damageDealtAtSlot` (`./objectives.js`) already generalizes
 * correctly to "total damage this slot took across the whole horizon" with no changes needed).
 *
 * Returns every complete line ranked descending by score, **not deduplicated** — same
 * "caller decides how many/which to surface" split every other search function in this
 * project already leaves to its caller. A turn with no candidates at all
 * (`buildCandidatesForTurn` returns `[]`) prunes that entire branch (no line continues past a
 * turn with nothing to do) rather than silently ending the horizon early with a partial line.
 */
export function searchMultiTurnActionSequences(
  initialState: BattleState,
  turnCount: number,
  buildCandidatesForTurn: PerTurnCandidateBuilder,
  constants: BattleConstants,
  randomFn: () => number,
  scoreFn: SequenceScoreFn,
): readonly MultiTurnResult[] {
  if (turnCount < 0) {
    throw new RangeError(`turnCount must be >= 0, got ${turnCount}`);
  }

  function expand(state: BattleState, turnIndex: number, chosenTurnActions: readonly (readonly Action[])[], label: string): MultiTurnResult[] {
    if (turnIndex === turnCount) {
      return [{ label, turnActions: chosenTurnActions, finalState: state, score: scoreFn(state, initialState) }];
    }
    const candidates = buildCandidatesForTurn(state, turnIndex);
    const results: MultiTurnResult[] = [];
    for (const candidate of candidates) {
      let stateAfterActions: BattleState;
      try {
        stateAfterActions = simulateActionSequence(state, candidate.actions, constants, randomFn);
      } catch (error) {
        if (error instanceof ActionUnavailableError) continue;
        throw error;
      }
      const stateAfterTurn = resolveAction(stateAfterActions, { type: "endTurn" }, constants, randomFn);
      const nextLabel = label === "" ? candidate.label : `${label}>>${candidate.label}`;
      results.push(...expand(stateAfterTurn, turnIndex + 1, [...chosenTurnActions, candidate.actions], nextLabel));
    }
    return results;
  }

  return expand(initialState, 0, [], "").sort((a, b) => b.score - a.score);
}
