import type { Action } from "./action.js";
import type { BattleState } from "./battleState.js";

/** A fully-resolved Order Change swap, as `../optimizer/orderChangeCandidates.js`'s own `OrderChangeSwap` alias (structurally identical — same independent-declaration convention `SkillActivation` uses, `./skillActivationResolver.js`). */
export type OrderChangeSwap = Extract<Action, { readonly type: "orderChange" }>;

/**
 * Auto-resolves research/09 §4's final "Order-Change-timing" axis input (`optimizeQuest`'s
 * optional `resolveOrderChangeOptions`) from `BattleState` alone — every front-line ×
 * benched-sub-member pair is a valid swap (research/07 §3-4's `replaceMember` mechanism has
 * no further eligibility restriction beyond "outgoing must be front-line, incoming must be
 * benched," already exactly what `resolveOrderChange`, `./turnLoop.js`, validates), so this
 * resolver is a plain enumeration, not a partial/heuristic one — unlike
 * `resolveSkillActivationOptions` (`./skillActivationResolver.js`), it never needs to skip a
 * candidate for being unrepresentable.
 *
 * `hasOrderChangeMysticCodeSkill` is a required, explicit caller input rather than something
 * derived from `state` — `BattleState` tracks no Mystic Code identity at all (only the generic
 * `mysticCodeSkillCooldowns` counters, `./battleState.js`), and research/07 §2 confirms Order
 * Change exists on only 3 of 28 known Mystic Codes (always as the 3rd skill slot) — this
 * resolver has no way to know whether the account's actually-equipped Mystic Code is one of
 * those 3 without being told. When it is, `state.mysticCodeSkillCooldowns[2]` (the confirmed
 * "always 3rd slot" convention) gates availability the same way any other skill's own cooldown
 * entry would.
 */
export function resolveOrderChangeSwapOptions(state: BattleState, hasOrderChangeMysticCodeSkill: boolean): readonly OrderChangeSwap[] {
  if (!hasOrderChangeMysticCodeSkill || state.mysticCodeSkillCooldowns[2] !== 0) {
    return [];
  }

  const frontLine = state.servants.filter((servant) => servant.isFrontLine);
  const bench = state.servants.filter((servant) => !servant.isFrontLine);
  const swaps: OrderChangeSwap[] = [];
  for (const outgoing of frontLine) {
    for (const incoming of bench) {
      swaps.push({ type: "orderChange", outgoingServantId: outgoing.servantId, incomingServantId: incoming.servantId });
    }
  }
  return swaps;
}
