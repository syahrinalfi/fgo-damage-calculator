/** Expected search-branch failure: the action is structurally valid but unavailable in the current BattleState. */
export class ActionUnavailableError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "ActionUnavailableError";
  }
}
