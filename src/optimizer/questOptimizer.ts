import { Card, type NoblePhantasm, type Servant as ServantModule } from "@atlasacademy/api-connector";
import type { ServantBuild } from "../account/types.js";
import type { BattleState, EnemyInstance, EquippedCraftEssence, HandCard } from "../battle/battleState.js";
import type { Action, DerivedHitContext } from "../battle/action.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { FRONT_LINE_SERVANT_COUNT } from "../battle/cardDeck.js";
import { resolveCardHitContext } from "../battle/hitContextResolver.js";
import { resolveOrderChangeSwapOptions } from "../battle/orderChangeSwapResolver.js";
import { resolveSkillActivationOptions, type ServantSkillSource } from "../battle/skillActivationResolver.js";
import { isQuestCleared, resolveAction } from "../battle/turnLoop.js";
import type { Wave } from "../quest/types.js";
import { buildInitialBattleState, partyMemberBattleId, supportBattleId, type PartyMemberSpec } from "./battleStateBuilder.js";
import { enumerateDistinctCeAssignments, enumeratePartyFormations, type OrderChangeChoice } from "./candidateGeneration.js";
import { buildAttackChainCandidates, type NpAttackOption } from "./cardOrderCandidates.js";
import { resolveNpAttackOption } from "./npActivationResolver.js";
import { selectNoblePhantasmVersion } from "./npVersionSelection.js";
import {
  advanceBeam,
  attackingServantIds,
  rankBeam,
  searchMultiTurnActionSequences,
  startBeam,
  validateMultiTurnSearchOptions,
  flattenTurnCandidates,
  type FactoredTurnCandidates,
  type MultiTurnResult,
  type TurnCandidateGroup,
} from "./multiTurnSearch.js";
import { questProgress } from "./objectives.js";
import { buildOrderChangeGroups, type OrderChangeSwap } from "./orderChangeCandidates.js";
import { skillSourceFor } from "./rosterInputs.js";
import { buildSkillSetups, type SkillActivation } from "./skillUsageCandidates.js";
import { searchBestActionSequence, type ActionSequenceCandidate, type ActionSequenceResult, type SequenceScoreFn } from "./turnSearch.js";
import {
  attributeQuestCandidate,
  rankQuestCandidates,
  selectDiverseQuestCandidates,
  type QuestOptimizerPreferences,
  type RankedQuestCandidate,
} from "./resultRanking.js";
import { createSeededRandom, estimatePlayedLineReliability, randomizeAttack, validateReliabilityConfig, type ReliabilityConfig } from "./reliability.js";

/** One shortlisted servant a caller wants the search to consider fielding — not yet tied to a CE or front-line/bench role, both decided per enumerated combination. */
export interface ServantCandidate {
  readonly niceServant: ServantModule.Servant;
  readonly build: ServantBuild;
}

export interface QuestOptimizerOptions {
  /** User-shortlisted pool (research/09 §4's "candidate servant subset, ≤6, user-shortlisted") — every `FRONT_LINE_SERVANT_COUNT`-sized (plus up to `maxBenchCount` benched) combination of this is tried (`enumeratePartyFormations`, `./candidateGeneration.js`). */
  readonly shortlist: readonly ServantCandidate[];
  /**
   * Borrowed supports to consider, usually built with `buildBorrowedSupportCandidate`
   * (`./supportBuild.js`). Parties are searched with no support and with each candidate in any
   * one slot (front line or bench). A support never takes a CE from `cePool`, never counts
   * toward `costBudget`, and is keyed in battle by `supportBattleId` so it can share the field
   * with the owned copy of the same servant. The automatic `npGainByServantId`, `skillSources`
   * and NP paths resolve a support from its own data; explicit resolvers receive its battle id.
   */
  readonly supportCandidates?: readonly ServantCandidate[];
  /** Owned CE copies eligible to equip — every no-reuse assignment of this pool to every owned fielded slot (front-line plus any benched sub-members) is tried, including leaving a slot bare; copies with the same CE, level and limit break are interchangeable and tried once per arrangement (`enumerateDistinctCeAssignments`). */
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
  /** Explicit NiceNp override per servant. When omitted, the shortlisted servant's account build selects its legal NP version. Ignored when `resolveNpOptions` is supplied. */
  readonly npByServantId?: (servantId: number) => NoblePhantasm.NoblePhantasm | undefined;
  /**
   * Passthrough for the automatic skill-usage resolver's own `defaultTargetServantId` config — see that resolver's doc comment. Ignored unless `skillSources` is actually used (i.e. `resolveSkillOptions` is omitted).
   * When omitted, each turn is searched once per front-line servant as the focus target of every single-ally (`ptOne`) skill used that turn — how support skills are normally stacked on one attacker. Splitting single-ally skills across two different targets in one turn is not searched.
   */
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
  /** Beam retained after each simulated turn; defaults to a bounded 256-line frontier. */
  readonly beamWidth?: number;
  /** Setups per turn that get every attack chain searched (`MultiTurnSearchOptions.fineSetupCount`); defaults to 32 (8 for the quick level). */
  readonly fineSetupCount?: number;
  /**
   * How widely to search. `"thorough"` (default) tries every party, CE placement and single-ally
   * skill target. `"quick"` (search level 1) needs `preferences.preferredAttackerId`: it only
   * fields parties with that owned attacker on the front line, puts CEs on the attacker alone,
   * aims every single-ally skill at the attacker while it is on the field, and defaults to a
   * beam of 16 lines and 8 fully searched setups per turn.
   */
  readonly searchLevel?: "quick" | "thorough";
  /**
   * Let a face card or Extra Attack land a wave's clearing blow in multi-turn searches. Off by
   * default: a line that needs particular face cards on a later turn depends on that turn's
   * dealt hand, so by default every wave must fall to NPs (project owner's direction).
   */
  readonly allowFaceCardFinishes?: boolean;
  /**
   * Simulate every attack at the lowest damage roll (0.9) so a line only counts as a clear when it
   * clears even on low rolls. Card draws and crits are unchanged. Defaults to on for the quick
   * level, off otherwise.
   */
  readonly minimumDamageRoll?: boolean;
  /** Hard cap on distinct servants performing damaging actions across the searched line. */
  readonly maxAttackerCount?: number;
  readonly preferences?: QuestOptimizerPreferences;
  /** Number of coarse finalists that receive expensive causal replay. Defaults to 64. */
  readonly attributionPoolSize?: number;
  readonly commandSealsRemaining?: number;
  readonly fieldTraits?: ReadonlySet<number>;
  readonly randomFn?: () => number;
}

/** Copies of the same CE at the same level and limit break simulate identically, so the search tries one arrangement of them, not every copy order. */
function ceCopyKey(ce: EquippedCraftEssence): string {
  return `${ce.data.id}:${ce.level}:${ce.limitBreakCount ?? "-"}`;
}

interface PartySlot {
  readonly candidate: ServantCandidate;
  readonly isSupport: boolean;
}

/** A borrowed support's NP gain comes from its own legal NP version, not the caller's owned-roster lookup. */
function supportNpGainsByBattleId(party: readonly PartyMemberSpec[]): ReadonlyMap<number, NoblePhantasm.NoblePhantasmGain> {
  const gains = new Map<number, NoblePhantasm.NoblePhantasmGain>();
  for (const member of party) {
    if (member.isSupport !== true) continue;
    const np = selectNoblePhantasmVersion(member.niceServant.noblePhantasms ?? [], member.build);
    if (np === undefined) throw new RangeError(`Borrowed support ${member.build.servantId} has no legal Noble Phantasm`);
    gains.set(partyMemberBattleId(member), np.npGain);
  }
  return gains;
}

/** One party-formation × CE-assignment party candidate (front-line plus any benched sub-members), together with its best found card-play-order line. */
export type QuestOptimizerCandidate = RankedQuestCandidate;

/**
 * The top-level "optimize this quest" entry point research/09 §4 originally described,
 * finally wiring every piece built this session together in one call: `enumerateServantSubsets`
 * / `enumerateCeAssignments` (`./candidateGeneration.js`) generate every party combination,
 * `buildInitialBattleState` (`./battleStateBuilder.js`) turns each into a real `BattleState`,
 * `buildCardOrderCandidates` (`./cardOrderCandidates.js`) generates that state's card-play-order
 * lines, and `searchBestActionSequence` (`./turnSearch.js`) ranks them — this function's own job
 * is purely the outer loop tying those together and picking each party's best line.
 *
 * Coarsely ranks valid combinations, causally replays the bounded finalist pool, and returns
 * those attributed finalists in product ranking order. `optimizeQuestMinimumTurns` then applies
 * the user-facing Top-5 strategy deduplication. A combination is silently skipped (not
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

interface SearchSettings {
  readonly scoreFn: SequenceScoreFn;
  readonly randomFn: () => number;
  readonly attributionPoolSize: number;
}

function searchSettings(options: QuestOptimizerOptions): SearchSettings {
  if (options.resolveHitContext === undefined && options.npGainByServantId === undefined) {
    throw new RangeError("optimizeQuest requires either options.resolveHitContext or options.npGainByServantId to be supplied");
  }
  const attributionPoolSize = options.attributionPoolSize ?? 64;
  if (!Number.isInteger(attributionPoolSize) || attributionPoolSize < 1) {
    throw new RangeError(`attributionPoolSize must be a positive integer, got ${attributionPoolSize}`);
  }
  return { scoreFn: options.scoreFn ?? questProgress(), randomFn: options.randomFn ?? Math.random, attributionPoolSize };
}

/** The quick level's default finalist replay: 100 seeded trials. */
const QUICK_RELIABILITY: ReliabilityConfig = { trialCount: 100, seed: 1 };

/** The attacker a `"quick"` search is built around; throws when the quick level has none. */
function quickSearchAttacker(options: QuestOptimizerOptions): number | undefined {
  if (options.searchLevel !== "quick") return undefined;
  const attackerId = options.preferences?.preferredAttackerId;
  if (attackerId === undefined) throw new RangeError('searchLevel "quick" needs preferences.preferredAttackerId');
  return attackerId;
}

/** Explicit beam settings, else the quick level's narrower defaults, else the search's own defaults; face-card finishes off unless allowed. */
function beamWidths(options: QuestOptimizerOptions): { beamWidth?: number; fineSetupCount?: number; faceCardFinishes: boolean; bestLinePerSetup: boolean } {
  const quick = options.searchLevel === "quick";
  const beamWidth = options.beamWidth ?? (quick ? 16 : undefined);
  const fineSetupCount = options.fineSetupCount ?? (quick ? 8 : undefined);
  return {
    ...(beamWidth === undefined ? {} : { beamWidth }),
    ...(fineSetupCount === undefined ? {} : { fineSetupCount }),
    faceCardFinishes: options.allowFaceCardFinishes === true,
    bestLinePerSetup: true,
  };
}

/** One within-budget party (formation × CE assignment) ready to search, with its per-turn candidate builder. */
interface PartySearch {
  readonly party: readonly PartyMemberSpec[];
  readonly initialState: BattleState;
  readonly buildCandidatesForState: (state: BattleState) => FactoredTurnCandidates;
}

type CoarseQuestResult = Pick<QuestOptimizerCandidate, "party" | "initialState" | "best">;

/** Lazily yields every within-budget party, building each one's starting state only when it is reached. */
function* partySearches(options: QuestOptimizerOptions, randomFn: () => number): Generator<PartySearch> {
  // Each optional axis prefers an explicit caller-supplied resolver over its raw-data
  // auto-resolver counterpart (`../battle/skillActivationResolver.js`/`orderChangeSwapResolver.js`)
  // — a manual override always wins. Neither depends on the per-turn `state` a formation's
  // candidates are built from, so both are resolved once per `optimizeQuest` call rather than
  // rebuilt per party/turn.
  const skillSources = options.skillSources === undefined
    ? undefined
    : [
        ...options.skillSources,
        ...(options.supportCandidates ?? []).map((support): ServantSkillSource => ({
          ...skillSourceFor(support.niceServant, support.build.skillLevels, support.build.unlockedStrengthenings ?? []),
          servantId: supportBattleId(support.build.servantId),
        })),
      ];
  const resolveSkillOptions = options.resolveSkillOptions;
  const quickAttackerId = quickSearchAttacker(options);
  const minimumDamageRoll = options.minimumDamageRoll ?? options.searchLevel === "quick";
  const defaultTargetServantId = options.defaultTargetServantId;
  const resolveSkillOptionSetsFn: ((state: BattleState) => readonly (readonly SkillActivation[])[]) | undefined =
    resolveSkillOptions !== undefined
      ? (state) => [resolveSkillOptions(state)]
      : skillSources === undefined
        ? undefined
        : defaultTargetServantId !== undefined
          ? (state) => [resolveSkillActivationOptions(state, skillSources, { defaultTargetServantId })]
          : quickAttackerId !== undefined
            ? (state) => {
                const attackerOnField = state.servants.some((servant) => servant.servantId === quickAttackerId && servant.isFrontLine);
                return [resolveSkillActivationOptions(state, skillSources, { defaultTargetServantId: (casterId) => (attackerOnField ? quickAttackerId : casterId) })];
              }
            : (state) =>
              state.servants
                .filter((servant) => servant.isFrontLine)
                .map((focus) => resolveSkillActivationOptions(state, skillSources, { defaultTargetServantId: () => focus.servantId }));
  // A caller's own swap resolver is searched with both timings. The default swaps the way it is
  // played: the outgoing servant first uses whatever skills it has left, then leaves, then the
  // party (with the newcomer) picks its skills.
  const defaultOrderChange = options.resolveOrderChangeOptions === undefined;
  const resolveOrderChangeOptionsFn =
    options.resolveOrderChangeOptions ??
    (options.hasOrderChangeMysticCodeSkill === undefined
      ? undefined
      : (state: BattleState) => resolveOrderChangeSwapOptions(state, options.hasOrderChangeMysticCodeSkill as boolean));
  /** The outgoing servant's usable skills (first focus target), played just before a default swap. */
  const outgoingSkills = (state: BattleState, swap: OrderChangeSwap): ActionSequenceCandidate => {
    const own = (resolveSkillOptionSetsFn?.(state)[0] ?? []).filter((activation) => activation.type === "useSkill" && activation.servantId === swap.outgoingServantId);
    return buildSkillSetups(own).find((setup) => setup.actions.length === own.length) ?? { label: "", actions: [] };
  };

  const maxBenchCount = options.maxBenchCount ?? 0;
  const ownedSlots: readonly PartySlot[] = options.shortlist.map((candidate) => ({ candidate, isSupport: false }));
  const isQuickAttacker = (slot: PartySlot): boolean => !slot.isSupport && slot.candidate.build.servantId === quickAttackerId;
  const formations = [
    ...enumeratePartyFormations(ownedSlots, FRONT_LINE_SERVANT_COUNT, maxBenchCount),
    ...(options.supportCandidates ?? []).flatMap((candidate) => {
      const support: PartySlot = { candidate, isSupport: true };
      return enumeratePartyFormations([...ownedSlots, support], FRONT_LINE_SERVANT_COUNT, maxBenchCount)
        .filter((formation) => formation.frontLine.includes(support) || formation.bench.includes(support));
    }),
  ].filter((formation) => quickAttackerId === undefined || formation.frontLine.some(isQuickAttacker));

  // `enumerateCeAssignments` only depends on the fielded slot *count*, not which specific
  // servants fill it — many formations of the same total size (front-line + bench) share the
  // same count, so this is cached per size rather than recomputed per formation.
  const ceAssignmentsBySlotCount = new Map<number, readonly (readonly (EquippedCraftEssence | undefined)[])[]>();
  const ceAssignmentsForSlotCount = (slotCount: number): readonly (readonly (EquippedCraftEssence | undefined)[])[] => {
    const cached = ceAssignmentsBySlotCount.get(slotCount);
    if (cached !== undefined) return cached;
    const computed = enumerateDistinctCeAssignments(options.cePool, slotCount, ceCopyKey);
    ceAssignmentsBySlotCount.set(slotCount, computed);
    return computed;
  };

  for (const formation of formations) {
    const fielded = [...formation.frontLine, ...formation.bench];
    const ceSlots = fielded.filter((slot) => !slot.isSupport && (quickAttackerId === undefined || isQuickAttacker(slot)));
    const ceAssignments = ceAssignmentsForSlotCount(ceSlots.length);
    for (const ceAssignment of ceAssignments) {
      const party: PartyMemberSpec[] = fielded.map((slot, index) => {
        const isFrontLine = index < formation.frontLine.length;
        const base: PartyMemberSpec = { niceServant: slot.candidate.niceServant, build: slot.candidate.build, isFrontLine };
        if (slot.isSupport) return { ...base, isSupport: true };
        const ceIndex = ceSlots.indexOf(slot);
        const equippedCe = ceIndex < 0 ? undefined : ceAssignment[ceIndex];
        return equippedCe === undefined ? base : { ...base, equippedCe };
      });
      const supportNpGains = options.resolveHitContext === undefined ? supportNpGainsByBattleId(party) : new Map();

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
      const buildCandidatesForState = (state: BattleState): FactoredTurnCandidates => {
        const configuredTarget = options.targetEnemySlotIndex === undefined ? undefined : state.enemies[options.targetEnemySlotIndex];
        const targetEnemy = configuredTarget?.currentHp !== undefined && configuredTarget.currentHp > 0
          ? configuredTarget
          : [...state.enemies].reverse().find((enemy) => enemy.currentHp > 0);
        if (targetEnemy === undefined) return { groups: [] };

        // Prefers the explicit `resolveHitContext` over the raw-data auto path — same
        // manual-wins-over-automatic precedence as the skill/order-change axes above. The
        // eager check at the top of this function already guarantees one of the two exists.
        const resolveHitContextIn = (cardState: BattleState): ((handCard: HandCard) => DerivedHitContext) =>
          options.resolveHitContext ??
          ((handCard) => {
            const npGainByServantId = options.npGainByServantId as (servantId: number) => NoblePhantasm.NoblePhantasmGain;
            const actingServant = cardState.servants.find((s) => s.servantId === handCard.servantId);
            if (actingServant === undefined) {
              throw new RangeError(`No servant with servantId ${handCard.servantId} in this BattleState`);
            }
            const npGain = supportNpGains.get(handCard.servantId) ?? npGainByServantId(handCard.servantId);
            return resolveCardHitContext(handCard, actingServant, npGain, targetEnemy, randomFn);
          });

        // With an Order Change, cards and NPs come from the post-swap party. Skills do too
        // when the swap comes first, so the incoming servant's skills are offered and a
        // single-ally skill never targets the servant who just left.
        const buildForHand = (hand: BattleState["handCards"], choice?: OrderChangeChoice<OrderChangeSwap>): TurnCandidateGroup => {
          const beforeSwap = choice === undefined || choice.afterSkills || !defaultOrderChange ? [] : outgoingSkills(state, choice.swap).actions;
          const cardState = choice === undefined ? state : [...beforeSwap, choice.swap].reduce((current, action) => resolveAction(current, action, options.constants, randomFn), state);
          const skillState = choice?.afterSkills === false ? cardState : state;
          const resolveHitContext = resolveHitContextIn(cardState);
          const contextTemplates = hand.map(resolveHitContext);
          const npOptions =
            options.resolveNpOptions?.(cardState, targetEnemy) ??
            cardState.servants.flatMap((servant) => {
              if (!servant.isFrontLine) return [];
              const member = party.find((candidate) => partyMemberBattleId(candidate) === servant.servantId);
              const np = (member?.isSupport === true ? undefined : options.npByServantId?.(servant.servantId)) ??
                (member === undefined
                  ? undefined
                  : selectNoblePhantasmVersion(member.niceServant.noblePhantasms ?? [], member.build));
              if (np === undefined) return [];
              const resolved = resolveNpAttackOption(cardState, servant.servantId, np, targetEnemy.npcId, randomFn);
              return resolved === undefined ? [] : [resolved];
            });
          const builtChains = buildAttackChainCandidates(
            hand,
            contextTemplates,
            npOptions,
            targetEnemy.npcId,
            (servantId) => resolveHitContext({ card: Card.EXTRA, servantId }),
          );
          const cardCandidates = minimumDamageRoll
            ? builtChains.map((chain) => ({ label: chain.label, actions: chain.actions.map((action) => randomizeAttack(action, () => 0)) }))
            : builtChains;
          if (resolveSkillOptionSetsFn === undefined) return { setups: [{ label: "", actions: [] }], chains: cardCandidates };
          const setups = new Map<string, ActionSequenceCandidate>();
          for (const skillOptions of resolveSkillOptionSetsFn(skillState)) {
            for (const setup of buildSkillSetups(skillOptions)) if (!setups.has(setup.label)) setups.set(setup.label, setup);
          }
          return { setups: [...setups.values()], chains: cardCandidates };
        };
        return resolveOrderChangeOptionsFn === undefined
          ? { groups: [buildForHand(state.handCards)] }
          : {
              groups: buildOrderChangeGroups(
                resolveOrderChangeOptionsFn(state),
                state.handCards,
                buildForHand,
                defaultOrderChange ? { afterSkillsTiming: false, beforeSwap: (choice) => outgoingSkills(state, choice.swap) } : {},
              ),
            };
      };

      yield { party, initialState, buildCandidatesForState };
    }
  }
}

function coarseResult(search: PartySearch, best: ActionSequenceResult | undefined): CoarseQuestResult | undefined {
  return best === undefined ? undefined : { party: search.party, initialState: search.initialState, best };
}

/** Coarsely ranks per-party best lines, causally replays the bounded finalist pool, and returns them in product ranking order. */
function rankCoarseResults(results: readonly CoarseQuestResult[], options: QuestOptimizerOptions, settings: SearchSettings): readonly QuestOptimizerCandidate[] {
  const { scoreFn, randomFn, attributionPoolSize } = settings;
  const preferredAttackerId = options.preferences?.preferredAttackerId;
  const eventCeIds = new Set(options.preferences?.eventCeIds ?? []);
  const bondCeIds = new Set(options.preferences?.bondCeIds ?? []);
  const coarsePreferenceCount = (candidate: CoarseQuestResult, ids: ReadonlySet<number>): number =>
    candidate.party.filter((member) => member.equippedCe !== undefined && ids.has(member.equippedCe.data.id)).length;
  const coarseFinalists = [...results]
    .sort((a, b) => {
      if (a.best.score !== b.best.score) return b.best.score - a.best.score;
      if (preferredAttackerId !== undefined) {
        const aIncludes = a.party.some((member) => member.build.servantId === preferredAttackerId);
        const bIncludes = b.party.some((member) => member.build.servantId === preferredAttackerId);
        if (aIncludes !== bIncludes) return aIncludes ? -1 : 1;
      }
      const eventDifference = coarsePreferenceCount(b, eventCeIds) - coarsePreferenceCount(a, eventCeIds);
      if (eventDifference !== 0) return eventDifference;
      const bondDifference = coarsePreferenceCount(b, bondCeIds) - coarsePreferenceCount(a, bondCeIds);
      if (bondDifference !== 0) return bondDifference;
      return options.preferences?.minimizeCost ? a.initialState.costSpent - b.initialState.costSpent : 0;
    })
    .slice(0, attributionPoolSize);
  const attributed = coarseFinalists.map((candidate) => attributeQuestCandidate(candidate, options.constants, randomFn, scoreFn));
  return rankQuestCandidates(attributed, options.preferences);
}

export function optimizeQuest(options: QuestOptimizerOptions): readonly QuestOptimizerCandidate[] {
  const settings = searchSettings(options);
  const { scoreFn, randomFn } = settings;
  const results: CoarseQuestResult[] = [];
  for (const search of partySearches(options, randomFn)) {
    let best: ActionSequenceResult | undefined;
    if (options.turnCount === undefined) {
      const candidates = flattenTurnCandidates(search.buildCandidatesForState(search.initialState));
      const maxAttackerCount = options.maxAttackerCount;
      const eligibleCandidates = maxAttackerCount === undefined
        ? candidates
        : candidates.filter((candidate) => attackingServantIds(candidate.actions).size <= maxAttackerCount);
      best = searchBestActionSequence(search.initialState, eligibleCandidates, options.constants, randomFn, scoreFn)[0];
    } else {
      const bestMultiTurn = searchMultiTurnActionSequences(
        search.initialState,
        options.turnCount,
        search.buildCandidatesForState,
        options.constants,
        randomFn,
        scoreFn,
        {
          ...beamWidths(options),
          ...(options.maxAttackerCount === undefined ? {} : { maxAttackerCount: options.maxAttackerCount }),
        },
      )[0];
      best = bestMultiTurn === undefined ? undefined : toActionSequenceResult(bestMultiTurn);
    }
    const result = coarseResult(search, best);
    if (result !== undefined) results.push(result);
  }
  return rankCoarseResults(results, options, settings);
}

export interface MinimumTurnOptimizerOptions extends Omit<QuestOptimizerOptions, "turnCount" | "maxAttackerCount"> {
  readonly maxTurns?: number;
  /** Progressive widening stops at this many damage dealers. Defaults to the largest fieldable party. */
  readonly maxAttackers?: number;
  readonly maxResults?: number;
  /**
   * Seeded finalist replay on freshly dealt hands (`estimatePlayedLineReliability`); cleared
   * finalists are then ranked by clear rate. Defaults to 100 trials for the quick level; omit
   * otherwise to skip the extra pass.
   */
  readonly reliability?: ReliabilityConfig;
}

export interface MinimumTurnOptimizerResult {
  readonly minimumTurns: number | null;
  readonly searchedThroughTurn: number;
  readonly attackerLimitUsed: number | null;
  readonly candidates: readonly QuestOptimizerCandidate[];
}

/** Minimum-turn Clear Quest search. Three turns is only a preset; the fewest turns that clear the whole quest win (then the fewest attackers), bounded by the product's 6-turn offensive-only cap. */
export function optimizeQuestMinimumTurns(options: MinimumTurnOptimizerOptions): MinimumTurnOptimizerResult {
  const {
    maxTurns = 6,
    maxAttackers = FRONT_LINE_SERVANT_COUNT + (options.maxBenchCount ?? 0),
    maxResults = 5,
    reliability,
    ...questOptions
  } = options;
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 6) {
    throw new RangeError(`maxTurns must be an integer from 1 through 6, got ${maxTurns}`);
  }
  if (!Number.isInteger(maxAttackers) || maxAttackers < 1) {
    throw new RangeError(`maxAttackers must be a positive integer, got ${maxAttackers}`);
  }
  if (reliability !== undefined) validateReliabilityConfig(reliability);
  const searchRandomFn = questOptions.randomFn ?? (reliability === undefined ? undefined : createSeededRandom(reliability.seed));
  const searchOptions: QuestOptimizerOptions = { ...questOptions, ...(searchRandomFn === undefined ? {} : { randomFn: searchRandomFn }) };
  const settings = searchSettings(searchOptions);
  const { scoreFn, randomFn } = settings;
  const searches = [...partySearches(searchOptions, randomFn)];

  // One turn-by-turn beam per attacker limit replaces a full search per (turns, limit) pair: the
  // beam after turn N is the same however many turns follow, so each limit reads its earliest
  // clear as it goes. A wider limit only matters if it clears in fewer turns than one already
  // found, which keeps the original "fewest turns, then fewest attackers" order.
  let found: { readonly turns: number; readonly attackerLimit: number; readonly cleared: readonly QuestOptimizerCandidate[] } | undefined;
  let closest: readonly QuestOptimizerCandidate[] = [];
  for (let attackerLimit = 1; attackerLimit <= maxAttackers; attackerLimit += 1) {
    const horizon = found === undefined ? maxTurns : found.turns - 1;
    if (horizon < 1) break;
    const beamOptions = {
      ...beamWidths(questOptions),
      maxAttackerCount: attackerLimit,
    };
    validateMultiTurnSearchOptions(beamOptions);
    let beams = searches.map((search) => startBeam(search.initialState, scoreFn));
    for (let turns = 1; turns <= horizon; turns += 1) {
      beams = beams.map((beam, index) => {
        const search = searches[index] as PartySearch;
        return beam.length === 0
          ? beam
          : advanceBeam(beam, turns - 1, search.initialState, search.buildCandidatesForState, options.constants, randomFn, scoreFn, beamOptions);
      });
      const results = beams.flatMap((beam, index): readonly CoarseQuestResult[] => {
        const bestLine = rankBeam(beam)[0];
        const result = coarseResult(searches[index] as PartySearch, bestLine === undefined ? undefined : toActionSequenceResult(bestLine));
        return result === undefined ? [] : [result];
      });
      if (results.some((result) => isQuestCleared(result.best.finalState))) {
        const cleared = rankCoarseResults(results, searchOptions, settings).filter((candidate) => isQuestCleared(candidate.best.finalState));
        if (cleared.length > 0) {
          found = { turns, attackerLimit, cleared };
          break;
        }
      }
      if (attackerLimit === maxAttackers && turns === maxTurns) closest = rankCoarseResults(results, searchOptions, settings);
    }
  }

  if (found !== undefined) {
    const finalistReliability = reliability ?? (questOptions.searchLevel === "quick" ? QUICK_RELIABILITY : undefined);
    const searchByParty = new Map(searches.map((search) => [search.party, search]));
    const evaluated = finalistReliability === undefined
      ? found.cleared
      : found.cleared.map((candidate) => {
          const search = searchByParty.get(candidate.party);
          // A turn's first group holds its chains without an Order Change; the line's own swap is replayed as setup.
          const chainsForState = (state: BattleState) => search?.buildCandidatesForState(state).groups[0]?.chains ?? [];
          return { ...candidate, reliability: estimatePlayedLineReliability(candidate, chainsForState, options.constants, finalistReliability) };
        });
    return {
      minimumTurns: found.turns,
      searchedThroughTurn: found.turns,
      attackerLimitUsed: found.attackerLimit,
      candidates: selectDiverseQuestCandidates(evaluated, options.preferences, maxResults),
    };
  }
  return {
    minimumTurns: null,
    searchedThroughTurn: maxTurns,
    attackerLimitUsed: null,
    candidates: selectDiverseQuestCandidates(closest, options.preferences, maxResults),
  };
}
