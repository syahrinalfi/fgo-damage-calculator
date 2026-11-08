import type { Action, DerivedHitContext } from "../battle/action.js";
import type { BattleState } from "../battle/battleState.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { isQuestCleared, resolveAction } from "../battle/turnLoop.js";
import { buildInitialBattleState, type PartyMemberSpec } from "./battleStateBuilder.js";
import type { ActionSequenceCandidate, ActionSequenceResult } from "./turnSearch.js";

export interface ReliabilityEstimate {
  readonly trialCount: number;
  readonly clearCount: number;
  readonly clearProbability: number;
  readonly confidence95: {
    readonly lower: number;
    readonly upper: number;
  };
}

export interface ReliabilityConfig {
  readonly trialCount: number;
  readonly seed: number;
}

export interface ReliabilityTrialOptions extends ReliabilityConfig {
  readonly runTrial: (randomFn: () => number, trialIndex: number) => boolean;
}

export const MAX_RELIABILITY_TRIALS = 10_000;

export function validateReliabilityConfig(config: ReliabilityConfig): void {
  if (!Number.isInteger(config.trialCount) || config.trialCount < 1 || config.trialCount > MAX_RELIABILITY_TRIALS) {
    throw new RangeError(`trialCount must be an integer from 1 through ${MAX_RELIABILITY_TRIALS}, got ${config.trialCount}`);
  }
  if (!Number.isInteger(config.seed)) throw new RangeError(`seed must be an integer, got ${config.seed}`);
}

interface ReplayCandidate {
  readonly party: readonly PartyMemberSpec[];
  readonly initialState: ActionSequenceResult["finalState"];
  readonly best: ActionSequenceResult;
}

/** Small deterministic PRNG suitable for reproducible simulation, not cryptography. */
export function createSeededRandom(seed: number): () => number {
  if (!Number.isInteger(seed)) throw new RangeError(`seed must be an integer, got ${seed}`);
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function confidence95(clearCount: number, trialCount: number): ReliabilityEstimate["confidence95"] {
  const z = 1.959963984540054;
  const probability = clearCount / trialCount;
  const denominator = 1 + (z * z) / trialCount;
  const center = (probability + (z * z) / (2 * trialCount)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((probability * (1 - probability)) / trialCount + (z * z) / (4 * trialCount * trialCount));
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

/** Runs independent seeded Bernoulli trials; thrown/illegal trials are conservatively failures. */
export function estimateClearReliability(options: ReliabilityTrialOptions): ReliabilityEstimate {
  validateReliabilityConfig(options);

  let clearCount = 0;
  for (let trialIndex = 0; trialIndex < options.trialCount; trialIndex += 1) {
    const trialSeed = (options.seed + Math.imul(trialIndex + 1, 0x9e3779b9)) >>> 0;
    try {
      if (options.runTrial(createSeededRandom(trialSeed), trialIndex)) clearCount += 1;
    } catch {
      // A card mismatch, unavailable action, or any other invalid replay is a failed trial.
    }
  }
  return {
    trialCount: options.trialCount,
    clearCount,
    clearProbability: clearCount / options.trialCount,
    confidence95: confidence95(clearCount, options.trialCount),
  };
}

function withRandomModifier(context: DerivedHitContext, randomModifier: number): DerivedHitContext {
  return { ...context, randomModifier };
}

/** Gives an attack action a fresh damage roll, `0.9 + randomFn() * 0.2` (pass `() => 0` for the minimum roll). */
export function randomizeAttack(action: Action, randomFn: () => number): Action {
  if (action.type !== "playCard" && action.type !== "playExtraCard" && action.type !== "castNp") return action;
  const randomModifier = 0.9 + randomFn() * 0.2;
  if (action.type !== "castNp") {
    return { ...action, context: withRandomModifier(action.context, randomModifier) };
  }
  return {
    ...action,
    context: withRandomModifier(action.context, randomModifier),
    ...(action.hitContexts === undefined
      ? {}
      : { hitContexts: action.hitContexts.map((context) => withRandomModifier(context, randomModifier)) }),
    ...(action.targetHitContexts === undefined
      ? {}
      : {
          targetHitContexts: action.targetHitContexts.map((target) => ({
            ...target,
            hitContexts: target.hitContexts.map((context) => withRandomModifier(context, randomModifier)),
          })),
        }),
  };
}

/**
 * Estimates whether one exact finalist action log remains executable and clearing when the
 * initial/future card draws, crit rolls, and per-attack damage rolls are resampled.
 */
export function estimateQuestCandidateReliability(
  candidate: ReplayCandidate,
  constants: BattleConstants,
  config: ReliabilityConfig,
): ReliabilityEstimate {
  return estimateClearReliability({
    ...config,
    runTrial: (randomFn) => {
      let state = buildInitialBattleState(candidate.party, candidate.initialState.waves, {
        costBudget: candidate.initialState.costBudget,
        commandSealsRemaining: candidate.initialState.commandSealsRemaining,
        fieldTraits: candidate.initialState.fieldTraits,
        randomFn,
      });
      for (const action of candidate.best.actions) {
        state = resolveAction(state, randomizeAttack(action, randomFn), constants, randomFn);
      }
      return isQuestCleared(state);
    },
  });
}

/** Where each NP sits in a chain: `servantId` per attack slot, `null` for a face card. */
function npSlots(actions: readonly Action[]): readonly (number | null)[] {
  return actions.filter((action) => action.type === "playCard" || action.type === "castNp").map((action) => (action.type === "castNp" ? action.servantId : null));
}

/**
 * Estimates how often a line clears when played the way a player would on freshly dealt hands:
 * each turn keeps the line's skills, Mystic Code skills and Order Change, casts the same NPs in
 * the same chain slots, and fills the face-card slots with the first such chain `chainsForState`
 * offers for the hand actually dealt; damage rolls are re-rolled. A turn whose NPs cannot be cast
 * that way fails the trial. `estimateQuestCandidateReliability` instead replays the exact log,
 * so any change in the dealt hand fails it.
 */
export function estimatePlayedLineReliability(
  candidate: ReplayCandidate,
  chainsForState: (state: BattleState) => readonly ActionSequenceCandidate[],
  constants: BattleConstants,
  config: ReliabilityConfig,
): ReliabilityEstimate {
  const turns: Action[][] = [[]];
  for (const action of candidate.best.actions) {
    if (action.type === "endTurn") turns.push([]);
    else (turns[turns.length - 1] as Action[]).push(action);
  }
  if (turns[turns.length - 1]?.length === 0) turns.pop();
  return estimateClearReliability({
    ...config,
    runTrial: (randomFn) => {
      let state = buildInitialBattleState(candidate.party, candidate.initialState.waves, {
        costBudget: candidate.initialState.costBudget,
        commandSealsRemaining: candidate.initialState.commandSealsRemaining,
        fieldTraits: candidate.initialState.fieldTraits,
        randomFn,
      });
      for (const turn of turns) {
        const firstAttack = turn.findIndex((action) => action.type === "playCard" || action.type === "castNp" || action.type === "playExtraCard");
        const setupLength = firstAttack < 0 ? turn.length : firstAttack;
        for (const action of turn.slice(0, setupLength)) state = resolveAction(state, action, constants, randomFn);
        if (setupLength < turn.length) {
          const wanted = npSlots(turn.slice(setupLength)).join();
          const chain = chainsForState(state).find((option) => npSlots(option.actions).join() === wanted);
          if (chain === undefined) return false;
          for (const action of chain.actions) state = resolveAction(state, randomizeAttack(action, randomFn), constants, randomFn);
        }
        state = resolveAction(state, { type: "endTurn" }, constants, randomFn);
      }
      return isQuestCleared(state);
    },
  });
}
