import type { Action, DerivedHitContext } from "../battle/action.js";
import type { HandCard } from "../battle/battleState.js";
import { enumerateOrderedSelections } from "./candidateGeneration.js";
import type { ActionSequenceCandidate } from "./turnSearch.js";

/** A chain is always exactly 3 non-NP cards (research/03 §3) — every existing `Action`/test fixture in this project already bakes in this invariant (`DEFAULT_CHAIN_CARDS`, `chainPosition: 1 | 2 | 3`), so this builder does too rather than taking a configurable count. */
const CHAIN_LENGTH = 3;

/**
 * The first end-to-end wiring of the enumeration layer (`./candidateGeneration.js`) into
 * real, simulatable `ActionSequenceCandidate`s (`./turnSearch.js`) — closes "nothing calls
 * all of these together yet" for the **card-play-order axis** specifically. Given a turn's
 * `handCards` and one already-resolved `DerivedHitContext` template per hand slot (same
 * "already-resolved input" convention every other `Action`-builder in this project uses —
 * `offensiveNPRate`/`baseStarRate`/etc. don't depend on chain position and are the caller's
 * responsibility to source, same as building any `playCard` `Action` by hand today), produces
 * one candidate per `nP3` ordered selection of 3 distinct hand slots: `enumerateOrderedSelections`
 * picks *which* 3 cards and in *what* order, and this function fills in everything a `playCard`
 * `Action` needs that actually depends on that choice — `chainCards`, `chainPosition`, and
 * `context.card.position` (research/03 §1: a card's `position` **is** its 1st/2nd/3rd chain
 * slot, not an arbitrary index — every template's own `.card.position` is ignored/overwritten
 * here since it varies per ordering, not per hand slot).
 *
 * **The one correctness trap this function exists specifically to avoid**: `resolvePlayCard`
 * (`../battle/turnLoop.js`) indexes into `state.handCards` positionally and removes the played
 * card by splicing that index out (its own doc comment: "multiple `playCard`s in one turn must
 * recompute each `handCardIndex` against the previous call's result") — a naive candidate
 * builder using each card's *original* hand index for all 3 `Action`s in a sequence would be
 * wrong for the 2nd and 3rd play, since the 1st play's removal shifts every later index down.
 * `sequentialHandCardIndices` below simulates that same removal ahead of time so each `Action`
 * in the returned sequence carries the *correct-at-that-point* `handCardIndex`.
 *
 * Servant-subset/CE-assignment integration (the other 2 enumeration axes,
 * `enumerateServantSubsets`/`enumerateCeAssignments`) is deliberately **not** wired here —
 * that needs account/roster + quest data assembled into a whole `BattleState` per candidate
 * (`buildServantInstance`, `../battle/battleState.js`, plus quest-side wave/enemy setup), a
 * substantially larger integration than "given an already-built `BattleState`, vary this
 * turn's card order" — left for a later increment.
 */
export function buildCardOrderCandidates(
  handCards: readonly HandCard[],
  contextTemplates: readonly DerivedHitContext[],
  targetNpcId: number,
): readonly ActionSequenceCandidate[] {
  const originalIndices = handCards.map((_, index) => index);
  const orderings = enumerateOrderedSelections(originalIndices, CHAIN_LENGTH);
  return orderings.map((ordering): ActionSequenceCandidate => {
    const chainCards = ordering.map((originalIndex) => {
      const handCard = handCards[originalIndex] as HandCard;
      return { type: handCard.card, servantId: handCard.servantId };
    });
    const sequentialIndices = sequentialHandCardIndices(ordering, handCards.length);
    const actions: Action[] = ordering.map((originalIndex, position) => {
      const handCard = handCards[originalIndex] as HandCard;
      const template = contextTemplates[originalIndex] as DerivedHitContext;
      const chainPosition = (position + 1) as 1 | 2 | 3;
      return {
        type: "playCard",
        servantId: handCard.servantId,
        handCardIndex: sequentialIndices[position] as number,
        targetNpcId,
        context: { ...template, card: { type: handCard.card, position: chainPosition } },
        chainCards,
        chainPosition,
      };
    });
    return { label: ordering.map((originalIndex) => `${String(handCards[originalIndex]?.card)}@${originalIndex}`).join(">"), actions };
  });
}

/**
 * Given an ordering of *original* hand indices, returns the actual `handCardIndex` each
 * successive `playCard` `Action` must use once earlier plays in the same sequence have
 * already spliced their own card out of `state.handCards` — see this module's own doc
 * comment for why this is necessary at all.
 */
function sequentialHandCardIndices(originalIndices: readonly number[], handSize: number): readonly number[] {
  const remaining = Array.from({ length: handSize }, (_, index) => index);
  return originalIndices.map((original) => {
    const at = remaining.indexOf(original);
    remaining.splice(at, 1);
    return at;
  });
}
