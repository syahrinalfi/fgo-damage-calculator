import { resolveAction, type Action, type BattleState } from "fgo-damage-calculator/battle";
import { FULL_TD_POINT } from "fgo-damage-calculator/engine";
import { Card } from "@atlasacademy/api-connector";
import { DEMO_CONSTANTS, DEMO_RANDOM_FN } from "./demoQuest";
import type { CardType } from "./format";

/** Narrows a played card's real Atlas Academy `Card` enum value (which also covers `EXTRA`/`NONE`/`BLANK`/`WEAK`) down to the 3 player-playable types this UI renders a pill for — `undefined` for anything else, rather than an unchecked cast that would silently mislabel it. */
function toCardType(cardType: Card): CardType | undefined {
  if (cardType === Card.ARTS || cardType === Card.BUSTER || cardType === Card.QUICK) return cardType;
  return undefined;
}

export type TurnEvent = { readonly kind: "card"; readonly cardType: CardType | undefined } | { readonly kind: "np" } | { readonly kind: "skill"; readonly skillSlot: number };

export interface ServantTurnEntry {
  readonly servantId: number;
  readonly events: readonly TurnEvent[];
  /** This servant's own NP gauge, in percent, at the end of this turn's actions (before `endTurn`'s own upkeep). */
  readonly npGaugePercent: number;
  /** This servant's own NP gauge gain this turn, in percentage points. */
  readonly npGainedPercent: number;
}

export interface TurnBreakdown {
  readonly turnNumber: number;
  readonly servants: readonly ServantTurnEntry[];
  /** Damage dealt to the targeted enemy this turn (its HP at turn start minus its HP after this turn's own actions, before `endTurn`). */
  readonly damageDealt: number;
  readonly enemyHpAfter: number;
  readonly enemyMaxHp: number;
}

function gaugePercent(rawGauge: number): number {
  return (rawGauge / FULL_TD_POINT) * 100;
}

/**
 * Diffs `startState.enemies[0]` against `afterActions.enemies[0]` by slot — correct as long as
 * the same `EnemyInstance` occupies that slot across the turn. A `shift` transition
 * (`applyShiftTransitions`, `../battle/turnLoop.js`) can swap in a *different* enemy at the
 * same slot mid-turn (e.g. a break-bar phase change); this function doesn't special-case that,
 * so `damageDealt`/`enemyMaxHp` would then compare two different enemies' HP rather than one
 * enemy's before/after. Not reachable by this demo's single-enemy wave (`./demoQuest.js`), but
 * worth fixing here first if this module is ever reused against a wave that can `shift`.
 */
function summarizeTurn(turnNumber: number, startState: BattleState, afterActions: BattleState, events: ReadonlyMap<number, readonly TurnEvent[]>): TurnBreakdown {
  const servants: ServantTurnEntry[] = afterActions.servants
    .filter((servant) => servant.isFrontLine)
    .map((servant) => {
      const before = startState.servants.find((s) => s.servantId === servant.servantId);
      const beforeGauge = before === undefined ? 0 : gaugePercent(before.currentNpGauge);
      const afterGauge = gaugePercent(servant.currentNpGauge);
      return {
        servantId: servant.servantId,
        events: events.get(servant.servantId) ?? [],
        npGaugePercent: afterGauge,
        npGainedPercent: afterGauge - beforeGauge,
      };
    });

  const enemyBefore = startState.enemies[0];
  const enemyAfter = afterActions.enemies[0];
  return {
    turnNumber,
    servants,
    damageDealt: enemyBefore === undefined || enemyAfter === undefined ? 0 : enemyBefore.currentHp - enemyAfter.currentHp,
    enemyHpAfter: enemyAfter?.currentHp ?? 0,
    enemyMaxHp: enemyAfter?.maxHp ?? enemyBefore?.maxHp ?? 0,
  };
}

/**
 * Re-simulates `actions` (a flattened multi-turn line: each turn's own actions followed by an
 * `endTurn`, `optimizeQuest`'s own convention) from `initialState` through the real
 * `resolveAction` engine — not fabricated — and produces one `TurnBreakdown` per turn.
 */
export function computeTurnBreakdown(initialState: BattleState, actions: readonly Action[]): readonly TurnBreakdown[] {
  const breakdowns: TurnBreakdown[] = [];
  let turnStart = initialState;
  let cur = initialState;
  let events = new Map<number, TurnEvent[]>();
  let turnNumber = 1;

  const randomFn = DEMO_RANDOM_FN;

  for (const action of actions) {
    if (action.type === "endTurn") {
      breakdowns.push(summarizeTurn(turnNumber, turnStart, cur, events));
      cur = resolveAction(cur, action, DEMO_CONSTANTS, randomFn);
      turnStart = cur;
      events = new Map();
      turnNumber += 1;
      continue;
    }

    cur = resolveAction(cur, action, DEMO_CONSTANTS, randomFn);
    if (action.type === "playCard") {
      events.set(action.servantId, [...(events.get(action.servantId) ?? []), { kind: "card", cardType: toCardType(action.context.card.type) }]);
    } else if (action.type === "castNp") {
      events.set(action.servantId, [...(events.get(action.servantId) ?? []), { kind: "np" }]);
    } else if (action.type === "useSkill") {
      events.set(action.servantId, [...(events.get(action.servantId) ?? []), { kind: "skill", skillSlot: action.skillSlot }]);
    }
  }

  // A single-turn (or otherwise not-`endTurn`-terminated) tail still gets summarized.
  if (events.size > 0 || breakdowns.length === 0) {
    breakdowns.push(summarizeTurn(turnNumber, turnStart, cur, events));
  }

  return breakdowns;
}
