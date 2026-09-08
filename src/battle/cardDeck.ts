import type { HandCard, ServantInstance } from "./battleState.js";

/** Front-line party size (research/00 §4) — the card bag's 15-card combined deck is exactly 3 servants' worth. */
export const FRONT_LINE_SERVANT_COUNT = 3;
/** Cards per servant deck (`Entity.cards`, research/03 §6.4/§6.5). */
export const CARDS_PER_SERVANT_DECK = 5;

/**
 * Builds the card bag's 15-card combined deck (research/03 §6.5, research/09 §1) from the
 * currently front-line servants' own 5-card decks (`ServantInstance.cardTypes`, sourced
 * from `Entity.cards`), each card tagged with its owning servant as a `HandCard`
 * (research/07 §4 — needed so a later `orderChange` `Action` has something to
 * re-attribute). Throws rather than silently building an under/over-sized deck — the same
 * "wrong-looking but valid result" mistake `drawCardBagHand` (`./cardBag.js`) and
 * `resolveCardTerm` (`./cardTerm.js`) already guard against — if the party isn't exactly 3
 * front-line servants, or any of their decks isn't exactly 5 cards.
 *
 * NP cards are deliberately excluded (research/03 §6.5: additive, outside the bag).
 */
export function buildCombinedCardDeck(servants: readonly ServantInstance[]): readonly HandCard[] {
  const frontLine = servants.filter((servant) => servant.isFrontLine);
  if (frontLine.length !== FRONT_LINE_SERVANT_COUNT) {
    throw new RangeError(`Expected ${FRONT_LINE_SERVANT_COUNT} front-line servants, got ${frontLine.length}`);
  }

  return frontLine.flatMap((servant, index) => {
    if (servant.cardTypes.length !== CARDS_PER_SERVANT_DECK) {
      throw new RangeError(
        `Front-line servant at index ${index} (servantId ${servant.servantId}) has ${servant.cardTypes.length} cards, expected ${CARDS_PER_SERVANT_DECK}`,
      );
    }
    return servant.cardTypes.map((card): HandCard => ({ card, servantId: servant.servantId }));
  });
}
