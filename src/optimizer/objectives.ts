import type { BattleState } from "../battle/battleState.js";
import type { SequenceScoreFn } from "./turnSearch.js";

/**
 * Ready-made `SequenceScoreFn`s for `searchBestActionSequence` (`./turnSearch.js`),
 * addressed by **enemy slot index** (`BattleState.enemies[slotIndex]`) rather than
 * `npcId` — a `shift`/break-bar transition (research/08 §4, `applyShiftTransitions`)
 * replaces the `EnemyInstance` at a slot with a fresh one carrying a *different*
 * `npcId`, so slot index is the only identifier stable across that swap.
 *
 * Deliberately out of scope here (matches research/09 §4/§7's own open items,
 * not silently assumed): multi-bar "total damage across every bar this sequence
 * broke through" accounting beyond a single shift step, and any objective that
 * needs the full-party Cost/turn-count framing from §4's coarse/fine search
 * (those need the candidate-generation layer `./turnSearch.js`'s own doc comment
 * flags as a later increment).
 */

/** Higher score = more of this slot's current bar was cleared. A full clear (enemy gone or `currentHp` 0) scores the slot's starting HP; a `shift` mid-sequence scores the broken bar's starting HP, not the replacement's partial damage. */
export function damageDealtAtSlot(slotIndex: number): SequenceScoreFn {
  return (finalState, initialState) => {
    const before = initialState.enemies[slotIndex];
    if (before === undefined) return 0;
    const after = finalState.enemies[slotIndex];
    if (after === undefined || after.npcId !== before.npcId) return before.currentHp;
    return before.currentHp - after.currentHp;
  };
}

/** Higher score = less HP left standing in this slot (0 remaining HP scores highest) — useful for "which line gets this bar closest to dead" ranking. */
export function negativeRemainingHpAtSlot(slotIndex: number): SequenceScoreFn {
  return (finalState: BattleState, _initialState: BattleState) => {
    const enemy = finalState.enemies[slotIndex];
    return enemy === undefined ? 0 : -enemy.currentHp;
  };
}
