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
export type PerTurnCandidateBuilder = (state: BattleState, turnIndex: number) => readonly ActionSequenceCandidate[] | FactoredTurnCandidates;

/**
 * One turn's candidates without materializing setups × chains: every setup (skills, Mystic Code
 * skills, Order Change — no attacks) may be followed by every chain of its group. A line is
 * labelled `${setup.label}|${chain.label}` (just the chain's label after an empty setup label)
 * and plays `[...setup.actions, ...chain.actions]`.
 */
export interface TurnCandidateGroup {
  readonly setups: readonly ActionSequenceCandidate[];
  readonly chains: readonly ActionSequenceCandidate[];
}

export interface FactoredTurnCandidates {
  readonly groups: readonly TurnCandidateGroup[];
}

/** `${setup.label}|${chain.label}`, or the chain's own label after an empty setup label. */
function lineLabel(setup: ActionSequenceCandidate, chain: Pick<ActionSequenceCandidate, "label">): string {
  return setup.label === "" ? chain.label : `${setup.label}|${chain.label}`;
}

/** Every line of a turn as a plain list, for callers that simulate each candidate themselves. */
export function flattenTurnCandidates(candidates: readonly ActionSequenceCandidate[] | FactoredTurnCandidates): readonly ActionSequenceCandidate[] {
  if (Array.isArray(candidates)) return candidates as readonly ActionSequenceCandidate[];
  return (candidates as FactoredTurnCandidates).groups.flatMap((group) =>
    group.setups.flatMap((setup) => group.chains.map((chain) => ({ label: lineLabel(setup, chain), actions: [...setup.actions, ...chain.actions] }))));
}

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
  /**
   * Coarse-then-fine width: per turn, every setup (the skills, Mystic Code skills and Order Change
   * before the first attack) is first scored with one representative attack chain, and only the
   * best `fineSetupCount` setups across the whole frontier get every chain simulated. A value at
   * least the number of setups makes the turn exhaustive. Default 32.
   */
  readonly fineSetupCount?: number;
  /**
   * Whether a face card or Extra Attack may land the blow that clears a wave. `false` keeps only
   * lines whose waves fall to NPs, which do not depend on the next turn's dealt hand. Default
   * `true`.
   */
  readonly faceCardFinishes?: boolean;
  /**
   * Keep only the best line per setup from each retained line, so the beam holds different plans
   * rather than copies of one plan with different face cards. Default `false`.
   */
  readonly bestLinePerSetup?: boolean;
}

const DEFAULT_BEAM_WIDTH = 256;
const DEFAULT_FINE_SETUP_COUNT = 32;

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
  const fineSetupCount = options.fineSetupCount ?? DEFAULT_FINE_SETUP_COUNT;
  if (!Number.isInteger(fineSetupCount) || fineSetupCount < 1) {
    throw new RangeError(`fineSetupCount must be a positive integer, got ${fineSetupCount}`);
  }
}

/** The beam before any turn has been searched: the starting state alone. */
export function startBeam(initialState: BattleState, scoreFn: SequenceScoreFn): readonly BeamEntry[] {
  return [{ label: "", turnActions: [], state: initialState, attackerIds: new Set(), score: scoreFn(initialState, initialState) }];
}

/**
 * Best score first. Among equal scores (e.g. every line that cleared the wave), the line that kept
 * more resources: less total skill cooldown left to wait out, then more NP gauge. Without this,
 * ties are kept in arbitrary order and a line that saved its charge skills for later turns can
 * fall out of the beam.
 */
const byScoreDescending = (a: BeamEntry, b: BeamEntry): number =>
  b.score - a.score || totalCooldown(a.state) - totalCooldown(b.state) || totalNpGauge(b.state) - totalNpGauge(a.state);

function totalCooldown(state: BattleState): number {
  return state.servants.reduce((sum, servant) => sum + servant.skillCooldowns[0] + servant.skillCooldowns[1] + servant.skillCooldowns[2], 0);
}

function totalNpGauge(state: BattleState): number {
  return state.servants.reduce((sum, servant) => sum + servant.currentNpGauge, 0);
}

/** One attack chain after a setup; `full` is the caller's own candidate when it was given unfactored. */
interface Chain {
  readonly label: string;
  readonly actions: readonly Action[];
  readonly full?: ActionSequenceCandidate;
}

/** One distinct setup reached from one retained line, with the attack chains that may follow it. */
interface SetupGroup {
  readonly branch: BeamEntry;
  readonly setup: ActionSequenceCandidate;
  readonly setupState: BattleState;
  readonly chains: readonly Chain[];
}

/**
 * Searches one more turn from every retained line and keeps the best `beamWidth`. Each setup
 * (the actions before the first attack) is simulated once per line. Coarse-then-fine
 * (research/09 §4): each setup is first scored with one representative chain — the first legal
 * one casting the most ready NPs — and only the best `fineSetupCount` setups across the frontier
 * have every chain simulated. Chains that differ only in face cards played after the wave is
 * already cleared lead to the same battle, so only the first is kept. Lines over the attacker
 * cap, unavailable lines, and chains casting an NP that is not full after the setup are dropped.
 * The frontier after turn N depends only on the turns searched so far, never on how many turns a
 * caller will eventually search, so callers may stop or continue at any turn.
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
  const fineSetupCount = options.fineSetupCount ?? DEFAULT_FINE_SETUP_COUNT;
  const groups: SetupGroup[] = [];
  for (const branch of frontier) {
    for (const { setup, chains } of setupsAndChains(buildCandidatesForTurn(branch.state, turnIndex))) {
      const setupState = simulateOrUnavailable(branch.state, setup.actions, 0, setup.actions.length, constants, randomFn);
      if (setupState === null) continue;
      const usable = chains.filter((chain) =>
        !hasUnreadyNp(setupState, chain.actions) &&
        (options.maxAttackerCount === undefined || new Set([...branch.attackerIds, ...attackingServantIds(chain.actions)]).size <= options.maxAttackerCount));
      if (usable.length > 0) groups.push({ branch, setup, setupState, chains: usable });
    }
  }

  // Only one line per identical battle state with the same attackers keeps a beam slot (they have
  // the same future), and with `bestLinePerSetup` only the best line per setup: otherwise ties
  // (every line that cleared the wave) crowd the beam with copies of one plan that differ only in
  // face cards, and a plan that saved its charge skills for later turns falls out.
  const bestBySetup = new Map<SetupGroup | BeamEntry, BeamEntry>();
  const trimToBeam = (): BeamEntry[] => {
    const ranked = [...bestBySetup.entries()].sort(([, a], [, b]) => byScoreDescending(a, b));
    const seen = new Set<string>();
    const kept: BeamEntry[] = [];
    bestBySetup.clear();
    for (const [group, entry] of ranked) {
      const key = `${battleStateKey(entry.state)}|${[...entry.attackerIds].sort().join()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(entry);
      bestBySetup.set(group, entry);
      if (kept.length === beamWidth) break;
    }
    return kept;
  };
  const keep = (setupGroup: SetupGroup, entry: BeamEntry | null): void => {
    if (entry === null) return;
    const group = options.bestLinePerSetup === true ? setupGroup : entry;
    const current = bestBySetup.get(group);
    if (current !== undefined && byScoreDescending(current, entry) <= 0) return;
    bestBySetup.set(group, entry);
    if (bestBySetup.size >= beamWidth * 2) trimToBeam();
  };
  const faceCardFinishes = options.faceCardFinishes ?? true;
  const simulateLine = (group: SetupGroup, chain: Chain, seenAfterClear?: Set<string>): BeamEntry | null => {
    let state = group.setupState;
    for (let index = 0; index < chain.actions.length; index += 1) {
      const next = simulateOrUnavailable(state, chain.actions, index, index + 1, constants, randomFn);
      if (next === null) return null;
      if (!faceCardFinishes && isFaceCard(chain.actions[index] as Action) && !waveCleared(state) && waveCleared(next)) return null;
      state = next;
      if (seenAfterClear !== undefined && waveCleared(state) && chain.actions.slice(index + 1).every(isFaceCard)) {
        const key = clearedChainKey(chain.actions, index);
        if (seenAfterClear.has(key)) return null;
        seenAfterClear.add(key);
        seenAfterClear = undefined;
      }
    }
    const stateAfterTurn = resolveAction(state, { type: "endTurn" }, constants, randomFn);
    const candidate = chain.full ?? { label: lineLabel(group.setup, chain), actions: [...group.setup.actions, ...chain.actions] };
    return {
      label: group.branch.label === "" ? candidate.label : `${group.branch.label}>>${candidate.label}`,
      turnActions: [...group.branch.turnActions, candidate.actions],
      state: stateAfterTurn,
      attackerIds: new Set([...group.branch.attackerIds, ...attackingServantIds(chain.actions)]),
      score: scoreFn(stateAfterTurn, initialState),
    };
  };
  const searchEveryChain = (group: SetupGroup, alreadyKept?: Chain): void => {
    const seenAfterClear = new Set<string>();
    if (alreadyKept !== undefined) simulateLine(group, alreadyKept, seenAfterClear);
    for (const chain of group.chains) if (chain !== alreadyKept) keep(group, simulateLine(group, chain, seenAfterClear));
  };

  if (groups.length <= fineSetupCount) {
    for (const group of groups) searchEveryChain(group);
  } else {
    const coarse: { readonly group: SetupGroup; readonly entry: BeamEntry; readonly representative: Chain }[] = [];
    for (const group of groups) {
      const representatives = [...group.chains].sort((a, b) => npCastCount(b.actions) - npCastCount(a.actions));
      for (const representative of representatives) {
        const entry = simulateLine(group, representative);
        if (entry === null) continue;
        coarse.push({ group, entry, representative });
        keep(group, entry);
        break;
      }
    }
    coarse.sort((a, b) => byScoreDescending(a.entry, b.entry));
    for (const { group, representative } of coarse.slice(0, fineSetupCount)) searchEveryChain(group, representative);
  }
  return trimToBeam();
}

/** Everything about a battle that can change between turns (the quest's static waves left out). */
function battleStateKey(state: BattleState): string {
  return JSON.stringify(state, (key, value: unknown) => (key === "waves" ? undefined : value instanceof Set ? [...value] : value));
}

/** Normalizes a turn's candidates into setups with their chains; an unfactored list is grouped by shared setup action objects. */
function setupsAndChains(candidates: readonly ActionSequenceCandidate[] | FactoredTurnCandidates): readonly { readonly setup: ActionSequenceCandidate; readonly chains: readonly Chain[] }[] {
  if (!Array.isArray(candidates)) {
    return (candidates as FactoredTurnCandidates).groups.flatMap((group) => group.setups.map((setup) => ({ setup, chains: group.chains })));
  }
  const ids = new Map<Action, number>();
  const byKey = new Map<string, { readonly setup: ActionSequenceCandidate; readonly chains: Chain[] }>();
  for (const candidate of candidates as readonly ActionSequenceCandidate[]) {
    const firstAttack = candidate.actions.findIndex(isAttack);
    const setupLength = firstAttack < 0 ? candidate.actions.length : firstAttack;
    const prefix = candidate.actions.slice(0, setupLength);
    const key = prefix.map((action) => {
      if (!ids.has(action)) ids.set(action, ids.size);
      return ids.get(action);
    }).join(",");
    let entry = byKey.get(key);
    if (entry === undefined) {
      entry = { setup: { label: "", actions: prefix }, chains: [] };
      byKey.set(key, entry);
    }
    entry.chains.push({ label: candidate.label, actions: candidate.actions.slice(setupLength), full: candidate });
  }
  return [...byKey.values()];
}

function npCastCount(actions: readonly Action[]): number {
  return actions.filter((action) => action.type === "castNp").length;
}

function isFaceCard(action: Action): boolean {
  return action.type === "playCard" || action.type === "playExtraCard";
}

/** Every enemy of the current wave is down (a break-bar enemy is already replaced by its next bar). */
function waveCleared(state: BattleState): boolean {
  return state.enemies.every((enemy) => enemy.currentHp <= 0);
}

/**
 * What decides the battle once the wave is cleared at `clearIndex`: the attacks up to it and
 * the chain's card makeup (Buster/Arts/Quick/Brave/Mighty classification and the Extra Attack
 * depend on which cards are in the chain, not their order). Face cards played afterwards hit
 * nothing.
 */
function clearedChainKey(actions: readonly Action[], clearIndex: number): string {
  const prefix = actions.slice(0, clearIndex + 1).map((action) =>
    action.type === "playCard" ? `c${action.handCardIndex}` : action.type === "castNp" ? `n${action.servantId}` : action.type === "playExtraCard" ? "x" : action.type);
  const first = actions.find(isAttack);
  const chainCards = first !== undefined && "chainCards" in first
    ? first.chainCards.map((card) => `${String(card.type)}:${card.servantId}:${"isNp" in card && card.isNp === true ? 1 : 0}`).sort()
    : [];
  return `${prefix.join(",")}#${chainCards.join(",")}`;
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
function hasUnreadyNp(setupState: BattleState, actions: readonly Action[], setupLength = 0): boolean {
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
