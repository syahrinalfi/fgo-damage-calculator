/**
 * Expected search-branch failure: the action is structurally valid but unavailable in the current BattleState.
 *
 * The optimizer rejects illegal candidate lines by simulating them until this is thrown, so it is
 * constructed very often; capturing a stack trace each time cost ~17% of search time. It is a
 * search outcome rather than a bug report, so the stack is skipped where the engine allows it
 * (`Error.stackTraceLimit` is V8's; other engines ignore it).
 */
export class ActionUnavailableError extends RangeError {
  constructor(message: string) {
    const errorConstructor = Error as { stackTraceLimit?: number };
    const stackTraceLimit = errorConstructor.stackTraceLimit;
    if (stackTraceLimit !== undefined) errorConstructor.stackTraceLimit = 0;
    try {
      super(message);
    } finally {
      if (stackTraceLimit !== undefined) errorConstructor.stackTraceLimit = stackTraceLimit;
    }
    this.name = "ActionUnavailableError";
  }
}
