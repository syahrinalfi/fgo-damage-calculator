import { Card } from "@atlasacademy/api-connector";
import type { Action, AttackChainCard, DerivedHitContext } from "../battle/action.js";
import type { HandCard } from "../battle/battleState.js";
import { classifyChain, isArtsChainFrom } from "../battle/chainDetection.js";
import { enumerateOrderedSelections } from "./candidateGeneration.js";
import type { ActionSequenceCandidate } from "./turnSearch.js";

/** A turn always selects exactly 3 attack slots; each slot may be a dealt command card or an available NP. */
const CHAIN_LENGTH = 3;

export interface ResolvedNpAttack {
  readonly context: DerivedHitContext;
  readonly hitContexts?: readonly DerivedHitContext[];
  readonly targetHitContexts?: Extract<Action, { type: "castNp" }>["targetHitContexts"];
  readonly effectsBeforeDamage?: Extract<Action, { type: "castNp" }>["effectsBeforeDamage"];
  readonly effects?: Extract<Action, { type: "castNp" }>["effects"];
}

export interface NpAttackOption extends ResolvedNpAttack {
  readonly servantId: number;
  readonly cardType: AttackChainCard["type"];
  readonly targetNpcIds: readonly number[];
  readonly label: string;
  /** Re-resolves OC-sensitive multiplier/effects from the number of directly preceding NPs in this attack chain. */
  readonly resolveForNpChainBonus?: (bonusStages: number) => ResolvedNpAttack;
}

type AttackSource = { readonly kind: "card"; readonly originalIndex: number } | { readonly kind: "np"; readonly optionIndex: number };

/** Builds exactly three selected attack slots from the dealt hand plus caller-resolved NP options. NP availability is independent from the five-card bag but still consumes one of the three selections. */
export function buildAttackChainCandidates(
  handCards: readonly HandCard[],
  contextTemplates: readonly DerivedHitContext[],
  npOptions: readonly NpAttackOption[],
  targetNpcId: number,
  resolveExtraContext?: (servantId: number) => DerivedHitContext,
): readonly ActionSequenceCandidate[] {
  if (handCards.length !== contextTemplates.length) {
    throw new RangeError(`Expected one context template per hand card, got ${contextTemplates.length} templates for ${handCards.length} cards`);
  }
  const npServantIds = new Set<number>();
  for (const option of npOptions) {
    if (!option.context.isNP || option.context.card.type !== option.cardType) {
      throw new RangeError(`NP option ${option.label} must carry an isNP context matching cardType`);
    }
    if (option.targetNpcIds.length === 0 || !option.targetNpcIds.includes(targetNpcId)) {
      throw new RangeError(`NP option ${option.label} must include the primary targetNpcId ${targetNpcId}`);
    }
    if (npServantIds.has(option.servantId)) {
      throw new RangeError(`Only one NP option per servant is allowed, duplicate servantId ${option.servantId}`);
    }
    npServantIds.add(option.servantId);
  }

  const sources: AttackSource[] = [
    ...handCards.map((_, originalIndex): AttackSource => ({ kind: "card", originalIndex })),
    ...npOptions.map((_, optionIndex): AttackSource => ({ kind: "np", optionIndex })),
  ];
  const orderings = enumerateOrderedSelections(sources, CHAIN_LENGTH);
  return orderings.map((ordering): ActionSequenceCandidate => {
    const chainCards: AttackChainCard[] = ordering.map((source) => {
      if (source.kind === "card") {
        const handCard = handCards[source.originalIndex] as HandCard;
        return { type: handCard.card, servantId: handCard.servantId };
      }
      const option = npOptions[source.optionIndex] as NpAttackOption;
      return { type: option.cardType, servantId: option.servantId, isNp: true };
    });
    const sequentialIndices = sequentialMixedHandCardIndices(ordering, handCards.length);
    let consecutiveNpCount = 0;
    const resolvedNpByPosition = ordering.map((source): ResolvedNpAttack | undefined => {
      if (source.kind === "card") {
        consecutiveNpCount = 0;
        return undefined;
      }
      const option = npOptions[source.optionIndex] as NpAttackOption;
      const resolved = option.resolveForNpChainBonus?.(consecutiveNpCount) ?? option;
      consecutiveNpCount += 1;
      if (!resolved.context.isNP || resolved.context.card.type !== option.cardType) {
        throw new RangeError(`Resolved NP option ${option.label} must carry an isNP context matching cardType`);
      }
      return resolved;
    });
    const actions: Action[] = ordering.map((source, position) => {
      const chainPosition = (position + 1) as 1 | 2 | 3;
      if (source.kind === "np") {
        const option = npOptions[source.optionIndex] as NpAttackOption;
        const resolved = resolvedNpByPosition[position] as ResolvedNpAttack;
        return {
          type: "castNp",
          servantId: option.servantId,
          targetNpcId,
          targetNpcIds: option.targetNpcIds,
          context: { ...resolved.context, card: { type: option.cardType, position: 1 } },
          ...(resolved.hitContexts === undefined ? {} : { hitContexts: resolved.hitContexts }),
          ...(resolved.targetHitContexts === undefined ? {} : { targetHitContexts: resolved.targetHitContexts }),
          ...(resolved.effectsBeforeDamage === undefined ? {} : { effectsBeforeDamage: resolved.effectsBeforeDamage }),
          ...(resolved.effects === undefined ? {} : { effects: resolved.effects }),
          chainCards,
          chainPosition,
        };
      }
      const handCard = handCards[source.originalIndex] as HandCard;
      const template = contextTemplates[source.originalIndex] as DerivedHitContext;
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
    const braveServantId = chainCards[0]?.servantId;
    if (braveServantId !== undefined && chainCards.every((candidate) => candidate.servantId === braveServantId) && resolveExtraContext !== undefined) {
      const extraContext = resolveExtraContext(braveServantId);
      if (extraContext.isNP || extraContext.card.type !== Card.EXTRA) {
        throw new RangeError(`Extra Attack context for servantId ${braveServantId} must be a non-NP Extra card`);
      }
      actions.push({
        type: "playExtraCard",
        servantId: braveServantId,
        targetNpcId,
        context: { ...extraContext, card: { type: Card.EXTRA, position: 1 } },
        chainCards,
      });
    }
    const label = ordering
      .map((source) => (source.kind === "card" ? `${String(handCards[source.originalIndex]?.card)}@${source.originalIndex}` : npOptions[source.optionIndex]?.label ?? "NP"))
      .join(">");
    return { label, actions };
  });
}

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
 * `sequentialMixedHandCardIndices` below simulates that same removal ahead of time so each `Action`
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
  return buildAttackChainCandidates(handCards, contextTemplates, [], targetNpcId);
}

function sequentialMixedHandCardIndices(ordering: readonly AttackSource[], handSize: number): readonly (number | undefined)[] {
  const remaining = Array.from({ length: handSize }, (_, index) => index);
  return ordering.map((source) => {
    if (source.kind === "np") return undefined;
    const at = remaining.indexOf(source.originalIndex);
    remaining.splice(at, 1);
    return at;
  });
}

/**
 * Whether an attack chain's NP charge depends on which cards were dealt: it forms an Arts Chain
 * (+20% NP gauge only with three Arts cards), or a face card is played before an NP (changing the
 * NP's overkill refund). The dependable optimizer search plans neither.
 */
export function dependsOnDealtCards(actions: readonly Action[]): boolean {
  const first = actions.find((action) => action.type === "playCard" || action.type === "castNp");
  if (first !== undefined && "chainCards" in first && isArtsChainFrom(classifyChain(first.chainCards))) return true;
  const lastNp = actions.map((action) => action.type).lastIndexOf("castNp");
  return actions.slice(0, Math.max(lastNp, 0)).some((action) => action.type === "playCard");
}
