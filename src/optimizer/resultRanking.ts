import type { Action, DerivedHitContext } from "../battle/action.js";
import type { BattleState } from "../battle/battleState.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { isQuestCleared } from "../battle/turnLoop.js";
import { partyMemberBattleId, type PartyMemberSpec } from "./battleStateBuilder.js";
import type { ReliabilityEstimate } from "./reliability.js";
import { simulateActionSequence, type ActionSequenceResult, type SequenceScoreFn } from "./turnSearch.js";

export interface QuestResultAttribution {
  /** Damage dealers whose damage is causally required for this exact line to clear/progress. */
  readonly attackerIds: readonly number[];
  /** Greatest causal damage contribution among `attackerIds`. */
  readonly primaryAttackerId?: number;
  /** Party members whose complete modeled contribution is causally required. */
  readonly coreServantIds: readonly number[];
}

export interface RankedQuestCandidate {
  readonly party: readonly PartyMemberSpec[];
  readonly initialState: BattleState;
  readonly best: ActionSequenceResult;
  readonly attribution: QuestResultAttribution;
  /** Stable grouping key that ignores face-card order, crit RNG, and CE assignment noise. */
  readonly strategyKey: string;
  readonly reliability?: ReliabilityEstimate;
}

export interface QuestOptimizerPreferences {
  readonly preferredAttackerId?: number;
  readonly eventCeIds?: readonly number[];
  readonly bondCeIds?: readonly number[];
  readonly minimizeCost?: boolean;
}

function zeroDamageContext(context: DerivedHitContext): DerivedHitContext {
  return { ...context, suppressDamage: true, offensiveNPRate: 0, baseStarRate: -1000 };
}

function withoutServantContribution(action: Action, servantId: number, includeSupportContribution: boolean): readonly Action[] {
  if (action.type === "playCard" || action.type === "playExtraCard") {
    return action.servantId === servantId ? [{ ...action, context: zeroDamageContext(action.context) }] : [action];
  }
  if (action.type === "castNp") {
    if (action.servantId !== servantId) return [action];
    return [{
      ...action,
      context: zeroDamageContext(action.context),
      ...(action.hitContexts === undefined ? {} : { hitContexts: action.hitContexts.map(zeroDamageContext) }),
      ...(action.targetHitContexts === undefined
        ? {}
        : { targetHitContexts: action.targetHitContexts.map((plan) => ({ ...plan, hitContexts: plan.hitContexts.map(zeroDamageContext) })) }),
      ...(includeSupportContribution ? { effectsBeforeDamage: [], effects: [] } : {}),
    }];
  }
  if (!includeSupportContribution) return [action];
  if (action.type === "useSkill" && action.servantId === servantId) return [];
  if (action.type === "orderChange" && (action.outgoingServantId === servantId || action.incomingServantId === servantId)) return [];
  return [action];
}

function replayCounterfactual(
  candidate: Pick<RankedQuestCandidate, "initialState" | "best">,
  servantId: number,
  includeSupportContribution: boolean,
  constants: BattleConstants,
  randomFn: () => number,
): BattleState | undefined {
  const actions = candidate.best.actions.flatMap((action) => withoutServantContribution(action, servantId, includeSupportContribution));
  try {
    return simulateActionSequence(candidate.initialState, actions, constants, randomFn);
  } catch {
    return undefined;
  }
}

function causallyWorse(baseline: BattleState, counterfactual: BattleState | undefined, initialState: BattleState, scoreFn: SequenceScoreFn): boolean {
  if (counterfactual === undefined) return true;
  if (isQuestCleared(baseline)) return !isQuestCleared(counterfactual);
  return scoreFn(counterfactual, initialState) < scoreFn(baseline, initialState) - Number.EPSILON;
}

function mainStrategyKey(actions: readonly Action[]): string {
  const turns: string[][] = [[]];
  for (const action of actions) {
    if (action.type === "endTurn") {
      turns.push([]);
      continue;
    }
    const turn = turns[turns.length - 1] as string[];
    if (action.type === "castNp") turn.push(`np:${action.servantId}`);
    else if (action.type === "playCard" || action.type === "playExtraCard") turn.push(`face:${action.servantId}`);
    else if (action.type === "useSkill") turn.push(`skill:${action.servantId}:${action.skillSlot}`);
    else if (action.type === "useMysticCodeSkill") turn.push(`mc:${action.slot}`);
    else if (action.type === "orderChange") turn.push(`swap:${action.outgoingServantId}:${action.incomingServantId}`);
    else if (action.type === "useCommandSeal") turn.push(`seal:${action.effect.kind}`);
  }
  return turns
    .filter((turn) => turn.length > 0)
    .map((turn) => {
      const setup = turn.filter((entry) => !entry.startsWith("face:") && !entry.startsWith("np:"));
      const nps = turn.filter((entry) => entry.startsWith("np:"));
      const faceCounts = new Map<string, number>();
      for (const entry of turn.filter((candidate) => candidate.startsWith("face:"))) {
        faceCounts.set(entry, (faceCounts.get(entry) ?? 0) + 1);
      }
      const faces = [...faceCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([entry, count]) => `${entry}x${count}`);
      return [...setup, ...nps, ...faces].join(",");
    })
    .join(">");
}

export function attributeQuestCandidate(
  candidate: Pick<RankedQuestCandidate, "party" | "initialState" | "best">,
  constants: BattleConstants,
  randomFn: () => number,
  scoreFn: SequenceScoreFn,
): RankedQuestCandidate {
  const damageActors = new Set<number>();
  for (const action of candidate.best.actions) {
    if (action.type === "playCard" || action.type === "playExtraCard" || action.type === "castNp") damageActors.add(action.servantId);
  }

  const scoreLossByAttacker = new Map<number, number>();
  const attackerIds = [...damageActors].filter((servantId) => {
    const counterfactual = replayCounterfactual(candidate, servantId, false, constants, randomFn);
    const counterfactualScore = counterfactual === undefined ? Number.NEGATIVE_INFINITY : scoreFn(counterfactual, candidate.initialState);
    scoreLossByAttacker.set(servantId, candidate.best.score - counterfactualScore);
    return causallyWorse(candidate.best.finalState, counterfactual, candidate.initialState, scoreFn);
  }).sort((a, b) => a - b);

  const primaryAttackerId = [...attackerIds].sort((a, b) =>
    (scoreLossByAttacker.get(b) ?? 0) - (scoreLossByAttacker.get(a) ?? 0) || a - b,
  )[0];
  const coreServantIds = candidate.party
    .map(partyMemberBattleId)
    .filter((servantId) => causallyWorse(
      candidate.best.finalState,
      replayCounterfactual(candidate, servantId, true, constants, randomFn),
      candidate.initialState,
      scoreFn,
    ))
    .sort((a, b) => a - b);
  const coreKey = (coreServantIds.length > 0 ? coreServantIds : candidate.party.map(partyMemberBattleId).sort((a, b) => a - b)).join("-");
  const attribution: QuestResultAttribution = {
    attackerIds,
    ...(primaryAttackerId === undefined ? {} : { primaryAttackerId }),
    coreServantIds,
  };
  return { ...candidate, attribution, strategyKey: `${coreKey}|${mainStrategyKey(candidate.best.actions)}` };
}

function ceCount(candidate: RankedQuestCandidate, ids: readonly number[] | undefined): number {
  if (ids === undefined || ids.length === 0) return 0;
  const eligible = new Set(ids);
  return candidate.party.filter((member) => member.equippedCe !== undefined && eligible.has(member.equippedCe.data.id)).length;
}

export function rankQuestCandidates(
  candidates: readonly RankedQuestCandidate[],
  preferences: QuestOptimizerPreferences = {},
): readonly RankedQuestCandidate[] {
  return [...candidates].sort((a, b) => {
    const aCleared = isQuestCleared(a.best.finalState);
    const bCleared = isQuestCleared(b.best.finalState);
    if (aCleared !== bCleared) return aCleared ? -1 : 1;
    if (!aCleared && a.best.score !== b.best.score) return b.best.score - a.best.score;
    if (
      a.reliability !== undefined &&
      b.reliability !== undefined &&
      a.reliability.clearProbability !== b.reliability.clearProbability
    ) {
      return b.reliability.clearProbability - a.reliability.clearProbability;
    }
    if (a.attribution.attackerIds.length !== b.attribution.attackerIds.length) {
      return a.attribution.attackerIds.length - b.attribution.attackerIds.length;
    }
    if (a.best.score !== b.best.score) return b.best.score - a.best.score;
    if (preferences.preferredAttackerId !== undefined) {
      const aPreferred = a.attribution.primaryAttackerId === preferences.preferredAttackerId;
      const bPreferred = b.attribution.primaryAttackerId === preferences.preferredAttackerId;
      if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    }
    const eventDifference = ceCount(b, preferences.eventCeIds) - ceCount(a, preferences.eventCeIds);
    if (eventDifference !== 0) return eventDifference;
    const bondDifference = ceCount(b, preferences.bondCeIds) - ceCount(a, preferences.bondCeIds);
    if (bondDifference !== 0) return bondDifference;
    if (preferences.minimizeCost && a.initialState.costSpent !== b.initialState.costSpent) {
      return a.initialState.costSpent - b.initialState.costSpent;
    }
    return a.strategyKey.localeCompare(b.strategyKey);
  });
}

export function selectDiverseQuestCandidates(
  candidates: readonly RankedQuestCandidate[],
  preferences: QuestOptimizerPreferences = {},
  limit = 5,
): readonly RankedQuestCandidate[] {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`result limit must be a positive integer, got ${limit}`);
  const seen = new Set<string>();
  const selected: RankedQuestCandidate[] = [];
  for (const candidate of rankQuestCandidates(candidates, preferences)) {
    if (seen.has(candidate.strategyKey)) continue;
    seen.add(candidate.strategyKey);
    selected.push(candidate);
    if (selected.length === limit) break;
  }
  return selected;
}
