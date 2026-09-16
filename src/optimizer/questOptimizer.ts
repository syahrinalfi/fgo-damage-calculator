import { Card, type NoblePhantasm, type Servant as ServantModule } from "@atlasacademy/api-connector";
import type { ServantBuild } from "../account/types.js";
import type { BattleState, EnemyInstance, EquippedCraftEssence, HandCard } from "../battle/battleState.js";
import type { Action, DerivedHitContext } from "../battle/action.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { FRONT_LINE_SERVANT_COUNT } from "../battle/cardDeck.js";
import { resolveCardHitContext } from "../battle/hitContextResolver.js";
import { resolveOrderChangeSwapOptions } from "../battle/orderChangeSwapResolver.js";
import { resolveSkillActivationOptions, type ServantSkillSource } from "../battle/skillActivationResolver.js";
import { isQuestCleared } from "../battle/turnLoop.js";
import type { Wave } from "../quest/types.js";
import { buildInitialBattleState, type PartyMemberSpec } from "./battleStateBuilder.js";
import { enumerateCeAssignments, enumeratePartyFormations } from "./candidateGeneration.js";
import { buildAttackChainCandidates, type NpAttackOption } from "./cardOrderCandidates.js";
import { resolveNpAttackOption } from "./npActivationResolver.js";
import { searchMultiTurnActionSequences, type MultiTurnResult } from "./multiTurnSearch.js";
import { questProgress } from "./objectives.js";
import { buildOrderChangeCandidates, type OrderChangeSwap } from "./orderChangeCandidates.js";
import { buildSkillAndCardOrderCandidates, type SkillActivation } from "./skillUsageCandidates.js";
import { searchBestActionSequence, type ActionSequenceCandidate, type ActionSequenceResult, type SequenceScoreFn } from "./turnSearch.js";

/** One shortlisted servant a caller wants the search to consider fielding — not yet tied to a CE or front-line/bench role, both decided per enumerated combination. */
export interface ServantCandidate {
  readonly niceServant: ServantModule.Servant;
  readonly build: ServantBuild;
}

export interface QuestOptimizerOptions {
  /** User-shortlisted pool (research/09 §4's "candidate servant subset, ≤6, user-shortlisted") — every `FRONT_LINE_SERVANT_COUNT`-sized (plus up to `maxBenchCount` benched) combination of this is tried (`enumeratePartyFormations`, `./candidateGeneration.js`). */
  readonly shortlist: readonly ServantCandidate[];
  /** Owned CE copies eligible to equip — every no-reuse assignment of this pool to every fielded slot (front-line plus any benched sub-members) is tried (`enumerateCeAssignments`), including leaving a slot bare. */
  readonly cePool: readonly EquippedCraftEssence[];
  readonly waves: readonly Wave[];
  readonly costBudget: number;
  readonly constants: BattleConstants;
  /**
   * Resolves one hand slot's already-level-resolved hit context (`npDamageMultiplier`/
   * `offensiveNPRate`/`baseStarRate`/etc.) — hand-rolled by the caller, or omit this and
   * supply `npGainByServantId` instead to let `optimizeQuest` build it automatically via
   * `resolveCardHitContext` (`../battle/hitContextResolver.js`). Exactly one of the two must
   * end up available (supplying neither throws; supplying both prefers this explicit
   * resolver, since a manual override always wins over the automatic path). `.card.position`
   * is ignored either way (`buildCardOrderCandidates` overwrites it per ordering).
   */
  readonly resolveHitContext?: (handCard: HandCard) => DerivedHitContext;
  /**
   * Raw NP-gain data source for the automatic hit-context resolver (`resolveCardHitContext`)
   * — supply this *instead of* `resolveHitContext` to auto-resolve every hand slot's
   * `DerivedHitContext` from account/NP data rather than hand-rolling the resolver. Ignored
   * when `resolveHitContext` is supplied. See that option's own doc comment for the
   * "exactly one of the two" requirement.
   */
  readonly npGainByServantId?: (servantId: number) => NoblePhantasm.NoblePhantasmGain;
  /**
   * Resolves this party candidate's available (off-cooldown) skill/Mystic Code skill
   * activations (research/09 §4's "skill-usage plan per turn" axis) as fully-resolved
   * `SkillActivation`s — same "already-resolved input" convention as `resolveHitContext`.
   * Receives the current turn's own `BattleState` so targets/servantIds can reference the
   * actual fielded servants for this combination — this is the party's just-built
   * `initialState` for a single-turn search (`turnCount` omitted), or *that turn's own*
   * post-`endTurn` state (fresh cooldowns/hand already reflected) for each turn of a
   * multi-turn search (`turnCount` supplied, `./multiTurnSearch.js`). Every subset of the
   * returned list is tried (`enumerateSkillUsageSubsets`, `./candidateGeneration.js`), each
   * crossed with every card-order candidate (`./skillUsageCandidates.js`) — omit this option
   * entirely (the default) to search the card-order axis alone, unchanged from before this
   * option existed.
   */
  readonly resolveSkillOptions?: (state: BattleState) => readonly SkillActivation[];
  /**
   * Raw skill data source for the automatic skill-usage resolver
   * (`resolveSkillActivationOptions`, `../battle/skillActivationResolver.js`) — supply this
   * *instead of* `resolveSkillOptions` to auto-resolve every fielded servant's off-cooldown
   * skills from raw `NiceSkill` data rather than hand-rolling the resolver. Ignored when
   * `resolveSkillOptions` is supplied; omitting both this and `resolveSkillOptions` searches
   * without the skill-usage axis at all, unchanged from before either option existed.
   */
  readonly skillSources?: readonly ServantSkillSource[];
  /** Caller-resolved NP cards available to the three-slot attack-chain search. Return the servant's chosen NP version even before charge skills resolve; unavailable no-charge branches are pruned by the simulator while charged branches remain searchable. */
  readonly resolveNpOptions?: (state: BattleState, targetEnemy: EnemyInstance) => readonly NpAttackOption[];
  /** Explicit selected NiceNp version per servant for the automatic NP resolver. This never guesses strengthening availability; account/UI code must choose the version matching the user's unlocked state. Ignored when `resolveNpOptions` is supplied. */
  readonly npByServantId?: (servantId: number) => NoblePhantasm.NoblePhantasm | undefined;
  /** Passthrough for the automatic skill-usage resolver's own `defaultTargetServantId` config — see that resolver's doc comment. Ignored unless `skillSources` is actually used (i.e. `resolveSkillOptions` is omitted). */
  readonly defaultTargetServantId?: (actingServantId: number) => number;
  /**
   * Resolves this party candidate's available (off-cooldown, live-sub-member) Order Change
   * swaps (research/09 §4's final "Order-Change-timing" axis) as fully-resolved
   * `OrderChangeSwap`s — same "already-resolved input" convention as `resolveHitContext`/
   * `resolveSkillOptions`, called with the same per-turn state described on that option
   * (this party's `initialState` for a single turn, or each turn's own post-`endTurn` state
   * for a multi-turn search). Every swap is tried at both timings relative to the skill-usage
   * plan (`enumerateOrderChangeTimings`, `./candidateGeneration.js`), always resolved before
   * any card is played (see that function's own doc comment for why) — omit this option
   * entirely (the default) to search without the Order-Change axis, unchanged from before
   * this option existed.
   */
  readonly resolveOrderChangeOptions?: (state: BattleState) => readonly OrderChangeSwap[];
  /**
   * Raw flag for the automatic Order-Change resolver (`resolveOrderChangeSwapOptions`,
   * `../battle/orderChangeSwapResolver.js`) — supply this *instead of*
   * `resolveOrderChangeOptions` to auto-enumerate every front-line × bench swap once the
   * account's equipped Mystic Code's 3rd skill slot (`hasOrderChangeMysticCodeSkill: true`)
   * is off cooldown, rather than hand-rolling the resolver. Ignored when
   * `resolveOrderChangeOptions` is supplied; omitting both searches without the Order-Change
   * axis at all, unchanged from before either option existed.
   */
  readonly hasOrderChangeMysticCodeSkill?: boolean;
  /**
   * Maximum benched sub-members to field alongside the exactly-`FRONT_LINE_SERVANT_COUNT`
   * front-line servants (research/00 §4's "up to 3 sub-members") — every party size from
   * `FRONT_LINE_SERVANT_COUNT` up to `FRONT_LINE_SERVANT_COUNT + maxBenchCount` is tried
   * (`enumeratePartyFormations`, `./candidateGeneration.js`). Defaults to `0` — exactly the
   * front-line-only search this project had before this option existed. A fielded bench slot
   * still draws from `cePool` and counts toward `costBudget` the same as a front-line slot
   * (research/09 §1's "the party actually fielded," not a front-line-only bookkeeping split)
   * — meaningful once `resolveOrderChangeOptions` can swap a bench member in mid-turn.
   */
  readonly maxBenchCount?: number;
  /**
   * Number of turns to search as one horizon (research/09 §5's ST Burst Finder multi-turn
   * specialization) — **omitting this option entirely** keeps this project's original
   * single-turn search byte-for-byte (`searchBestActionSequence`, `./turnSearch.js`:
   * `best.finalState` is the state right after this turn's actions, `endTurn` never applied).
   * Supplying it (any value ≥ 0, including `1`) instead routes through
   * `searchMultiTurnActionSequences` (`./multiTurnSearch.js`): an `endTurn` `Action` is
   * applied after each turn's chosen candidate before the next turn's candidates are built,
   * so `resolveHitContext`/`resolveSkillOptions`/`resolveOrderChangeOptions` and the target
   * enemy are all re-resolved fresh from *that* turn's own post-`endTurn` state — cooldowns,
   * redrawn hand, and a shifted/dead target enemy are picked up naturally, no special-casing
   * needed here. `best.actions` for a multi-turn result is the full horizon's actions
   * flattened turn by turn with an explicit `endTurn` inserted after each one (including the
   * last), so `best.finalState` is always exactly what replaying `best.actions` against
   * `initialState` would produce. `scoreFn` is applied once, at the end of the full horizon,
   * not per turn — see `searchMultiTurnActionSequences`'s own doc comment for why a per-turn
   * greedy score would be wrong for exactly the scenario this option exists for.
   */
  readonly turnCount?: number;
  /** Initially selected enemy slot. Omit to use the rightmost living slot (view order 1..N, fallback priority N..1) on every wave. */
  readonly targetEnemySlotIndex?: number;
  /** Overrides the default normalized whole-quest progress objective. */
  readonly scoreFn?: SequenceScoreFn;
  readonly commandSealsRemaining?: number;
  readonly fieldTraits?: ReadonlySet<number>;
  readonly randomFn?: () => number;
}

/** One party-formation × CE-assignment party candidate (front-line plus any benched sub-members), together with its best found card-play-order line. */
export interface QuestOptimizerCandidate {
  readonly party: readonly PartyMemberSpec[];
  readonly initialState: BattleState;
  readonly best: ActionSequenceResult;
}

/**
 * The top-level "optimize this quest" entry point research/09 §4 originally described,
 * finally wiring every piece built this session together in one call: `enumerateServantSubsets`
 * / `enumerateCeAssignments` (`./candidateGeneration.js`) generate every party combination,
 * `buildInitialBattleState` (`./battleStateBuilder.js`) turns each into a real `BattleState`,
 * `buildCardOrderCandidates` (`./cardOrderCandidates.js`) generates that state's card-play-order
 * lines, and `searchBestActionSequence` (`./turnSearch.js`) ranks them — this function's own job
 * is purely the outer loop tying those together and picking each party's best line.
 *
 * Returns every valid party combination's best result, **ranked descending by score, not
 * deduplicated** — research/09 §4's "Top-5 diversity" (collapsing near-identical lines to the
 * same 3 core servants) is a caller-side concern the same way `searchBestActionSequence`
 * already leaves ranking-vs-deduplication split; this function returns the full ranked list,
 * the caller decides how many/which to surface. A combination is silently skipped (not
 * included in the result) when either: its `costSpent` exceeds `costBudget` (an invalid line,
 * not worth simulating at all — filtered before `buildCardOrderCandidates` even runs) or the
 * quest's first wave has no enemies to target at all.
 *
 * All 5 of research/09 §4's search-space axes are searchable: servant subset/CE assignment
 * always (including the bench axis via `enumeratePartyFormations`, opt-in through
 * `maxBenchCount`), card-order always, skill-usage plan when `resolveSkillOptions` is
 * supplied (`./skillUsageCandidates.js`), and Order-Change-timing when
 * `resolveOrderChangeOptions` is supplied (`./orderChangeCandidates.js`). §5's multi-turn
 * horizon is searchable too, opt-in through `turnCount` (`./multiTurnSearch.js`) — every
 * optional axis remains opt-in, so omitting any of them searches exactly what the search
 * covered before that option existed.
 */
/**
 * Flattens a `MultiTurnResult` (`./multiTurnSearch.js`) into the same `ActionSequenceResult`
 * shape a single-turn search already produces — `endTurn` is itself a first-class modeled
 * `Action` (`../battle/action.js`), so inserting one after each turn's own chosen actions
 * (including the last) makes `actions` a literal, replayable log: simulating `actions` against
 * `initialState` reproduces `finalState` exactly, the same invariant a single-turn
 * `ActionSequenceResult` already has.
 */
function toActionSequenceResult(multiTurnResult: MultiTurnResult): ActionSequenceResult {
  const actions: Action[] = multiTurnResult.turnActions.flatMap((turnActions) => [...turnActions, { type: "endTurn" }]);
  return { label: multiTurnResult.label, actions, finalState: multiTurnResult.finalState, score: multiTurnResult.score };
}

export function optimizeQuest(options: QuestOptimizerOptions): readonly QuestOptimizerCandidate[] {
  if (options.resolveHitContext === undefined && options.npGainByServantId === undefined) {
    throw new RangeError("optimizeQuest requires either options.resolveHitContext or options.npGainByServantId to be supplied");
  }

  const scoreFn = options.scoreFn ?? questProgress();
  const randomFn = options.randomFn ?? Math.random;

  // Each optional axis prefers an explicit caller-supplied resolver over its raw-data
  // auto-resolver counterpart (`../battle/skillActivationResolver.js`/`orderChangeSwapResolver.js`)
  // — a manual override always wins. Neither depends on the per-turn `state` a formation's
  // candidates are built from, so both are resolved once per `optimizeQuest` call rather than
  // rebuilt per party/turn.
  const resolveSkillOptionsFn =
    options.resolveSkillOptions ??
    (options.skillSources === undefined
      ? undefined
      : (state: BattleState) =>
          resolveSkillActivationOptions(state, options.skillSources as readonly ServantSkillSource[], {
            ...(options.defaultTargetServantId !== undefined ? { defaultTargetServantId: options.defaultTargetServantId } : {}),
          }));
  const resolveOrderChangeOptionsFn =
    options.resolveOrderChangeOptions ??
    (options.hasOrderChangeMysticCodeSkill === undefined
      ? undefined
      : (state: BattleState) => resolveOrderChangeSwapOptions(state, options.hasOrderChangeMysticCodeSkill as boolean));

  const formations = enumeratePartyFormations(options.shortlist, FRONT_LINE_SERVANT_COUNT, options.maxBenchCount ?? 0);

  // `enumerateCeAssignments` only depends on the fielded slot *count*, not which specific
  // servants fill it — many formations of the same total size (front-line + bench) share the
  // same count, so this is cached per size rather than recomputed per formation.
  const ceAssignmentsBySlotCount = new Map<number, readonly (readonly (EquippedCraftEssence | undefined)[])[]>();
  const ceAssignmentsForSlotCount = (slotCount: number): readonly (readonly (EquippedCraftEssence | undefined)[])[] => {
    const cached = ceAssignmentsBySlotCount.get(slotCount);
    if (cached !== undefined) return cached;
    const computed = enumerateCeAssignments(options.cePool, slotCount);
    ceAssignmentsBySlotCount.set(slotCount, computed);
    return computed;
  };

  const results: QuestOptimizerCandidate[] = [];
  for (const formation of formations) {
    const fielded = [...formation.frontLine, ...formation.bench];
    const ceAssignments = ceAssignmentsForSlotCount(fielded.length);
    for (const ceAssignment of ceAssignments) {
      const party: PartyMemberSpec[] = fielded.map((member, index) => {
        const equippedCe = ceAssignment[index];
        const isFrontLine = index < formation.frontLine.length;
        const base: PartyMemberSpec = { niceServant: member.niceServant, build: member.build, isFrontLine };
        return equippedCe === undefined ? base : { ...base, equippedCe };
      });

      const initialState = buildInitialBattleState(party, options.waves, {
        costBudget: options.costBudget,
        ...(options.commandSealsRemaining !== undefined ? { commandSealsRemaining: options.commandSealsRemaining } : {}),
        ...(options.fieldTraits !== undefined ? { fieldTraits: options.fieldTraits } : {}),
        randomFn,
      });

      if (initialState.costSpent > initialState.costBudget) continue;

      // Re-resolves the target enemy and every optional axis fresh from `state` (rather than
      // capturing `initialState` once) so a multi-turn search picks up a shifted/dead target,
      // newly off-cooldown skills, and a freshly-redrawn hand each turn with no special-casing
      // needed here — for a single-turn search (`turnCount` omitted), this is called exactly
      // once with `initialState` itself, so behavior is unchanged from before this option
      // existed.
      const buildCandidatesForState = (state: BattleState): readonly ActionSequenceCandidate[] => {
        const configuredTarget = options.targetEnemySlotIndex === undefined ? undefined : state.enemies[options.targetEnemySlotIndex];
        const targetEnemy = configuredTarget?.currentHp !== undefined && configuredTarget.currentHp > 0
          ? configuredTarget
          : [...state.enemies].reverse().find((enemy) => enemy.currentHp > 0);
        if (targetEnemy === undefined) return [];

        // Prefers the explicit `resolveHitContext` over the raw-data auto path — same
        // manual-wins-over-automatic precedence as the skill/order-change axes above. The
        // eager check at the top of this function already guarantees one of the two exists.
        const resolveHitContext: (handCard: HandCard) => DerivedHitContext =
          options.resolveHitContext ??
          ((handCard) => {
            const npGainByServantId = options.npGainByServantId as (servantId: number) => NoblePhantasm.NoblePhantasmGain;
            const actingServant = state.servants.find((s) => s.servantId === handCard.servantId);
            if (actingServant === undefined) {
              throw new RangeError(`No servant with servantId ${handCard.servantId} in this BattleState`);
            }
            return resolveCardHitContext(handCard, actingServant, npGainByServantId(handCard.servantId), targetEnemy, randomFn);
          });

        const buildForHand = (hand: BattleState["handCards"]): ReturnType<typeof buildAttackChainCandidates> => {
          const contextTemplates = hand.map(resolveHitContext);
          const npOptions =
            options.resolveNpOptions?.(state, targetEnemy) ??
            (options.npByServantId === undefined
              ? []
              : state.servants.flatMap((servant) => {
                  if (!servant.isFrontLine) return [];
                  const np = options.npByServantId?.(servant.servantId);
                  if (np === undefined) return [];
                  const resolved = resolveNpAttackOption(state, servant.servantId, np, targetEnemy.npcId, randomFn);
                  return resolved === undefined ? [] : [resolved];
                }));
          const cardCandidates = buildAttackChainCandidates(
            hand,
            contextTemplates,
            npOptions,
            targetEnemy.npcId,
            (servantId) => resolveHitContext({ card: Card.EXTRA, servantId }),
          );
          return resolveSkillOptionsFn === undefined ? cardCandidates : buildSkillAndCardOrderCandidates(resolveSkillOptionsFn(state), cardCandidates);
        };
        return resolveOrderChangeOptionsFn === undefined
          ? buildForHand(state.handCards)
          : buildOrderChangeCandidates(resolveOrderChangeOptionsFn(state), state.handCards, buildForHand);
      };

      let best: ActionSequenceResult | undefined;
      if (options.turnCount === undefined) {
        const candidates = buildCandidatesForState(initialState);
        const ranked = searchBestActionSequence(initialState, candidates, options.constants, randomFn, scoreFn);
        best = ranked[0];
      } else {
        const multiTurnResults = searchMultiTurnActionSequences(
          initialState,
          options.turnCount,
          buildCandidatesForState,
          options.constants,
          randomFn,
          scoreFn,
        );
        const bestMultiTurn = multiTurnResults[0];
        best = bestMultiTurn === undefined ? undefined : toActionSequenceResult(bestMultiTurn);
      }
      if (best === undefined) continue;

      results.push({ party, initialState, best });
    }
  }

  return results.sort((a, b) => b.best.score - a.best.score);
}

export interface MinimumTurnOptimizerOptions extends Omit<QuestOptimizerOptions, "turnCount"> {
  readonly maxTurns?: number;
}

export interface MinimumTurnOptimizerResult {
  readonly minimumTurns: number | null;
  readonly searchedThroughTurn: number;
  readonly candidates: readonly QuestOptimizerCandidate[];
}

/** Iterative-deepening Clear Quest search. Three turns is only a preset; the first actual full-quest clear wins, bounded by the product's 6-turn offensive-only cap. */
export function optimizeQuestMinimumTurns(options: MinimumTurnOptimizerOptions): MinimumTurnOptimizerResult {
  const { maxTurns = 6, ...questOptions } = options;
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 6) {
    throw new RangeError(`maxTurns must be an integer from 1 through 6, got ${maxTurns}`);
  }
  let closest: readonly QuestOptimizerCandidate[] = [];
  for (let turnCount = 1; turnCount <= maxTurns; turnCount += 1) {
    const candidates = optimizeQuest({ ...questOptions, turnCount });
    const cleared = candidates.filter((candidate) => isQuestCleared(candidate.best.finalState));
    if (cleared.length > 0) {
      return { minimumTurns: turnCount, searchedThroughTurn: turnCount, candidates: cleared };
    }
    closest = candidates;
  }
  return { minimumTurns: null, searchedThroughTurn: maxTurns, candidates: closest };
}
