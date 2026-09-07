import type { HitResolutionContext } from "./hitResolution.js";

/**
 * One atomic thing a turn's plan can do (research/09 §1) — the granularity both
 * Manual/Sandbox mode (research/00 §1.3, the user supplies the `Action` sequence
 * directly) and the optimizer's search operate at. Every `Action` is resolved strictly
 * in sequence, never batched (research/00 §4's "same-turn NP-order effects"/intra-NP
 * function-order findings — the evaluator must re-check state before the next `Action`).
 *
 * `useCommandSeal`'s exact effect semantics are still unresolved research (research/00 §6:
 * "Precise Command Seal effects to model... not yet confirmed from official sources") — its
 * variant is deliberately payload-less pending that, rather than guessing a shape.
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
  | { readonly type: "useCommandSeal" }
  | { readonly type: "endTurn" };
