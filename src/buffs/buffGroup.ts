import type { ActiveBuffInstance } from "./types.js";

/**
 * Applies the `buffGroup` unstacking rule (research/05-buffs-and-debuffs.md §3) to one new
 * buff application against a unit's already-active buffs.
 *
 * - `buffGroup: 0` means "no restriction" — the new instance always stacks, including
 *   alongside copies of itself (e.g. most "Buster Up" buffs).
 * - A non-zero `buffGroup` shared with an already-active instance is a collision. The
 *   collision tie-break was resolved by a live in-game test (project owner, this session):
 *   casting a `specialInvincible`/`buffGroup: 250` NP while a different-source instance of
 *   the same group was still active produced no change at all. This confirms **reject-new**
 *   — the new application is discarded outright and the existing instance is returned
 *   completely untouched (not replaced, not refreshed, not extended).
 *
 * `activeBuffs` is assumed to already be filtered down to genuinely-active instances (per
 * `BattleUnit`'s own convention); this function only adjudicates the buffGroup collision,
 * not whether an instance has expired — see `./buffLifecycle.js`'s `TrackedBuff` for the
 * turn-by-turn expiry layer built on top of this.
 *
 * Generic over `T extends ActiveBuffInstance` so a caller tracking extra per-instance state
 * (e.g. `TrackedBuff`'s `turnsRemaining`/`usesRemaining`) gets that state preserved through
 * the call, rather than having to re-cast the widened `ActiveBuffInstance[]` result back.
 */
export function applyBuff<T extends ActiveBuffInstance>(activeBuffs: readonly T[], newBuff: T): readonly T[] {
  if (newBuff.buffGroup !== 0 && activeBuffs.some((buff) => buff.buffGroup === newBuff.buffGroup)) {
    return activeBuffs;
  }
  return [...activeBuffs, newBuff];
}
