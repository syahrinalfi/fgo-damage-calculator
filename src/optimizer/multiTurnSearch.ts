import type { Action } from "../battle/action.js";
import { ActionUnavailableError } from "../battle/actionError.js";
import type { BattleState } from "../battle/battleState.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { resolveAction } from "../battle/turnLoop.js";
import { FULL_TD_POINT } from "../engine/constants.js";
import type { ActionSequenceCandidate, SequenceScoreFn } from "./turnSearch.js";

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
 * Search uses a bounded beam rather than materializing the full turn-by-turn cross-product.
 * Every retained partial line still reaches the next turn before final ranking, so setup lines
 * remain possible; `beamWidth` is the explicit quality/memory tradeoff instead of recursion or
 * an unbounded result array.
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

export interface MultiTurnSearchOptions {
  /** Maximum number of partial lines retained after each turn. Omit for the bounded product default. */
  readonly beamWidth?: number;
  /** Maximum number of distinct servants allowed to perform damaging actions across the full horizon. */
  readonly maxAttackerCount?: number;
}

const DEFAULT_BEAM_WIDTH = 256;

/** Servants that actually perform a face-card, Extra, or NP attack; setup/support actions do not count. */
export function attackingServantIds(actions: readonly Action[]): ReadonlySet<number> {
  return new Set(
    actions.flatMap((action) =>
      action.type === "playCard" || action.type === "playExtraCard" || action.type === "castNp"
        ? [action.servantId]
        : [],
    ),
  );
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
 * Returns the final retained beam ranked descending by score, **not deduplicated**. A turn with no candidates at all
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
  options: MultiTurnSearchOptions = {},
): readonly MultiTurnResult[] {
  if (turnCount < 0) {
    throw new RangeError(`turnCount must be >= 0, got ${turnCount}`);
  }
  validateMultiTurnSearchOptions(options);

  let frontier = startBeam(initialState, scoreFn);
  for (let turnIndex = 0; turnIndex < turnCount; turnIndex += 1) {
    frontier = advanceBeam(frontier, turnIndex, initialState, buildCandidatesForTurn, constants, randomFn, scoreFn, options);
    if (frontier.length === 0) break;
  }
  return rankBeam(frontier);
}

/** One retained partial line between turns of a beam search. */
export interface BeamEntry {
  readonly label: string;
  readonly turnActions: readonly (readonly Action[])[];
  readonly state: BattleState;
  readonly attackerIds: ReadonlySet<number>;
  /** `scoreFn(state, initialState)`, computed once when the entry is created. */
  readonly score: number;
}

export function validateMultiTurnSearchOptions(options: MultiTurnSearchOptions): void {
  const beamWidth = options.beamWidth ?? DEFAULT_BEAM_WIDTH;
  if (!Number.isInteger(beamWidth) || beamWidth < 1) {
    throw new RangeError(`beamWidth must be a positive integer, got ${beamWidth}`);
  }
  if (options.maxAttackerCount !== undefined && (!Number.isInteger(options.maxAttackerCount) || options.maxAttackerCount < 1)) {
    throw new RangeError(`maxAttackerCount must be a positive integer, got ${options.maxAttackerCount}`);
  }
}

/** The beam before any turn has been searched: the starting state alone. */
export function startBeam(initialState: BattleState, scoreFn: SequenceScoreFn): readonly BeamEntry[] {
  return [{ label: "", turnActions: [], state: initialState, attackerIds: new Set(), score: scoreFn(initialState, initialState) }];
}

const byScoreDescending = (a: BeamEntry, b: BeamEntry): number => b.score - a.score;

/**
 * Searches one more turn from every retained line: simulates each candidate plus a trailing
 * `endTurn`, drops unavailable lines and lines over the attacker cap, and keeps the best
 * `beamWidth`. The frontier after turn N depends only on the turns searched so far, never on how
 * many turns a caller will eventually search, so callers may stop or continue at any turn.
 */
export function advanceBeam(
  frontier: readonly BeamEntry[],
  turnIndex: number,
  initialState: BattleState,
  buildCandidatesForTurn: PerTurnCandidateBuilder,
  constants: BattleConstants,
  randomFn: () => number,
  scoreFn: SequenceScoreFn,
  options: MultiTurnSearchOptions = {},
): readonly BeamEntry[] {
  const beamWidth = options.beamWidth ?? DEFAULT_BEAM_WIDTH;
  const expanded: BeamEntry[] = [];
  const actionIds = new WeakMap<Action, number>();
  let nextActionId = 0;
  const actionId = (action: Action): number => {
    let id = actionIds.get(action);
    if (id === undefined) {
      id = nextActionId++;
      actionIds.set(action, id);
    }
    return id;
  };
  for (const branch of frontier) {
    // Candidates share their setup (skills, Mystic Code skills, Order Change) as the same action
    // objects, so each distinct setup is simulated once per line; `null` marks an unavailable one.
    const setupStates = new Map<string, BattleState | null>();
    for (const candidate of buildCandidatesForTurn(branch.state, turnIndex)) {
      const attackerIds = new Set([...branch.attackerIds, ...attackingServantIds(candidate.actions)]);
      if (options.maxAttackerCount !== undefined && attackerIds.size > options.maxAttackerCount) continue;
      const firstAttack = candidate.actions.findIndex(isAttack);
      const setupLength = firstAttack < 0 ? candidate.actions.length : firstAttack;
      const setupKey = candidate.actions.slice(0, setupLength).map(actionId).join(",");
      let setupState = setupStates.get(setupKey);
      if (setupState === undefined) {
        setupState = simulateOrUnavailable(branch.state, candidate.actions, 0, setupLength, constants, randomFn);
        setupStates.set(setupKey, setupState);
      }
      if (setupState === null || hasUnreadyNp(setupState, candidate.actions, setupLength)) continue;
      const stateAfterActions = simulateOrUnavailable(setupState, candidate.actions, setupLength, candidate.actions.length, constants, randomFn);
      if (stateAfterActions === null) continue;
      const stateAfterTurn = resolveAction(stateAfterActions, { type: "endTurn" }, constants, randomFn);
      expanded.push({
        label: branch.label === "" ? candidate.label : `${branch.label}>>${candidate.label}`,
        turnActions: [...branch.turnActions, candidate.actions],
        state: stateAfterTurn,
        attackerIds,
        score: scoreFn(stateAfterTurn, initialState),
      });
      if (expanded.length >= beamWidth * 2) {
        expanded.sort(byScoreDescending);
        expanded.length = beamWidth;
      }
    }
  }
  expanded.sort(byScoreDescending);
  return expanded.slice(0, beamWidth);
}

function isAttack(action: Action): boolean {
  return action.type === "playCard" || action.type === "castNp" || action.type === "playExtraCard";
}

/** Resolves `actions[from..to)` in order, or `null` when one is unavailable in the battle state. */
function simulateOrUnavailable(
  state: BattleState,
  actions: readonly Action[],
  from: number,
  to: number,
  constants: BattleConstants,
  randomFn: () => number,
): BattleState | null {
  let current = state;
  try {
    for (let index = from; index < to; index += 1) current = resolveAction(current, actions[index] as Action, constants, randomFn);
  } catch (error) {
    if (error instanceof ActionUnavailableError) return null;
    throw error;
  }
  return current;
}

/**
 * True when the chain casts an NP whose servant is below 100% after the setup. The NP must be
 * full when the chain is chosen (`BattleState.npReadyAtChainSelection`), so the engine would
 * reject the line anyway; skipping it here avoids simulating its cards first.
 */
function hasUnreadyNp(setupState: BattleState, actions: readonly Action[], setupLength: number): boolean {
  for (let index = setupLength; index < actions.length; index += 1) {
    const action = actions[index] as Action;
    if (action.type !== "castNp") continue;
    const servant = setupState.servants.find((candidate) => candidate.servantId === action.servantId);
    if (servant !== undefined && servant.currentNpGauge < FULL_TD_POINT) return true;
  }
  return false;
}

/** The beam's lines as results, best first. */
export function rankBeam(frontier: readonly BeamEntry[]): readonly MultiTurnResult[] {
  return frontier
    .map((entry): MultiTurnResult => ({
      label: entry.label,
      turnActions: entry.turnActions,
      finalState: entry.state,
      score: entry.score,
    }))
    .sort((a, b) => b.score - a.score);
}
