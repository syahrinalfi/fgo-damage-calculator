/**
 * Fisher-Yates shuffle with an injectable RNG (defaults to `Math.random`) so callers —
 * and tests — can get a deterministic permutation. Returns a new array; never mutates
 * `cards`. `randomFn` must return a value in `[0, 1)`, matching `Math.random`'s own
 * contract — a value of exactly `1` would index one past the swap range and silently
 * corrupt the result with an `undefined` entry.
 */
export function shuffleCards<T>(cards: readonly T[], randomFn: () => number = Math.random): readonly T[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    const temp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temp;
  }
  return result;
}

export interface CardBagDrawResult<T> {
  /** This turn's dealt hand — always `handSize` cards, drawn without replacement. */
  hand: readonly T[];
  /** The bag's remaining not-yet-dealt cards after this draw. */
  nextBag: readonly T[];
}

/**
 * Deals one turn's hand from the card bag (research/03 §6.5, research/09 §1) — the 3
 * fielded front-line servants' 15-card combined deck (`fullDeck`), shuffled once and
 * dealt without replacement across a fixed 3-turn cycle (5 of 15, then 5 of the
 * remaining 10, then the last 5), reshuffling fresh once exhausted.
 *
 * Generic over the dealt token type `T` (in practice `HandCard`, `./battleState.js` —
 * a card tagged with its owning servant, research/07 §4) purely so this bag/shuffle
 * mechanic stays decoupled from that ownership tagging: this function's own job (which
 * card *types* get dealt, and in what without-replacement pattern) doesn't care what `T`
 * carries.
 *
 * An empty `cardBag` (either the very first draw of a battle, or the bag having just
 * been fully depleted by the prior turn's draw) means "start a new cycle": `fullDeck` is
 * reshuffled and the hand is dealt from that fresh permutation. A non-empty `cardBag` is
 * simply dealt from directly — no reshuffle, since a cycle in progress must preserve the
 * without-replacement guarantee (every one of the 15 cards seen exactly once per cycle).
 *
 * This models the base draw only — NP cards are additive and outside the bag (confirmed,
 * research/03 §6.5), and servant-death/Order-Change mid-cycle early-reshuffle is an open,
 * lower-priority nuance (research/03 §6.5/§7) not modeled here.
 *
 * Throws if the bag being dealt from (after a reshuffle, if one was needed) has fewer
 * than `handSize` cards — e.g. a `fullDeck` not sized in exact `handSize` multiples of a
 * full party. A short hand would otherwise be silently, wrongly dealt, the same class of
 * mistake `resolveCardTerm` (`./cardTerm.js`) already deliberately throws on rather than
 * returning a technically-valid-looking but wrong result.
 */
export function drawCardBagHand<T>(
  cardBag: readonly T[],
  fullDeck: readonly T[],
  handSize = 5,
  randomFn: () => number = Math.random,
): CardBagDrawResult<T> {
  const bag = cardBag.length > 0 ? cardBag : shuffleCards(fullDeck, randomFn);
  if (bag.length < handSize) {
    throw new RangeError(`Card bag has ${bag.length} card(s), fewer than the requested hand size ${handSize}`);
  }
  return { hand: bag.slice(0, handSize), nextBag: bag.slice(handSize) };
}
