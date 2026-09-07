import type { Card } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { drawCardBagHand, shuffleCards } from "./cardBag.js";

const BUSTER = "2" as Card;
const ARTS = "1" as Card;
const QUICK = "3" as Card;

function fifteenCardDeck(): readonly Card[] {
  return [
    ...Array<Card>(5).fill(BUSTER),
    ...Array<Card>(5).fill(ARTS),
    ...Array<Card>(5).fill(QUICK),
  ].map((type, index) => `${type}-${index}` as Card);
}

/** Returns a fixed sequence of values, one per call, for deterministic Fisher-Yates verification. */
function scriptedRandom(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i];
    if (value === undefined) {
      throw new Error(`scriptedRandom exhausted after ${i} calls`);
    }
    i += 1;
    return value;
  };
}

function throwingRandom(): () => number {
  return () => {
    throw new Error("randomFn should not be called");
  };
}

describe("shuffleCards", () => {
  it("returns a new array without mutating the input", () => {
    const original = [1, 2, 3];
    const result = shuffleCards(original, () => 0);
    expect(result).not.toBe(original);
    expect(original).toEqual([1, 2, 3]);
  });

  it("produces the exact Fisher-Yates permutation for a scripted RNG sequence", () => {
    // randomFn always returning 0 means j is always 0, so each step swaps result[i] with result[0].
    const result = shuffleCards(["a", "b", "c", "d", "e"], () => 0);
    expect(result).toEqual(["b", "c", "d", "e", "a"]);
  });

  it("always returns a permutation (same multiset) of the input, for any RNG sequence", () => {
    const deck = fifteenCardDeck();
    const result = shuffleCards(deck, scriptedRandom([0.9, 0.1, 0.5, 0.3, 0.7, 0.0, 0.99, 0.2, 0.4, 0.6, 0.8, 0.15, 0.55, 0.35]));
    expect([...result].sort()).toEqual([...deck].sort());
  });
});

describe("drawCardBagHand", () => {
  it("deals the first handSize cards directly from a non-empty bag, without reshuffling", () => {
    const bag = fifteenCardDeck().slice(0, 10);
    const result = drawCardBagHand(bag, fifteenCardDeck(), 5, throwingRandom());
    expect(result.hand).toEqual(bag.slice(0, 5));
    expect(result.nextBag).toEqual(bag.slice(5));
  });

  it("reshuffles fullDeck when the bag is empty (start of a new cycle)", () => {
    const fullDeck = fifteenCardDeck();
    const result = drawCardBagHand([], fullDeck, 5, () => 0);
    const shuffled = shuffleCards(fullDeck, () => 0);
    expect(result.hand).toEqual(shuffled.slice(0, 5));
    expect(result.nextBag).toEqual(shuffled.slice(5));
  });

  it("deals every card in the 15-card deck exactly once across a 3-turn cycle, then reshuffles fresh for the next cycle", () => {
    const fullDeck = fifteenCardDeck();
    const randomFn = scriptedRandom(Array.from({ length: 40 }, (_, i) => (i * 0.037) % 1));

    const turn1 = drawCardBagHand([], fullDeck, 5, randomFn);
    expect(turn1.hand).toHaveLength(5);
    expect(turn1.nextBag).toHaveLength(10);

    const turn2 = drawCardBagHand(turn1.nextBag, fullDeck, 5, throwingRandom());
    expect(turn2.hand).toHaveLength(5);
    expect(turn2.nextBag).toHaveLength(5);

    const turn3 = drawCardBagHand(turn2.nextBag, fullDeck, 5, throwingRandom());
    expect(turn3.hand).toHaveLength(5);
    expect(turn3.nextBag).toHaveLength(0);

    const dealt = [...turn1.hand, ...turn2.hand, ...turn3.hand];
    expect([...dealt].sort()).toEqual([...fullDeck].sort());

    const turn4 = drawCardBagHand(turn3.nextBag, fullDeck, 5, randomFn);
    expect(turn4.hand).toHaveLength(5);
    expect(turn4.nextBag).toHaveLength(10);
  });

  it("throws rather than silently dealing a short hand when the bag has fewer cards than handSize", () => {
    const shortBag = fifteenCardDeck().slice(0, 3);
    expect(() => drawCardBagHand(shortBag, fifteenCardDeck(), 5, throwingRandom())).toThrow(RangeError);
  });
});
