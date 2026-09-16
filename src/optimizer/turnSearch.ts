import type { Action } from "../battle/action.js";
import { ActionUnavailableError } from "../battle/actionError.js";
import type { BattleState } from "../battle/battleState.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { resolveAction } from "../battle/turnLoop.js";

/**
 * The first slice of research/09 §4's search/optimizer strategy — the generic
 * "simulate a candidate `Action` sequence through the deterministic pipeline, rank
 * by objective" mechanism §4 describes, deliberately **not** the candidate
 * *generation* itself (servant subset × CE assignment × skill/card-order
 * enumeration). That generation layer needs account/roster data integration
 * (`src/account/`) and is left for a later increment — this module takes whatever
 * candidate `Action[]` sequences a caller already has (e.g. every permutation of a
 * fixed hand's card-play order) and evaluates/ranks them, which is exactly what
 * both the coarse-pruning and fine-search passes in §4 do internally once a
 * candidate line exists.
 */

/** One candidate full turn (or partial-turn) plan to evaluate. */
export interface ActionSequenceCandidate {
  readonly label: string;
  readonly actions: readonly Action[];
}

/** A candidate's outcome after simulation, carrying its resulting `BattleState` for further inspection. */
export interface ActionSequenceResult {
  readonly label: string;
  readonly actions: readonly Action[];
  readonly finalState: BattleState;
  readonly score: number;
}

/**
 * Higher is better — this project's search always ranks descending by `score`, so
 * an objective that wants "fewer turns"/"less HP remaining" must return a value
 * where less-of-the-real-quantity means a *higher* score (e.g. negate it), rather
 * than the search trying to infer sort direction per objective.
 */
export type SequenceScoreFn = (finalState: BattleState, initialState: BattleState) => number;

/** Applies one candidate's `Action`s to `initialState` in strict sequence via `resolveAction` (research/09 §1's "never batched" requirement) and returns the resulting state. */
export function simulateActionSequence(
  initialState: BattleState,
  actions: readonly Action[],
  constants: BattleConstants,
  randomFn: () => number,
): BattleState {
  return actions.reduce<BattleState>((state, action) => resolveAction(state, action, constants, randomFn), initialState);
}

/**
 * Simulates every candidate from the same `initialState` and returns all of them
 * ranked descending by `scoreFn`'s result — the caller picks how many to keep
 * (e.g. "Top-5", research/09 §4's diversity requirement, which needs a
 * deduplication pass this function deliberately doesn't attempt: that's a
 * candidate-generation-side concern, not a scoring concern).
 */
export function searchBestActionSequence(
  initialState: BattleState,
  candidates: readonly ActionSequenceCandidate[],
  constants: BattleConstants,
  randomFn: () => number,
  scoreFn: SequenceScoreFn,
): readonly ActionSequenceResult[] {
  return candidates
    .flatMap((candidate): readonly ActionSequenceResult[] => {
      try {
        const finalState = simulateActionSequence(initialState, candidate.actions, constants, randomFn);
        return [{ label: candidate.label, actions: candidate.actions, finalState, score: scoreFn(finalState, initialState) }];
      } catch (error) {
        if (error instanceof ActionUnavailableError) return [];
        throw error;
      }
    })
    .sort((a, b) => b.score - a.score);
}
