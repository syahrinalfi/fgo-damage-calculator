import type { Card } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ServantInstance } from "./battleState.js";
import { buildCombinedCardDeck } from "./cardDeck.js";

const BUSTER = "2" as Card;
const ARTS = "1" as Card;
const QUICK = "3" as Card;

function servant(servantId: number, isFrontLine: boolean, cardTypes: readonly Card[]): ServantInstance {
  return {
    servantId,
    isFrontLine,
    cardTypes,
    npLevel: 1,
    atk: 10000,
    className: "saber" as ServantInstance["className"],
    attribute: "human" as ServantInstance["attribute"],
    traits: new Set(),
    currentHp: 15000,
    maxHp: 15000,
    currentNpGauge: 0,
    activeBuffs: [],
    skillCooldowns: [0, 0, 0],
  };
}

const FIVE_CARD_DECK: readonly Card[] = [BUSTER, BUSTER, ARTS, ARTS, QUICK];

describe("buildCombinedCardDeck", () => {
  it("concatenates exactly 3 front-line servants' 5-card decks into one 15-card deck", () => {
    const servants = [
      servant(1, true, FIVE_CARD_DECK),
      servant(2, true, FIVE_CARD_DECK),
      servant(3, true, FIVE_CARD_DECK),
    ];
    const deck = buildCombinedCardDeck(servants);
    expect(deck).toHaveLength(15);
    expect(deck).toEqual([...FIVE_CARD_DECK, ...FIVE_CARD_DECK, ...FIVE_CARD_DECK]);
  });

  it("ignores sub-member (benched) servants", () => {
    const servants = [
      servant(1, true, FIVE_CARD_DECK),
      servant(2, true, FIVE_CARD_DECK),
      servant(3, true, FIVE_CARD_DECK),
      servant(4, false, FIVE_CARD_DECK),
      servant(5, false, FIVE_CARD_DECK),
    ];
    expect(buildCombinedCardDeck(servants)).toHaveLength(15);
  });

  it("throws when the party isn't exactly 3 front-line servants", () => {
    expect(() => buildCombinedCardDeck([servant(1, true, FIVE_CARD_DECK), servant(2, true, FIVE_CARD_DECK)])).toThrow(
      RangeError,
    );
    expect(() =>
      buildCombinedCardDeck([
        servant(1, true, FIVE_CARD_DECK),
        servant(2, true, FIVE_CARD_DECK),
        servant(3, true, FIVE_CARD_DECK),
        servant(4, true, FIVE_CARD_DECK),
      ]),
    ).toThrow(RangeError);
  });

  it("throws when a front-line servant's deck isn't exactly 5 cards", () => {
    const servants = [
      servant(1, true, FIVE_CARD_DECK),
      servant(2, true, [BUSTER, ARTS]),
      servant(3, true, FIVE_CARD_DECK),
    ];
    expect(() => buildCombinedCardDeck(servants)).toThrow(RangeError);
  });
});
