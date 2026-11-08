import { describe, expect, it } from "vitest";
import { ActionUnavailableError } from "./actionError.js";

describe("ActionUnavailableError", () => {
  it("is a named RangeError carrying its message", () => {
    const error = new ActionUnavailableError("needs 100% NP");
    expect(error).toBeInstanceOf(RangeError);
    expect(error.name).toBe("ActionUnavailableError");
    expect(error.message).toBe("needs 100% NP");
  });

  it("restores the engine's stack trace limit for every other error", () => {
    const errorConstructor = Error as { stackTraceLimit?: number };
    const before = errorConstructor.stackTraceLimit;
    new ActionUnavailableError("unavailable");
    expect(errorConstructor.stackTraceLimit).toBe(before);
    expect(new Error("real bug").stack).toContain("actionError.test");
  });
});
