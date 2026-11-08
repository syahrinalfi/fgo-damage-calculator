import type { Servant as ServantModule, Skill } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { attachTriggerSkills, type FuncWithTriggerSkills } from "./triggerSkills.js";

function func(buffType: string, value: number): FuncWithTriggerSkills {
  return { funcType: "addStateShort", buffs: [{ type: buffType }], svals: [{ Value: value, Value2: 10 }] } as unknown as FuncWithTriggerSkills;
}

describe("attachTriggerSkills", () => {
  it("fetches each named trigger skill once and attaches it only to trigger functions", async () => {
    const trigger = func("commandattackAfterFunctionMainOnly", 966533);
    const plain = func("upCommandall", 500);
    const servant = { skills: [{ functions: [trigger, plain] }], classPassive: [], appendPassive: [], noblePhantasms: [{ functions: [func("commandattackAfterFunctionMainOnly", 966533)] }] } as unknown as ServantModule.Servant;
    const loaded: number[] = [];
    await attachTriggerSkills(servant, async (id) => {
      loaded.push(id);
      return { id } as unknown as Skill.Skill;
    });
    expect(loaded).toEqual([966533]);
    expect(trigger.triggerSkills?.[966533]).toEqual({ id: 966533 });
    expect(plain.triggerSkills).toBeUndefined();
  });

  it("loads nothing for a servant without trigger buffs", async () => {
    const servant = { skills: [{ functions: [func("upAtk", 200)] }] } as unknown as ServantModule.Servant;
    let calls = 0;
    await attachTriggerSkills(servant, async () => {
      calls += 1;
      return {} as Skill.Skill;
    });
    expect(calls).toBe(0);
  });
});
