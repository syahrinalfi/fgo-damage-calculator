import type { HitResolutionContext } from "./hitResolution.js";

/**
 * One atomic thing a turn's plan can do (research/09 §1) — the granularity both
 * Manual/Sandbox mode (research/00 §1.3, the user supplies the `Action` sequence
 * directly) and the optimizer's search operate at. Every `Action` is resolved strictly
 * in sequence, never batched (research/00 §4's "same-turn NP-order effects"/intra-NP
 * function-order findings — the evaluator must re-check state before the next `Action`).
 *
 * `useCommandSeal`'s 3 effects (research/00 §6, confirmed by the project owner) — raise one
 * servant's NP gauge to at least 100% without ever lowering it (cost 1), heal one servant's
 * HP to 100% (cost 1), or revive every dead party member with full HP and NP gauge (cost
 * all 3 at once) — are a Master-level (account-wide) action, spending
 * `BattleState.commandSealsRemaining`, not any one servant's own resource.
 *
 * See `resolveAction` (`./turnLoop.js`) for which of these are actually implemented yet.
 */
export type Action =
  | {
      readonly type: "playCard";
      readonly servantId: number;
      readonly handCardIndex: number;
      readonly targetNpcId: number;
      readonly context: HitResolutionContext;
    }
  | {
      readonly type: "castNp";
      readonly servantId: number;
      readonly targetNpcId: number;
      readonly context: HitResolutionContext;
    }
  | {
      readonly type: "useSkill";
      readonly servantId: number;
      readonly skillSlot: 1 | 2 | 3;
      readonly targetServantId?: number;
      readonly targetNpcId?: number;
    }
  | {
      readonly type: "useMysticCodeSkill";
      readonly slot: 1 | 2 | 3;
      readonly targetServantId?: number;
      readonly targetNpcId?: number;
    }
  | { readonly type: "orderChange"; readonly outgoingServantId: number; readonly incomingServantId: number }
  | { readonly type: "useCommandSeal"; readonly effect: CommandSealEffect }
  | { readonly type: "endTurn" };

/**
 * The 3 real Command Seal effects (research/00 §6, confirmed by the project owner) — no
 * "guarantee the next card played" effect exists, correcting an earlier, incorrect guess
 * this project's research once floated.
 */
export type CommandSealEffect =
  | { readonly kind: "fillNpGauge"; readonly servantId: number }
  | { readonly kind: "healHp"; readonly servantId: number }
  | { readonly kind: "reviveParty" };
