import { useMemo } from "react";
import { optimizeQuest, type QuestOptimizerCandidate } from "fgo-damage-calculator/optimizer";
import { DEMO_CONSTANTS, DEMO_RANDOM_FN, DEMO_WAVES } from "../data/demoQuest";
import type { LiveRoster } from "../data/liveRoster";

/**
 * Runs the real `optimizeQuest` engine against a fetched live roster — single-turn only
 * (`turnCount` omitted) and without the skill-usage axis (`skillSources` omitted). Both axes
 * are real, engine-supported features, but their candidate counts multiply (skill subsets ×
 * card orderings, then again per extra turn) far past what an in-browser demo can search
 * without narrowing the per-turn candidate builder itself — a caller-side concern
 * `optimizeQuest`'s own docs flag explicitly. Turning them on is future work once a narrower,
 * caller-supplied candidate builder exists; for now this stays within what full brute-force
 * search can do interactively (only the CE-assignment axis varies each ranked line).
 */
export function useOptimizerResults(roster: LiveRoster): readonly QuestOptimizerCandidate[] {
  return useMemo(
    () =>
      optimizeQuest({
        shortlist: roster.shortlist,
        cePool: roster.cePool,
        waves: DEMO_WAVES,
        costBudget: 100,
        constants: DEMO_CONSTANTS,
        npGainByServantId: roster.npGainByServantId,
        randomFn: DEMO_RANDOM_FN,
      }),
    [roster],
  );
}
