import type { Servant as ServantModule } from "@atlasacademy/api-connector";
import type { ServantBuild } from "../account/types.js";
import type { BattleState, EquippedCraftEssence, HandCard } from "../battle/battleState.js";
import type { DerivedHitContext } from "../battle/action.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { FRONT_LINE_SERVANT_COUNT } from "../battle/cardDeck.js";
import type { Wave } from "../quest/types.js";
import { buildInitialBattleState, type PartyMemberSpec } from "./battleStateBuilder.js";
import { enumerateCeAssignments, enumerateServantSubsets } from "./candidateGeneration.js";
import { buildCardOrderCandidates } from "./cardOrderCandidates.js";
import { damageDealtAtSlot } from "./objectives.js";
import { searchBestActionSequence, type ActionSequenceResult, type SequenceScoreFn } from "./turnSearch.js";

/** One shortlisted servant a caller wants the search to consider fielding — not yet tied to a CE or front-line/bench role, both decided per enumerated combination. */
export interface ServantCandidate {
  readonly niceServant: ServantModule.Servant;
  readonly build: ServantBuild;
}

export interface QuestOptimizerOptions {
  /** User-shortlisted pool (research/09 §4's "candidate servant subset, ≤6, user-shortlisted") — every `FRONT_LINE_SERVANT_COUNT`-sized combination of this is tried. */
  readonly shortlist: readonly ServantCandidate[];
  /** Owned CE copies eligible to equip — every no-reuse assignment of this pool to the 3 front-line slots is tried (`enumerateCeAssignments`), including leaving a slot bare. */
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
  /** Which of `initialState.enemies` the default `damageDealtAtSlot` objective targets and every combination's `playCard` `Action`s attack — defaults to `0` (the first/only enemy). */
  readonly targetEnemySlotIndex?: number;
  /** Overrides the default `damageDealtAtSlot(targetEnemySlotIndex)` objective. */
  readonly scoreFn?: SequenceScoreFn;
  readonly commandSealsRemaining?: number;
  readonly fieldTraits?: ReadonlySet<number>;
  readonly randomFn?: () => number;
}

/** One servant-subset × CE-assignment party candidate, together with its best found card-play-order line. */
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
 * **Scope, deliberately not attempted here**: only exactly-3-front-line parties (no bench/
 * sub-member axis — `FRONT_LINE_SERVANT_COUNT`, this project's only fully-modeled party
 * shape); only the card-play-order axis of a turn's plan (no skill-usage-plan or
 * Order-Change-timing axis — research/09 §4's remaining 2 open axes); and only a single
 * turn's line per party (no multi-turn horizon — the ST Burst Finder's own multi-turn
 * specialization, §5, is a distinct future increment on top of this same engine, not
 * something this function's single-turn scoring loop attempts).
 */
export function optimizeQuest(options: QuestOptimizerOptions): readonly QuestOptimizerCandidate[] {
  const targetSlot = options.targetEnemySlotIndex ?? 0;
  const scoreFn = options.scoreFn ?? damageDealtAtSlot(targetSlot);
  const randomFn = options.randomFn ?? Math.random;

  const subsets = enumerateServantSubsets(options.shortlist, FRONT_LINE_SERVANT_COUNT);
  const ceAssignments = enumerateCeAssignments(options.cePool, FRONT_LINE_SERVANT_COUNT);

  const results: QuestOptimizerCandidate[] = [];
  for (const subset of subsets) {
    for (const ceAssignment of ceAssignments) {
      const party: PartyMemberSpec[] = subset.map((candidate, index) => {
        const equippedCe = ceAssignment[index];
        const base: PartyMemberSpec = { niceServant: candidate.niceServant, build: candidate.build, isFrontLine: true };
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

      const contextTemplates = initialState.handCards.map(options.resolveHitContext);
      const candidates = buildCardOrderCandidates(initialState.handCards, contextTemplates, targetEnemy.npcId);
      const ranked = searchBestActionSequence(initialState, candidates, options.constants, randomFn, scoreFn);
      const best = ranked[0];
      if (best === undefined) continue;

      results.push({ party, initialState, best });
    }
  }

  return results.sort((a, b) => b.best.score - a.best.score);
}
