import { Region } from "fgo-damage-calculator/data";
import type { ManualQuestDraft } from "fgo-damage-calculator/quest";
import { describe, expect, it } from "vitest";
import { groupActionsByTurn, plural, questReadiness } from "./compositionPresentation";

describe("groupActionsByTurn", () => {
  it("splits an action log into turns at each endTurn, dropping the endTurn markers", () => {
    const skill = { type: "useSkill" } as const;
    const np = { type: "castNp" } as const;
    const end = { type: "endTurn" } as const;
    expect(groupActionsByTurn([skill, np, end, np, end])).toEqual([[skill, np], [np]]);
  });

  it("keeps a trailing turn that has no endTurn yet", () => {
    const np = { type: "castNp" } as const;
    expect(groupActionsByTurn([{ type: "endTurn" }, np])).toEqual([[], [np]]);
  });
});

describe("questReadiness", () => {
  const base: ManualQuestDraft = {
    id: "q",
    name: "Node",
    region: Region.NA,
    waves: [{ enemies: [{ className: "saber" as never, attribute: "earth" as never, hp: 1000 }] }],
  };

  it("reports a complete draft as ready", () => {
    expect(questReadiness(base)).toEqual({ ready: true, message: "All required enemy fields are set." });
  });

  it("names the missing requirement instead of throwing", () => {
    const missingHp = { ...base, waves: [{ enemies: [{ className: "saber" as never, attribute: "earth" as never, hp: 0 }] }] };
    const readiness = questReadiness(missingHp);
    expect(readiness.ready).toBe(false);
    expect(readiness.message.length).toBeGreaterThan(0);
  });
});

describe("plural", () => {
  it("uses the singular form only for exactly one", () => {
    expect(plural(1, "enemy", "enemies")).toBe("1 enemy");
    expect(plural(0, "enemy", "enemies")).toBe("0 enemies");
    expect(plural(3, "enemy", "enemies")).toBe("3 enemies");
  });
});
