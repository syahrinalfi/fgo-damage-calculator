import { manualQuestToWaves, type ManualQuestDraft } from "fgo-damage-calculator/quest";

/** Splits a composition's action log into one list per turn; `endTurn` closes a turn and is not shown. */
export function groupActionsByTurn<T extends { readonly type: string }>(actions: readonly T[]): T[][] {
  const turns: T[][] = [[]];
  for (const action of actions) {
    if (action.type === "endTurn") turns.push([]);
    else turns[turns.length - 1]!.push(action);
  }
  if (turns.length > 1 && turns[turns.length - 1]!.length === 0) turns.pop();
  return turns;
}

/** Whether a quest draft can be searched, using the same validation the optimizer input conversion applies. */
export function questReadiness(draft: ManualQuestDraft): { readonly ready: boolean; readonly message: string } {
  try {
    manualQuestToWaves(draft);
    return { ready: true, message: "All required enemy fields are set." };
  } catch (error: unknown) {
    return { ready: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** "1 enemy" / "3 enemies". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
