import type { Servant as ServantModule } from "@atlasacademy/api-connector";
import type { ServantBuild } from "../account/types.js";
import type { BattleState, EquippedCraftEssence, HandCard } from "../battle/battleState.js";
import type { DerivedHitContext } from "../battle/action.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { FRONT_LINE_SERVANT_COUNT } from "../battle/cardDeck.js";
import type { Wave } from "../quest/types.js";
import { buildInitialBattleState, type PartyMemberSpec } from "./battleStateBuilder.js";
import { enumerateCeAssignments, enumeratePartyFormations } from "./candidateGeneration.js";
import { buildCardOrderCandidates } from "./cardOrderCandidates.js";
import { damageDealtAtSlot } from "./objectives.js";
import { buildOrderChangeCandidates, type OrderChangeSwap } from "./orderChangeCandidates.js";
import { buildSkillAndCardOrderCandidates, type SkillActivation } from "./skillUsageCandidates.js";
import { searchBestActionSequence, type ActionSequenceResult, type SequenceScoreFn } from "./turnSearch.js";

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
   * `offensiveNPRate`/`baseStarRate`/etc.) — this project has no automatic resolver from raw
   * `NiceServant`/`NiceCard`/enemy-trait data to a `DerivedHitContext` yet (a genuinely
   * separate, unbuilt piece — every `Action`-builder in this project treats this as
   * "already-resolved input," and this function is no exception), so the caller supplies it.
   * `.card.position` is ignored (`buildCardOrderCandidates` overwrites it per ordering).
   */
  readonly resolveHitContext: (handCard: HandCard) => DerivedHitContext;
  /**
   * Resolves this party candidate's available (off-cooldown) skill/Mystic Code skill
   * activations (research/09 §4's "skill-usage plan per turn" axis) as fully-resolved
   * `SkillActivation`s — same "already-resolved input" convention as `resolveHitContext`.
   * Receives the party's own just-built `initialState` so targets/servantIds can reference
   * the actual fielded servants for this combination. Every subset of the returned list is
   * tried (`enumerateSkillUsageSubsets`, `./candidateGeneration.js`), each crossed with
   * every card-order candidate (`./skillUsageCandidates.js`) — omit this option entirely
   * (the default) to search the card-order axis alone, unchanged from before this option
   * existed.
   */
  readonly resolveSkillOptions?: (initialState: BattleState) => readonly SkillActivation[];
  /**
   * Resolves this party candidate's available (off-cooldown, live-sub-member) Order Change
   * swaps (research/09 §4's final "Order-Change-timing" axis) as fully-resolved
   * `OrderChangeSwap`s — same "already-resolved input" convention as `resolveHitContext`/
   * `resolveSkillOptions`. Every swap is tried at both timings relative to the skill-usage
   * plan (`enumerateOrderChangeTimings`, `./candidateGeneration.js`), always resolved before
   * any card is played (see that function's own doc comment for why) — omit this option
   * entirely (the default) to search without the Order-Change axis, unchanged from before
   * this option existed.
   */
  readonly resolveOrderChangeOptions?: (initialState: BattleState) => readonly OrderChangeSwap[];
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
  /** Which of `initialState.enemies` the default `damageDealtAtSlot` objective targets and every combination's `playCard` `Action`s attack — defaults to `0` (the first/only enemy). */
  readonly targetEnemySlotIndex?: number;
  /** Overrides the default `damageDealtAtSlot(targetEnemySlotIndex)` objective. */
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
 * **Scope, deliberately not attempted here**: only a single turn's line per party (no
 * multi-turn horizon — the ST Burst Finder's own multi-turn specialization, §5, is a distinct
 * future increment on top of this same engine, not something this function's single-turn
 * scoring loop attempts). All 5 of research/09 §4's search-space axes are now searchable:
 * servant subset/CE assignment always (now including the bench axis via
 * `enumeratePartyFormations`, opt-in through `maxBenchCount`), card-order always, skill-usage
 * plan when `resolveSkillOptions` is supplied (`./skillUsageCandidates.js`), and
 * Order-Change-timing when `resolveOrderChangeOptions` is supplied
 * (`./orderChangeCandidates.js`) — all 3 optional axes remain opt-in, so omitting any of them
 * searches exactly what the search covered before that option existed.
 */
export function optimizeQuest(options: QuestOptimizerOptions): readonly QuestOptimizerCandidate[] {
  const targetSlot = options.targetEnemySlotIndex ?? 0;
  const scoreFn = options.scoreFn ?? damageDealtAtSlot(targetSlot);
  const randomFn = options.randomFn ?? Math.random;

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
      const targetEnemy = initialState.enemies[targetSlot];
      if (targetEnemy === undefined) continue;

      const buildForHand = (hand: BattleState["handCards"]): ReturnType<typeof buildCardOrderCandidates> => {
        const contextTemplates = hand.map(options.resolveHitContext);
        const cardCandidates = buildCardOrderCandidates(hand, contextTemplates, targetEnemy.npcId);
        return options.resolveSkillOptions === undefined
          ? cardCandidates
          : buildSkillAndCardOrderCandidates(options.resolveSkillOptions(initialState), cardCandidates);
      };
      const candidates =
        options.resolveOrderChangeOptions === undefined
          ? buildForHand(initialState.handCards)
          : buildOrderChangeCandidates(options.resolveOrderChangeOptions(initialState), initialState.handCards, buildForHand);
      const ranked = searchBestActionSequence(initialState, candidates, options.constants, randomFn, scoreFn);
      const best = ranked[0];
      if (best === undefined) continue;

      results.push({ party, initialState, best });
    }
  }

  return results.sort((a, b) => b.best.score - a.best.score);
}
