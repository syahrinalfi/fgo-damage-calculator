import type { Action } from "../battle/action.js";
import type { HandCard } from "../battle/battleState.js";
import { enumerateOrderChangeTimings, type OrderChangeChoice } from "./candidateGeneration.js";
import type { TurnCandidateGroup } from "./multiTurnSearch.js";
import type { ActionSequenceCandidate } from "./turnSearch.js";

/** A fully-resolved Order Change swap a candidate turn plan may choose to perform — same "already-resolved input" convention `SkillActivation` uses (`./skillUsageCandidates.js`): the caller sources `outgoingServantId`/`incomingServantId` (e.g. from a Mystic Code's off-cooldown 3rd skill slot), this module only decides *whether and when* it's included. */
export type OrderChangeSwap = Extract<Action, { type: "orderChange" }>;

/**
 * Reassigns every `handCards` slot owned by `swap.outgoingServantId` to
 * `swap.incomingServantId` — a pure `HandCard[]` projection of exactly what
 * `resolveOrderChange` (`../battle/turnLoop.js`) does to `BattleState.handCards`, used here to
 * rebuild hand-card ownership *before* generating card-order candidates for a given swap
 * choice (see `enumerateOrderChangeTimings`'s own doc comment, `./candidateGeneration.js`, for
 * why this must happen before rather than by splicing into an already-built candidate).
 */
export function reassignHandCardOwnership(handCards: readonly HandCard[], swap: OrderChangeSwap): readonly HandCard[] {
  return handCards.map((handCard) => (handCard.servantId === swap.outgoingServantId ? { ...handCard, servantId: swap.incomingServantId } : handCard));
}

/**
 * The optimizer's default Order Change pruning: only swaps whose outgoing servant has no skill
 * left to use this turn — the way Order Change is used in practice (bring in a fresh support once
 * one is spent). With a spent outgoing servant the after-skills timing only delays the incoming
 * servant's skills, so callers pair this with `afterSkillsTiming: false`.
 */
export function swapsOutSpentServants(swaps: readonly OrderChangeSwap[], hasUsableSkill: (servantId: number) => boolean): readonly OrderChangeSwap[] {
  return swaps.filter((swap) => !hasUsableSkill(swap.outgoingServantId));
}

/** Inserts `swap` right before the first `playCard`/`castNp` action in `actions` — used for the `afterSkills: true` timing, where the swap resolves after this turn's skill-usage-plan prefix but must still land before any card is played. Every action is assumed to be a card play once no more skill/order-change actions remain (this project's own "skills (and now order-change) before cards" convention, `./skillUsageCandidates.js`), so a sequence with no `playCard`/`castNp` at all (skills-only) appends `swap` at the end. */
function insertBeforeFirstCard(actions: readonly Action[], swap: OrderChangeSwap): Action[] {
  const cardIndex = actions.findIndex((action) => action.type === "playCard" || action.type === "castNp");
  const insertAt = cardIndex === -1 ? actions.length : cardIndex;
  return [...actions.slice(0, insertAt), swap, ...actions.slice(insertAt)];
}

function labelForChoice(choice: readonly OrderChangeChoice<OrderChangeSwap>[]): string {
  const entry = choice[0];
  if (entry === undefined) return "noOrderChange";
  return `orderChange:${entry.swap.outgoingServantId}->${entry.swap.incomingServantId}@${entry.afterSkills ? "afterSkills" : "beforeSkills"}`;
}

/**
 * Wires `enumerateOrderChangeTimings` (research/09 §4's final "Order-Change-timing" search
 * axis, `./candidateGeneration.js`) into full-turn `ActionSequenceCandidate`s — the same
 * "given already-generated pieces, combine into full candidates" role
 * `buildSkillAndCardOrderCandidates` plays for the skill-usage-plan axis, but this axis needs
 * to run *outside* that one: an Order Change changes which servant a hand-card slot belongs
 * to, which the card-order axis's `resolveHitContext`/`buildCardOrderCandidates` step needs
 * to already see, not something patchable after the fact (see `enumerateOrderChangeTimings`'s
 * own doc comment for the correctness trap this avoids).
 *
 * `buildCandidatesForHand` is the caller's own "given this turn's (possibly post-swap) hand,
 * build every skill-usage × card-order candidate" closure (it also receives the swap choice, so
 * it can offer the post-swap party's skills and NPs) — typically
 * `(hand) => buildSkillAndCardOrderCandidates(skillOptions, buildCardOrderCandidates(hand, hand.map(resolveHitContext), targetNpcId))`,
 * but this function doesn't assume that shape; it only needs *a* hand-to-candidates builder,
 * so a caller with no skill-usage axis wired up can pass one that skips straight to
 * `buildCardOrderCandidates`.
 *
 * Grows as `(1 + 2 * swapOptions.length) * (candidates `buildCandidatesForHand` returns)` — a
 * caller should keep `swapOptions` narrowed to genuinely available (off-cooldown, live
 * sub-member) swaps, same caveat every other axis in this module already documents.
 */
export function buildOrderChangeCandidates(
  swapOptions: readonly OrderChangeSwap[],
  handCards: readonly HandCard[],
  buildCandidatesForHand: (hand: readonly HandCard[], choice?: OrderChangeChoice<OrderChangeSwap>) => readonly ActionSequenceCandidate[],
  { afterSkillsTiming = true }: { readonly afterSkillsTiming?: boolean } = {},
): readonly ActionSequenceCandidate[] {
  const timings = enumerateOrderChangeTimings(swapOptions).filter((timing) => afterSkillsTiming || timing[0]?.afterSkills !== true);
  const results: ActionSequenceCandidate[] = [];
  for (const timing of timings) {
    const choice = timing[0];
    const label = labelForChoice(timing);
    if (choice === undefined) {
      for (const candidate of buildCandidatesForHand(handCards)) {
        results.push({ label: `${label}|${candidate.label}`, actions: candidate.actions });
      }
      continue;
    }
    const effectiveHand = reassignHandCardOwnership(handCards, choice.swap);
    for (const candidate of buildCandidatesForHand(effectiveHand, choice)) {
      const actions = choice.afterSkills ? insertBeforeFirstCard(candidate.actions, choice.swap) : [choice.swap, ...candidate.actions];
      results.push({ label: `${label}|${candidate.label}`, actions });
    }
  }
  return results;
}

/**
 * The factored form of `buildOrderChangeCandidates`: one `TurnCandidateGroup` per swap choice,
 * with the swap folded into each setup (first for the before-skills timing, after the skills for
 * the after-skills timing) and labels matching `buildOrderChangeCandidates`. Setups and chains
 * are never crossed here; the beam combines them only for the lines it simulates.
 */
export function buildOrderChangeGroups(
  swapOptions: readonly OrderChangeSwap[],
  handCards: readonly HandCard[],
  buildGroupForHand: (hand: readonly HandCard[], choice?: OrderChangeChoice<OrderChangeSwap>) => TurnCandidateGroup,
  { afterSkillsTiming = true }: { readonly afterSkillsTiming?: boolean } = {},
): readonly TurnCandidateGroup[] {
  return enumerateOrderChangeTimings(swapOptions)
    .filter((timing) => afterSkillsTiming || timing[0]?.afterSkills !== true)
    .map((timing) => {
      const choice = timing[0];
      const label = labelForChoice(timing);
      const group = choice === undefined ? buildGroupForHand(handCards) : buildGroupForHand(reassignHandCardOwnership(handCards, choice.swap), choice);
      const setups = group.setups.map((setup): ActionSequenceCandidate => ({
        label: setup.label === "" ? label : `${label}|${setup.label}`,
        actions: choice === undefined ? setup.actions : choice.afterSkills ? [...setup.actions, choice.swap] : [choice.swap, ...setup.actions],
      }));
      return { setups, chains: group.chains };
    });
}
