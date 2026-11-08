import { Buff, Func, type CraftEssence, type Servant as ServantModule, type Skill } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ServantBuild } from "../account/types.js";
import type { EquippedCraftEssence } from "../battle/battleState.js";
import type { Wave, WaveEnemy } from "../quest/types.js";
import { buildInitialBattleState, partyMemberBattleId, supportBattleId, type PartyMemberSpec } from "./battleStateBuilder.js";

function niceServant(overrides: Partial<ServantModule.Servant> = {}): ServantModule.Servant {
  return {
    atkGrowth: [0, 1000, 2000],
    hpGrowth: [0, 500, 1000],
    className: "saber" as ServantModule.Servant["className"],
    attribute: "human" as ServantModule.Servant["attribute"],
    traits: [{ id: 100 }],
    cards: ["2", "2", "1", "1", "3"],
    starAbsorb: 90,
    cost: 16,
    ...overrides,
  } as unknown as ServantModule.Servant;
}

function craftEssence(overrides: Partial<CraftEssence.CraftEssence> = {}): CraftEssence.CraftEssence {
  return {
    atkGrowth: [0, 0, 300],
    hpGrowth: [0, 0, 150],
    cost: 12,
    ...overrides,
  } as unknown as CraftEssence.CraftEssence;
}

function passiveSkill(
  condLimitCount: number,
  priority: number,
  functions: readonly Func.Func[],
): Skill.Skill {
  return { condLimitCount, priority, functions } as unknown as Skill.Skill;
}

function gainNp(value: number): Func.Func {
  return {
    funcType: Func.FuncType.GAIN_NP,
    funcTargetType: Func.FuncTargetType.SELF,
    svals: [{ Value: value }],
    buffs: [],
  } as unknown as Func.Func;
}

function gainStars(value: number): Func.Func {
  return {
    funcType: Func.FuncType.GAIN_STAR,
    funcTargetType: Func.FuncTargetType.SELF,
    svals: [{ Value: value }],
    buffs: [],
  } as unknown as Func.Func;
}

function selfBuff(type: Buff.BuffType, value: number): Func.Func {
  return {
    funcType: Func.FuncType.ADD_STATE,
    funcTargetType: Func.FuncTargetType.SELF,
    svals: [{ Value: value, Turn: -1, Count: -1 }],
    buffs: [{ type, ckSelfIndv: [], ckOpIndv: [], buffGroup: 0, vals: [] }],
  } as unknown as Func.Func;
}

function build(overrides: Partial<ServantBuild> = {}): ServantBuild {
  return {
    servantId: 100,
    level: 2,
    ascension: 1,
    skillLevels: [1, 1, 1],
    appendSkillLevels: {},
    npLevel: 1,
    fou: { atk: 0, hp: 0 },
    commandCodeIds: [],
    ...overrides,
  };
}

function member(servantId: number, isFrontLine: boolean, equippedCe?: EquippedCraftEssence): PartyMemberSpec {
  const base = { niceServant: niceServant(), build: build({ servantId }), isFrontLine };
  return equippedCe === undefined ? base : { ...base, equippedCe };
}

function waveEnemy(overrides: Partial<WaveEnemy> = {}): WaveEnemy {
  return {
    npcId: 9001,
    atk: 8000,
    hp: 50000,
    deathRate: 500,
    chargeTurn: 4,
    traits: [{ id: 200 }],
    svt: { className: "lancer", attribute: "earth" },
    enemyScript: {},
    ...overrides,
  } as unknown as WaveEnemy;
}

function wave(overrides: Partial<Wave> = {}): Wave {
  return { waveNumber: 1, initialEnemies: [waveEnemy()], enemyPool: [waveEnemy()], ...overrides };
}

describe("buildInitialBattleState", () => {
  const party = [member(1, true), member(2, true), member(3, true)];

  it("assembles a valid turn-1 BattleState: 3 servants, dealt hand, remaining bag, enemies from wave 0", () => {
    const state = buildInitialBattleState(party, [wave()], { costBudget: 100 });
    expect(state.currentTurn).toBe(1);
    expect(state.currentWaveIndex).toBe(0);
    expect(state.servants).toHaveLength(3);
    expect(state.handCards).toHaveLength(5);
    expect(state.cardBag).toHaveLength(10); // 15-card deck - 5 dealt
    expect(state.handCardStars).toEqual([0, 0, 0, 0, 0]); // starsCarried starts at 0
    expect(state.starsCarried).toBe(0);
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]?.npcId).toBe(9001);
    expect(state.enemies[0]?.deathRate).toBe(500);
    expect(state.enemies[0]?.npTurnLimit).toBe(4);
  });

  it("computes costSpent from niceServant.cost, ignoring ServantInstance (which carries no cost field)", () => {
    const state = buildInitialBattleState(party, [wave()], { costBudget: 100 });
    expect(state.costSpent).toBe(16 * 3); // each member's niceServant.cost, no CE equipped
  });

  it("adds the equipped CE's own cost on top of the servant's", () => {
    const withCe = [member(1, true, { data: craftEssence(), level: 3 }), member(2, true), member(3, true)];
    const state = buildInitialBattleState(withCe, [wave()], { costBudget: 100 });
    expect(state.costSpent).toBe(16 * 3 + 12);
  });

  it("defaults commandSealsRemaining to 0 and fieldTraits to empty, overridable via options", () => {
    const defaulted = buildInitialBattleState(party, [wave()], { costBudget: 100 });
    expect(defaulted.commandSealsRemaining).toBe(0);
    expect(defaulted.fieldTraits.size).toBe(0);

    const overridden = buildInitialBattleState(party, [wave()], { costBudget: 100, commandSealsRemaining: 2, fieldTraits: new Set([1234]) });
    expect(overridden.commandSealsRemaining).toBe(2);
    expect(overridden.fieldTraits).toEqual(new Set([1234]));
  });

  it("produces an empty enemies array when the waves list is empty", () => {
    const state = buildInitialBattleState(party, [], { costBudget: 100 });
    expect(state.enemies).toEqual([]);
  });

  it("propagates buildCombinedCardDeck's error when the party doesn't have exactly 3 front-line servants", () => {
    const tooFew = [member(1, true), member(2, true)];
    expect(() => buildInitialBattleState(tooFew, [wave()], { costBudget: 100 })).toThrow(RangeError);
  });

  it("is deterministic given an explicit randomFn", () => {
    const a = buildInitialBattleState(party, [wave()], { costBudget: 100, randomFn: () => 0.5 });
    const b = buildInitialBattleState(party, [wave()], { costBudget: 100, randomFn: () => 0.5 });
    expect(a.handCards).toEqual(b.handCards);
    expect(a.cardBag).toEqual(b.cardBag);
  });

  it("selects the highest CE passive tier allowed by the owned limit-break count", () => {
    const ce = craftEssence({
      skills: [
        passiveSkill(0, 1, [gainNp(8000)]),
        passiveSkill(2, 2, [gainNp(9000)]),
        passiveSkill(4, 3, [gainNp(10000)]),
      ],
    });
    const gaugeAt = (limitBreakCount: 0 | 1 | 2 | 3 | 4) => buildInitialBattleState([
      member(1, true, { data: ce, level: 1, limitBreakCount }),
      member(2, true),
      member(3, true),
    ], [wave()], { costBudget: 100 }).servants[0]?.currentNpGauge;

    expect(gaugeAt(0)).toBe(8000);
    expect(gaugeAt(1)).toBe(8000);
    expect(gaugeAt(2)).toBe(9000);
    expect(gaugeAt(3)).toBe(9000);
    expect(gaugeAt(4)).toBe(10000);
  });

  it("applies supported CE passive buffs before turn 1", () => {
    const ce = craftEssence({
      skills: [passiveSkill(0, 1, [selfBuff(Buff.BuffType.UP_ATK, 200)])],
    });
    const state = buildInitialBattleState([
      member(1, true, { data: ce, level: 1, limitBreakCount: 0 }),
      member(2, true),
      member(3, true),
    ], [wave()], { costBudget: 100 });

    expect(state.servants[0]?.activeBuffs).toEqual([
      expect.objectContaining({ type: Buff.BuffType.UP_ATK, amount: 200 }),
    ]);
  });

  it("applies the servant's own class passives and unlocked append skills before turn 1", () => {
    const append = (num: number, functions: readonly Func.Func[]) => ({ num, skill: { functions: functions.map((f) => ({ ...f, svals: Array.from({ length: 10 }, (_, i) => ({ ...f.svals[0], Value: (f.svals[0]?.Value ?? 0) * (i + 1) })) })) } });
    const kit = niceServant({
      classPassive: [passiveSkill(0, 0, [selfBuff(Buff.BuffType.UP_COMMANDALL, 80)])],
      extraPassive: [passiveSkill(0, 0, [selfBuff(Buff.BuffType.UP_ATK, 999)])],
      appendPassive: [append(100, [selfBuff(Buff.BuffType.UP_CRITICALDAMAGE, 30)]), append(101, [gainNp(100)]), append(102, [selfBuff(Buff.BuffType.UP_DAMAGE, 30)])],
    } as unknown as Partial<ServantModule.Servant>);
    const withKit: PartyMemberSpec = { niceServant: kit, build: build({ servantId: 1, appendSkillLevels: { 2: 10, 3: 1 } }), isFrontLine: true };
    const state = buildInitialBattleState([withKit, member(2, true), member(3, true)], [wave()], { costBudget: 100 });
    const servant = state.servants[0];

    expect(servant?.activeBuffs.map((b) => [b.type, b.amount])).toEqual([[Buff.BuffType.UP_COMMANDALL, 80], [Buff.BuffType.UP_DAMAGE, 30]]);
    expect(servant?.currentNpGauge).toBe(1000);
    expect(state.servants[1]?.activeBuffs).toEqual([]);
  });

  it("allocates a front-line CE star bomb to the opening hand but ignores a benched holder", () => {
    const starCe = craftEssence({ skills: [passiveSkill(0, 1, [gainStars(10)])] });
    const state = buildInitialBattleState([
      member(1, true, { data: starCe, level: 1, limitBreakCount: 0 }),
      member(2, true),
      member(3, true),
      member(4, false, { data: starCe, level: 1, limitBreakCount: 0 }),
    ], [wave()], { costBudget: 200, randomFn: () => 0.5 });

    expect(state.handCardStars.reduce((sum, stars) => sum + stars, 0)).toBe(10);
    expect(state.starsCarried).toBe(0);
  });
});

describe("borrowed support battle identity", () => {
  it("keys a borrowed support apart from an owned copy of the same servant", () => {
    const support: PartyMemberSpec = { ...member(1, true), isSupport: true };
    const state = buildInitialBattleState([member(1, true), member(2, true), support], [wave()], { costBudget: 100 });
    const supportId = supportBattleId(1);
    expect(supportId).not.toBe(1);
    expect(state.servants.map((servant) => servant.servantId)).toEqual([1, 2, supportId]);
    expect(partyMemberBattleId(support)).toBe(supportId);
    expect(partyMemberBattleId(member(1, true))).toBe(1);
    expect(state.handCards.concat(state.cardBag).filter((card) => card.servantId === supportId)).toHaveLength(5);
  });

  it("leaves a borrowed support out of the party Cost", () => {
    const support: PartyMemberSpec = { ...member(3, true), isSupport: true };
    const state = buildInitialBattleState([member(1, true), member(2, true), support], [wave()], { costBudget: 100 });
    expect(state.costSpent).toBe(32);
  });
});
