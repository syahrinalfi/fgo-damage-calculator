import { CRITICAL_RATE_PER_STAR } from "../engine/constants.js";
import type { HandCard, ServantInstance } from "./battleState.js";
import { shuffleCards } from "./cardBag.js";

/**
 * The +50/+20/+20 flat slot-bonus pool (research/04 §6.2, community-sourced from the same
 * datamining source `fgo-game-data-docs` cites for `np.md`/`critstars.md`): 3 of the hand's
 * slots get a flat bonus critical weight (one +50, two +20), the rest get none, freshly
 * "shuffled" (i.e. reassigned to random slots) each time stars are allocated. This project
 * has no primary-source citation pinning down *when* the shuffle happens relative to the
 * card draw (e.g. once per turn vs. once per allocation) — this function is called once per
 * `allocateCritStars` call, the most literal reading of "shuffled" available without a more
 * specific source.
 */
function slotBonusWeights(handSize: number, randomFn: () => number): readonly number[] {
  if (handSize < 3) {
    throw new RangeError(`Expected at least 3 hand slots for the +50/+20/+20 bonus weights, got ${handSize}`);
  }
  const pool = [50, 20, 20, ...Array<number>(handSize - 3).fill(0)];
  return shuffleCards(pool, randomFn);
}

function criticalWeightFor(handCard: HandCard, servants: readonly ServantInstance[]): number {
  const servant = servants.find((s) => s.servantId === handCard.servantId);
  if (!servant) {
    throw new RangeError(`No servant with servantId ${handCard.servantId} in this BattleState`);
  }
  return servant.criticalWeight;
}

/**
 * Allocates `starCount` critical stars one-by-one across the current hand's slots via a
 * weighted random lottery (research/04 §6.2) — each hand slot's total weight is its
 * `slotBonusWeights` flat bonus (if any) plus its owning servant's own `criticalWeight`
 * stat. Every star is an independent weighted pick against those same fixed weights (not a
 * without-replacement draw — a slot can receive more than one star). Returns the resulting
 * star count per hand slot, in the same order as `hand`.
 *
 * The community source's "Star Focus"/`upStarweight` buff multiplier on `criticalWeight`
 * (research/04 §6.2) is **not modeled here** — no confirmed buff-action key for it exists
 * yet in this project's `BUFF_ACTION_KEYS` (`./buffActionKeys.js`, which only lists keys
 * live-verified against a real fetch), so folding it in would mean guessing at an
 * unconfirmed key. A servant carrying that buff is simply under-weighted for now; wiring it
 * in is a small, self-contained follow-up once the key is confirmed.
 *
 * Throws on an empty hand (nothing to allocate to), a negative `starCount` (there is no
 * such thing as "allocating" a negative number of stars — rather than silently returning a
 * technically-valid-looking all-zero result), or a hand whose total weight is 0 or negative
 * (a weighted lottery has no valid outcome to roll).
 */
export function allocateCritStars(
  hand: readonly HandCard[],
  servants: readonly ServantInstance[],
  starCount: number,
  randomFn: () => number = Math.random,
): readonly number[] {
  if (hand.length === 0) {
    throw new RangeError("Cannot allocate crit stars to an empty hand");
  }
  if (starCount < 0) {
    throw new RangeError(`starCount must be non-negative, got ${starCount}`);
  }

  const bonuses = slotBonusWeights(hand.length, randomFn);
  const weights = hand.map((handCard, index) => (bonuses[index] as number) + criticalWeightFor(handCard, servants));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) {
    throw new RangeError("Total critical weight across the hand must be positive to allocate stars");
  }

  const starsPerSlot = Array<number>(hand.length).fill(0);
  for (let star = 0; star < starCount; star++) {
    const roll = randomFn() * totalWeight;
    let cumulative = 0;
    let chosenSlot = weights.length - 1;
    for (let slot = 0; slot < weights.length; slot++) {
      cumulative += weights[slot] as number;
      if (roll < cumulative) {
        chosenSlot = slot;
        break;
      }
    }
    starsPerSlot[chosenSlot] = (starsPerSlot[chosenSlot] as number) + 1;
  }
  return starsPerSlot;
}

/**
 * Converts a hand slot's allocated star count into its crit-chance contribution
 * (research/04 §6.1/§6.2): `CRITICAL_RATE_PER_STAR` (10%) per star, capped at 100% — a
 * card cannot go past certain-crit regardless of how many stars it holds (research/04 §6.2
 * point 4, "widely observed as 100%").
 */
export function critChanceForStars(stars: number): number {
  return Math.min(stars * CRITICAL_RATE_PER_STAR, 1);
}

/** Rolls whether a specific card actually crits, given its crit chance (`critChanceForStars`). A thin Bernoulli wrapper — kept separate so a caller can inspect/log the raw probability before committing to the roll. */
export function rollIsCrit(critChance: number, randomFn: () => number = Math.random): boolean {
  return randomFn() < critChance;
}
