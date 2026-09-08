import type { Buff, Card, CardDetail } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ActiveBuffInstance } from "../buffs/types.js";
import type { Action } from "./action.js";
import type { BattleState, EnemyInstance, ServantInstance } from "./battleState.js";
import { BUFF_ACTION_KEYS } from "./buffActionKeys.js";
import type { TrackedBuff } from "./buffLifecycle.js";
import type { BattleConstants } from "./gameConstants.js";
import type { HitResolutionContext } from "./hitResolution.js";
import { resolveAction } from "./turnLoop.js";

const BUSTER = "2" as Card;
const ARTS = "1" as Card;
const QUICK = "3" as Card;
const FIVE_CARD_DECK: readonly Card[] = [BUSTER, BUSTER, ARTS, ARTS, QUICK];

function percentAction(plusType: string, minusType: string, baseValue = 0): Buff.BuffConstant {
  return {
    limit: "normal" as Buff.BuffLimit,
    plusTypes: [plusType] as Buff.BuffType[],
    minusTypes: [minusType] as Buff.BuffType[],
    baseParam: 1000,
    baseValue,
    isRec: true,
    plusAction: 0,
    maxRate: [5000],
  };
}

function flatAction(plusType: string, minusType: string): Buff.BuffConstant {
  return {
    limit: "none" as Buff.BuffLimit,
    plusTypes: [plusType] as Buff.BuffType[],
    minusTypes: [minusType] as Buff.BuffType[],
    baseParam: 0,
    baseValue: 0,
    isRec: true,
    plusAction: 0,
    maxRate: [0],
  };
}

const BUFF_CONSTANTS = {
  [BUFF_ACTION_KEYS.ATK]: percentAction("upAtk", "downAtk"),
  [BUFF_ACTION_KEYS.DEFENCE]: percentAction("upDefence", "downDefence"),
  [BUFF_ACTION_KEYS.COMMAND_ATK]: percentAction("upCommandatk", "downCommandatk"),
  [BUFF_ACTION_KEYS.COMMAND_DEF]: percentAction("upDefenceCommanddamage", "downDefenceCommanddamage"),
  [BUFF_ACTION_KEYS.SPECIAL_DEFENCE]: percentAction("upSpecialdefence", "downSpecialdefence"),
  [BUFF_ACTION_KEYS.DAMAGE]: percentAction("upDamage", "downDamage", 1000),
  [BUFF_ACTION_KEYS.DAMAGE_INDIVIDUALITY]: percentAction("upDamageIndividuality", "downDamageIndividuality", 1000),
  [BUFF_ACTION_KEYS.DAMAGE_INDIVIDUALITY_ACTIVEONLY]: percentAction(
    "upDamageIndividualityActiveonly",
    "downDamageIndividualityActiveonly",
    1000,
  ),
  [BUFF_ACTION_KEYS.SELF_DAMAGE]: percentAction("upSelfdamage", "downSelfdamage", 1000),
  [BUFF_ACTION_KEYS.CRITICAL_DAMAGE]: percentAction("upCriticaldamage", "downCriticaldamage", 1000),
  [BUFF_ACTION_KEYS.NP_DAMAGE]: percentAction("upNpdamage", "downNpdamage", 1000),
  [BUFF_ACTION_KEYS.GIVEN_DAMAGE]: flatAction("addDamage", "subDamage"),
  [BUFF_ACTION_KEYS.RECEIVE_DAMAGE]: flatAction("addSelfdamage", "subSelfdamage"),
  [BUFF_ACTION_KEYS.COMMAND_NP_ATK]: percentAction("upCommandnp", "downCommandnp"),
  [BUFF_ACTION_KEYS.COMMAND_NP_DEF]: percentAction("upDefenceCommandnp", "downDefenceCommandnp"),
  [BUFF_ACTION_KEYS.DROP_NP]: percentAction("upDropnp", "downDropnp"),
  [BUFF_ACTION_KEYS.DROP_NP_DAMAGE]: percentAction("upDamagedropnp", "downDamagedropnp"),
  [BUFF_ACTION_KEYS.COMMAND_STAR_ATK]: percentAction("upCommandstar", "downCommandstar"),
  [BUFF_ACTION_KEYS.COMMAND_STAR_DEF]: percentAction("upDefenceCommandstar", "downDefenceCommandstar"),
  [BUFF_ACTION_KEYS.CRITICAL_POINT]: percentAction("upCriticalpoint", "downCriticalpoint", 1000),
} as unknown as Buff.BuffConstantMap;

const CARD_CONSTANTS = {
  "2": {
    1: { individuality: [], adjustAtk: 1200, adjustTdGauge: 1000, adjustCritical: 1400, addAtk: 300, addTdGauge: 0, addCritical: 50 },
  },
  "5": {
    1: { individuality: [], adjustAtk: 1200, adjustTdGauge: 1000, adjustCritical: 0, addAtk: 300, addTdGauge: 0, addCritical: 0 },
  },
} as unknown as CardDetail.CardConstantMap;

const CONSTANTS: BattleConstants = {
  buff: BUFF_CONSTANTS,
  card: CARD_CONSTANTS,
  classAttack: { saber: 1000 } as BattleConstants["classAttack"],
  classAffinity: { saber: { lancer: 1000 } } as BattleConstants["classAffinity"],
  attribute: { human: { earth: 1000 } } as BattleConstants["attribute"],
};

function trackedBuff(overrides: Partial<TrackedBuff> = {}): TrackedBuff {
  const base: ActiveBuffInstance = { type: "upAtk" as Buff.BuffType, amount: 200, ckSelfIndv: [], ckOpIndv: [], buffGroup: 0 };
  return { ...base, turnsRemaining: 3, usesRemaining: null, ...overrides };
}

function servant(overrides: Partial<ServantInstance> = {}): ServantInstance {
  return {
    servantId: 1,
    isFrontLine: true,
    cardTypes: FIVE_CARD_DECK,
    npLevel: 1,
    atk: 10000,
    className: "saber" as ServantInstance["className"],
    attribute: "human" as ServantInstance["attribute"],
    traits: new Set(),
    currentHp: 15000,
    maxHp: 15000,
    currentNpGauge: 0,
    activeBuffs: [],
    skillCooldowns: [3, 2, 0],
    ...overrides,
  };
}

function enemy(overrides: Partial<EnemyInstance> = {}): EnemyInstance {
  return {
    npcId: 9001,
    atk: 8000,
    className: "lancer" as EnemyInstance["className"],
    attribute: "earth" as EnemyInstance["attribute"],
    traits: new Set(),
    currentHp: 50000,
    maxHp: 50000,
    activeBuffs: [],
    ...overrides,
  };
}

function state(overrides: Partial<BattleState> = {}): BattleState {
  return {
    waves: [],
    currentWaveIndex: 0,
    currentTurn: 1,
    servants: [servant({ servantId: 1 }), servant({ servantId: 2 }), servant({ servantId: 3 })],
    enemies: [enemy()],
    handCards: [...FIVE_CARD_DECK],
    cardBag: [],
    starsCarried: 0,
    fieldTraits: new Set(),
    costSpent: 0,
    costBudget: 100,
    consecutiveNpChainCount: 2,
    commandSealsRemaining: 3,
    ...overrides,
  };
}

const END_TURN: Action = { type: "endTurn" };

const CARD_CONTEXT: HitResolutionContext = {
  card: { type: BUSTER, position: 1 },
  isCrit: false,
  npDamageMultiplier: 1,
  randomModifier: 1,
  extraCardChainType: "none",
  isSuperEffective: false,
  superEffectiveModifier: 1,
  isNP: false,
  isBusterChain: false,
  offensiveNPRate: 500,
  npEnemyServerMod: 1,
  baseStarRate: 500,
  starEnemyServerMod: 0,
};

const NP_CONTEXT: HitResolutionContext = { ...CARD_CONTEXT, card: { type: "5" as Card, position: 1 }, isNP: true };

describe("resolveAction — endTurn", () => {
  it("decrements every front-line servant's skill cooldowns, floored at 0", () => {
    const result = resolveAction(state(), END_TURN, CONSTANTS);
    for (const s of result.servants) {
      expect(s.skillCooldowns).toEqual([2, 1, 0]);
    }
  });

  it("decrements front-line servants' Turn-based buffs and drops expired ones", () => {
    const buffs = [trackedBuff({ turnsRemaining: 1 }), trackedBuff({ turnsRemaining: 3, buffGroup: 1 })];
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, activeBuffs: buffs }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      END_TURN,
      CONSTANTS,
    );
    expect(result.servants[0]?.activeBuffs).toHaveLength(1);
    expect(result.servants[0]?.activeBuffs[0]?.turnsRemaining).toBe(2);
  });

  it("leaves a benched (sub-member) servant's buffs and cooldowns completely frozen", () => {
    const benched = servant({ servantId: 4, isFrontLine: false, skillCooldowns: [5, 5, 5], activeBuffs: [trackedBuff({ turnsRemaining: 1 })] });
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1 }), servant({ servantId: 2 }), servant({ servantId: 3 }), benched] }),
      END_TURN,
      CONSTANTS,
    );
    const benchedAfter = result.servants.find((s) => s.servantId === 4);
    expect(benchedAfter?.skillCooldowns).toEqual([5, 5, 5]);
    expect(benchedAfter?.activeBuffs).toEqual([trackedBuff({ turnsRemaining: 1 })]);
  });

  it("advances enemy Turn-based buffs too", () => {
    const result = resolveAction(state({ enemies: [enemy({ activeBuffs: [trackedBuff({ turnsRemaining: 1 })] })] }), END_TURN, CONSTANTS);
    expect(result.enemies[0]?.activeBuffs).toHaveLength(0);
  });

  it("draws a fresh 5-card hand from the 3 front-line servants' combined deck when the bag is empty", () => {
    const result = resolveAction(state({ cardBag: [] }), END_TURN, CONSTANTS, () => 0);
    expect(result.handCards).toHaveLength(5);
    expect(result.cardBag).toHaveLength(10);
  });

  it("deals from a non-empty bag without reshuffling", () => {
    const bag = FIVE_CARD_DECK.slice(0, 5).concat(FIVE_CARD_DECK.slice(0, 5));
    const result = resolveAction(state({ cardBag: bag }), END_TURN, CONSTANTS, () => {
      throw new Error("should not reshuffle");
    });
    expect(result.handCards).toEqual(bag.slice(0, 5));
    expect(result.cardBag).toEqual(bag.slice(5));
  });

  it("increments currentTurn and resets consecutiveNpChainCount", () => {
    const result = resolveAction(state({ currentTurn: 1, consecutiveNpChainCount: 2 }), END_TURN, CONSTANTS);
    expect(result.currentTurn).toBe(2);
    expect(result.consecutiveNpChainCount).toBe(0);
  });
});

describe("resolveAction — playCard", () => {
  const action: Action = { type: "playCard", servantId: 1, handCardIndex: 0, targetNpcId: 9001, context: CARD_CONTEXT };

  it("deals damage, reduces the target's HP, and grants the acting servant NP gauge", () => {
    const result = resolveAction(state(), action, CONSTANTS);
    const targetEnemy = result.enemies.find((e) => e.npcId === 9001);
    const actingServant = result.servants.find((s) => s.servantId === 1);
    expect(targetEnemy?.currentHp).toBeLessThan(50000);
    expect(actingServant?.currentNpGauge).toBeGreaterThan(0);
  });

  it("removes the played card from the hand and resets consecutiveNpChainCount", () => {
    const result = resolveAction(state({ consecutiveNpChainCount: 3 }), action, CONSTANTS);
    expect(result.handCards).toEqual(FIVE_CARD_DECK.slice(1));
    expect(result.consecutiveNpChainCount).toBe(0);
  });

  it("consumes one charge of a blocking Evade buff and leaves the target's HP unchanged", () => {
    const evade = trackedBuff({ type: "avoidance" as Buff.BuffType, buffGroup: 200, turnsRemaining: null, usesRemaining: 1 });
    const result = resolveAction(state({ enemies: [enemy({ activeBuffs: [evade] })] }), action, CONSTANTS);
    const targetEnemy = result.enemies.find((e) => e.npcId === 9001);
    expect(targetEnemy?.currentHp).toBe(50000);
    expect(targetEnemy?.activeBuffs).toHaveLength(0);
  });

  it("caps NP gauge gain at this servant's own NP-level cap (100% at NP level 1)", () => {
    const result = resolveAction(state({ servants: [servant({ servantId: 1, npLevel: 1, currentNpGauge: 9999 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }), action, CONSTANTS);
    const actingServant = result.servants.find((s) => s.servantId === 1);
    expect(actingServant?.currentNpGauge).toBeLessThanOrEqual(10000);
  });

  it("allows accumulation up to a higher NP-level's cap (300% at NP level 5)", () => {
    const result = resolveAction(state({ servants: [servant({ servantId: 1, npLevel: 5, currentNpGauge: 29999 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }), action, CONSTANTS);
    const actingServant = result.servants.find((s) => s.servantId === 1);
    expect(actingServant?.currentNpGauge).toBeLessThanOrEqual(30000);
    expect(actingServant?.currentNpGauge).toBeGreaterThan(10000);
  });

  it("throws when handCardIndex is out of range", () => {
    expect(() => resolveAction(state(), { ...action, handCardIndex: 99 }, CONSTANTS)).toThrow(RangeError);
  });

  it("throws when context.card.type doesn't match the actual hand card", () => {
    const mismatched: Action = { ...action, context: { ...CARD_CONTEXT, card: { type: ARTS, position: 1 } } };
    expect(() => resolveAction(state(), mismatched, CONSTANTS)).toThrow(RangeError);
  });

  it("throws when context.isNP is true", () => {
    const wrongFlag: Action = { ...action, context: { ...CARD_CONTEXT, isNP: true } };
    expect(() => resolveAction(state(), wrongFlag, CONSTANTS)).toThrow(RangeError);
  });

  it("throws for an unknown servantId", () => {
    expect(() => resolveAction(state(), { ...action, servantId: 999 }, CONSTANTS)).toThrow(RangeError);
  });

  it("throws for a benched servant", () => {
    const benched = servant({ servantId: 4, isFrontLine: false });
    expect(() => resolveAction(state({ servants: [servant({ servantId: 1 }), servant({ servantId: 2 }), benched] }), { ...action, servantId: 4 }, CONSTANTS)).toThrow(RangeError);
  });

  it("throws for an unknown targetNpcId", () => {
    expect(() => resolveAction(state(), { ...action, targetNpcId: 12345 }, CONSTANTS)).toThrow(RangeError);
  });
});

describe("resolveAction — castNp", () => {
  const action: Action = { type: "castNp", servantId: 1, targetNpcId: 9001, context: NP_CONTEXT };

  it("deals damage without touching the hand, and increments consecutiveNpChainCount", () => {
    const result = resolveAction(state({ consecutiveNpChainCount: 1 }), action, CONSTANTS);
    const targetEnemy = result.enemies.find((e) => e.npcId === 9001);
    expect(targetEnemy?.currentHp).toBeLessThan(50000);
    expect(result.handCards).toEqual(FIVE_CARD_DECK);
    expect(result.consecutiveNpChainCount).toBe(2);
  });

  it("fully resets the caster's NP gauge to 0, regardless of leftover amount", () => {
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, npLevel: 2, currentNpGauge: 14000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    const actingServant = result.servants.find((s) => s.servantId === 1);
    expect(actingServant?.currentNpGauge).toBe(0);
  });

  it("throws when context.isNP is false", () => {
    const wrongFlag: Action = { ...action, context: { ...NP_CONTEXT, isNP: false } };
    expect(() => resolveAction(state(), wrongFlag, CONSTANTS)).toThrow(RangeError);
  });
});

describe("resolveAction — useCommandSeal", () => {
  it("fillNpGauge raises the target's gauge to 100% and costs 1 seal", () => {
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, npLevel: 2, currentNpGauge: 5000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      { type: "useCommandSeal", effect: { kind: "fillNpGauge", servantId: 1 } },
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentNpGauge).toBe(10000);
    expect(result.commandSealsRemaining).toBe(2);
  });

  it("fillNpGauge never lowers a gauge already above 100% (NP level 2-5 can hold up to 200%/300%)", () => {
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, npLevel: 3, currentNpGauge: 15000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      { type: "useCommandSeal", effect: { kind: "fillNpGauge", servantId: 1 } },
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentNpGauge).toBe(15000);
  });

  it("healHp sets the target's HP to maxHp and costs 1 seal", () => {
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 100, maxHp: 15000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      { type: "useCommandSeal", effect: { kind: "healHp", servantId: 1 } },
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentHp).toBe(15000);
    expect(result.commandSealsRemaining).toBe(2);
  });

  it("reviveParty revives every dead servant (front-line or benched) to full HP and their own NP-level gauge cap, costing all 3 seals", () => {
    const benched = servant({ servantId: 4, isFrontLine: false, currentHp: 0, maxHp: 12000, npLevel: 5 });
    const result = resolveAction(
      state({
        servants: [
          servant({ servantId: 1, currentHp: 0, maxHp: 15000, npLevel: 1 }),
          servant({ servantId: 2, currentHp: 8000 }),
          servant({ servantId: 3 }),
          benched,
        ],
      }),
      { type: "useCommandSeal", effect: { kind: "reviveParty" } },
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)).toMatchObject({ currentHp: 15000, currentNpGauge: 10000 });
    expect(result.servants.find((s) => s.servantId === 2)?.currentHp).toBe(8000);
    expect(result.servants.find((s) => s.servantId === 4)).toMatchObject({ currentHp: 12000, currentNpGauge: 30000 });
    expect(result.commandSealsRemaining).toBe(0);
  });

  it("throws when fewer seals remain than the effect costs", () => {
    expect(() =>
      resolveAction(state({ commandSealsRemaining: 2 }), { type: "useCommandSeal", effect: { kind: "reviveParty" } }, CONSTANTS),
    ).toThrow(RangeError);
  });

  it("throws for an unknown servantId target", () => {
    expect(() =>
      resolveAction(state(), { type: "useCommandSeal", effect: { kind: "healHp", servantId: 999 } }, CONSTANTS),
    ).toThrow(RangeError);
  });
});

describe("resolveAction — not-yet-implemented actions", () => {
  const cases: Action[] = [
    { type: "useSkill", servantId: 1, skillSlot: 1 },
    { type: "useMysticCodeSkill", slot: 1 },
    { type: "orderChange", outgoingServantId: 1, incomingServantId: 4 },
  ];

  it.each(cases)("throws for $type", (action) => {
    expect(() => resolveAction(state(), action, CONSTANTS)).toThrow(/not implemented yet/);
  });
});
