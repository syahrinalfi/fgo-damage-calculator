import type { Card } from "@atlasacademy/api-connector";
import type { HitResolutionContext } from "./hitResolution.js";
import type { SkillEffect } from "./skillEffect.js";

/**
 * The 4 fields of `HitResolutionContext` this project's turn loop now derives itself
 * (research/09 §7's "next increment"): `isCrit` from the hand slot's crit-star allocation
 * (`./critStarLottery.js`), `isBusterChain`/`extraCardChainType` from the turn's 3-card
 * chain classification (`./chainDetection.js`), and `chainLeadCardType` (research/06 §7.2's
 * first-card bonus, `./damageInput.js`) from the chain's own 1st-played card. A caller
 * building an `Action` supplies everything else `HitResolutionContext` still needs
 * (Overcharge stage, server-mod values, super-effective check, etc.) as before.
 */
export type DerivedHitContext = Omit<HitResolutionContext, "isCrit" | "isBusterChain" | "extraCardChainType" | "chainLeadCardType">;

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
      readonly context: DerivedHitContext;
      /**
       * This turn's full 3-card chain selection (research/03 §3: a chain is always exactly
       * 3 non-NP cards), in play order — used to derive `isBusterChain`/`extraCardChainType`
       * via `classifyChain` (`./chainDetection.js`), `chainCards[0].type` as
       * `DerivedHitContext.chainLeadCardType` (research/06 §7.2's first-card bonus,
       * `./damageInput.js`), and, together with `chainPosition` below, to detect when the
       * Arts/Quick-chain completion bonuses fire. The card at `chainCards[chainPosition - 1]`
       * must match the card this action is actually playing (matched by `type` + `servantId`
       * against the `handCards` slot at `handCardIndex`); throws otherwise, same as the
       * existing `context.card.type` cross-check.
       */
      readonly chainCards: readonly { readonly type: Card; readonly servantId: number }[];
      /**
       * This play's 1-indexed position within `chainCards` (research/06 §7.2's Arts-chain
       * NP-gauge / Quick-chain star bonuses resolve once, when the chain's *last* card is
       * played — `chainPosition === 3` — not once per card). Caller-supplied rather than
       * inferred from card-type/servantId matching alone, since two of a chain's 3 slots can
       * legitimately hold an identical `{ type, servantId }` pair (e.g. two Buster cards from
       * the same servant), which would make position ambiguous to reconstruct.
       */
      readonly chainPosition: 1 | 2 | 3;
    }
  | {
      readonly type: "castNp";
      readonly servantId: number;
      readonly targetNpcId: number;
      /**
       * An NP is never part of a 3-card chain, gets no first-card bonus, and can never
       * critically hit (research/03 §1.4/§5's all-zero NP card-position stub) —
       * `isCrit`/`isBusterChain`/`extraCardChainType` are hardcoded `false`/`false`/`"none"`
       * and `chainLeadCardType` is set to this NP's own card type (a deliberate no-op, since
       * an NP's own `NiceCard.json` entry is itself an all-zero stub) by `resolveCastNp`
       * rather than derived at all, so `castNp` needs no `chainCards` equivalent.
       */
      readonly context: DerivedHitContext;
    }
  | {
      readonly type: "useSkill";
      readonly servantId: number;
      readonly skillSlot: 1 | 2 | 3;
      /**
       * This skill's already-level-resolved effects (research/09 §7 — see `SkillEffect`'s
       * own doc comment for what's in/out of scope). Empty for a skill this project can't
       * yet model (any function beyond `addState`/`addStateShort`/`subState`).
       */
      readonly effects: readonly SkillEffect[];
      /** This skill's cooldown at its current level (`NiceSkill.coolDown[level - 1]`), applied to `skillCooldowns[skillSlot - 1]` once resolved. */
      readonly cooldownTurns: number;
      readonly targetServantId?: number;
      readonly targetNpcId?: number;
    }
  | {
      readonly type: "useMysticCodeSkill";
      readonly slot: 1 | 2 | 3;
      readonly effects: readonly SkillEffect[];
      readonly cooldownTurns: number;
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
