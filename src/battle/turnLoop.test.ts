import type { Buff, Card, CardDetail } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { ActiveBuffInstance } from "../buffs/types.js";
import type { Action, DerivedHitContext } from "./action.js";
import type { BattleState, EnemyInstance, HandCard, ServantInstance } from "./battleState.js";
import { BUFF_ACTION_KEYS } from "./buffActionKeys.js";
import type { TrackedBuff } from "./buffLifecycle.js";
import type { BattleConstants } from "./gameConstants.js";
import type {
  BuffGrantEffect,
  GainHpEffect,
  GainHpPercentEffect,
  GainNpEffect,
  GainStarEffect,
  InstantDeathEffect,
  LossHpPercentEffect,
  LossHpSafeEffect,
  LossNpEffect,
  LossStarEffect,
  RemoveBuffEffect,
  RevivalEffect,
  ShortenSkillEffect,
} from "./skillEffect.js";
import { resolveAction } from "./turnLoop.js";

const BUSTER = "2" as Card;
const ARTS = "1" as Card;
const QUICK = "3" as Card;
const FIVE_CARD_DECK: readonly Card[] = [BUSTER, BUSTER, ARTS, ARTS, QUICK];

function handCardsFor(cards: readonly Card[], servantId = 1): readonly HandCard[] {
  return cards.map((card): HandCard => ({ card, servantId }));
}

const FIVE_CARD_HAND: readonly HandCard[] = handCardsFor(FIVE_CARD_DECK, 1);

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
  "1": {
    1: { individuality: [], adjustAtk: 300, adjustTdGauge: 3000, adjustCritical: 1000, addAtk: 0, addTdGauge: 0, addCritical: 0 },
  },
  "2": {
    1: { individuality: [], adjustAtk: 1200, adjustTdGauge: 1000, adjustCritical: 1400, addAtk: 300, addTdGauge: 0, addCritical: 50 },
  },
  "3": {
    1: { individuality: [], adjustAtk: 800, adjustTdGauge: 1000, adjustCritical: 1000, addAtk: 0, addTdGauge: 0, addCritical: 0 },
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
    criticalWeight: 99,
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
    handCards: FIVE_CARD_HAND,
    cardBag: [],
    starsCarried: 0,
    handCardStars: [0, 0, 0, 0, 0],
    critChanceBonusCarried: 0,
    activeCritChanceBonus: 0,
    fieldTraits: new Set(),
    costSpent: 0,
    costBudget: 100,
    consecutiveNpChainCount: 2,
    commandSealsRemaining: 3,
    mysticCodeSkillCooldowns: [0, 0, 0],
    ...overrides,
  };
}

function buffGrantEffect(overrides: Partial<BuffGrantEffect> = {}): BuffGrantEffect {
  return {
    kind: "grantBuff",
    buff: { type: "upAtk" as Buff.BuffType, amount: 300, ckSelfIndv: [], ckOpIndv: [], buffGroup: 0 },
    rawTurn: 3,
    rawCount: -1,
    targetType: "self",
    ...overrides,
  };
}

function removeBuffEffect(overrides: Partial<RemoveBuffEffect> = {}): RemoveBuffEffect {
  return {
    kind: "removeBuff",
    targetTrait: 3004,
    targetType: "self",
    ...overrides,
  };
}

function gainNpEffect(overrides: Partial<GainNpEffect> = {}): GainNpEffect {
  return {
    kind: "gainNp",
    rawAmount: 3000,
    targetType: "self",
    ...overrides,
  };
}

function gainHpEffect(overrides: Partial<GainHpEffect> = {}): GainHpEffect {
  return {
    kind: "gainHp",
    rawAmount: 3000,
    targetType: "self",
    ...overrides,
  };
}

function gainHpPercentEffect(overrides: Partial<GainHpPercentEffect> = {}): GainHpPercentEffect {
  return {
    kind: "gainHpPercent",
    rawPercent: 300,
    targetType: "self",
    ...overrides,
  };
}

function revivalEffect(overrides: Partial<RevivalEffect> = {}): RevivalEffect {
  return {
    kind: "revival",
    targetType: "self",
    ...overrides,
  };
}

function gainStarEffect(overrides: Partial<GainStarEffect> = {}): GainStarEffect {
  return {
    kind: "gainStar",
    rawAmount: 10,
    ...overrides,
  };
}

function lossNpEffect(overrides: Partial<LossNpEffect> = {}): LossNpEffect {
  return {
    kind: "lossNp",
    rawAmount: 3000,
    targetType: "self",
    ...overrides,
  };
}

function lossHpSafeEffect(overrides: Partial<LossHpSafeEffect> = {}): LossHpSafeEffect {
  return {
    kind: "lossHpSafe",
    rawPercent: 500,
    targetType: "self",
    ...overrides,
  };
}

function shortenSkillEffect(overrides: Partial<ShortenSkillEffect> = {}): ShortenSkillEffect {
  return {
    kind: "shortenSkill",
    rawTurns: 1,
    targetType: "self",
    ...overrides,
  };
}

function lossStarEffect(overrides: Partial<LossStarEffect> = {}): LossStarEffect {
  return {
    kind: "lossStar",
    rawAmount: 10,
    ...overrides,
  };
}

function lossHpPercentEffect(overrides: Partial<LossHpPercentEffect> = {}): LossHpPercentEffect {
  return {
    kind: "lossHpPercent",
    rawPercent: 500,
    targetType: "self",
    ...overrides,
  };
}

function instantDeathEffect(overrides: Partial<InstantDeathEffect> = {}): InstantDeathEffect {
  return {
    kind: "instantDeath",
    deathRate: 600,
    targetType: "enemyOne",
    ...overrides,
  };
}

const END_TURN: Action = { type: "endTurn" };

const CARD_CONTEXT: DerivedHitContext = {
  card: { type: BUSTER, position: 1 },
  npDamageMultiplier: 1,
  randomModifier: 1,
  isSuperEffective: false,
  superEffectiveModifier: 1,
  isNP: false,
  offensiveNPRate: 500,
  npEnemyServerMod: 1,
  baseStarRate: 500,
  starEnemyServerMod: 0,
};

const NP_CONTEXT: DerivedHitContext = { ...CARD_CONTEXT, card: { type: "5" as Card, position: 1 }, isNP: true };

/**
 * A Mighty Chain (one of each color) across 3 *different* servants — the default `playCard`
 * test action's chain. Not a Brave Chain (different servants), so `extraCardChainTypeFrom`
 * still resolves to `"none"` despite the Mighty classification, keeping this baseline's
 * derived `isBusterChain`/`extraCardChainType` identical to the pre-derivation manual
 * defaults (`false`/`"none"`) most of these tests were written against.
 */
const DEFAULT_CHAIN_CARDS: readonly { readonly type: Card; readonly servantId: number }[] = [
  { type: BUSTER, servantId: 1 },
  { type: ARTS, servantId: 2 },
  { type: QUICK, servantId: 3 },
];

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
    // A fixed randomFn (rather than a throwing one) since `resolveEndTurn` now also calls
    // `allocateCritStars`, which legitimately rolls randomness for the crit-star slot-bonus
    // shuffle (unrelated to the bag/hand draw this test is actually about).
    const bag = handCardsFor(FIVE_CARD_DECK.slice(0, 5).concat(FIVE_CARD_DECK.slice(0, 5)));
    const result = resolveAction(state({ cardBag: bag }), END_TURN, CONSTANTS, () => 0);
    expect(result.handCards).toEqual(bag.slice(0, 5));
    expect(result.cardBag).toEqual(bag.slice(5));
  });

  it("increments currentTurn and resets consecutiveNpChainCount", () => {
    const result = resolveAction(state({ currentTurn: 1, consecutiveNpChainCount: 2 }), END_TURN, CONSTANTS);
    expect(result.currentTurn).toBe(2);
    expect(result.consecutiveNpChainCount).toBe(0);
  });

  it("decrements the Mystic Code's skill cooldowns too, floored at 0", () => {
    const result = resolveAction(state({ mysticCodeSkillCooldowns: [2, 0, 5] }), END_TURN, CONSTANTS);
    expect(result.mysticCodeSkillCooldowns).toEqual([1, 0, 4]);
  });

  it("allocates starsCarried across the freshly-drawn hand via the crit-star lottery, one entry per hand slot", () => {
    const result = resolveAction(state({ starsCarried: 9 }), END_TURN, CONSTANTS, () => 0);
    expect(result.handCardStars).toHaveLength(5);
    expect(result.handCardStars.reduce((sum, s) => sum + s, 0)).toBe(9);
  });

  it("resets starsCarried to 0 after allocating it, so it isn't re-rolled onto a later turn's hand too", () => {
    const result = resolveAction(state({ starsCarried: 9 }), END_TURN, CONSTANTS, () => 0);
    expect(result.starsCarried).toBe(0);
  });

  it("activates critChanceBonusCarried into activeCritChanceBonus for the freshly-drawn hand, then resets critChanceBonusCarried to 0", () => {
    const result = resolveAction(state({ critChanceBonusCarried: 0.2 }), END_TURN, CONSTANTS, () => 0);
    expect(result.activeCritChanceBonus).toBe(0.2);
    expect(result.critChanceBonusCarried).toBe(0);
  });

  it("does not carry the previous turn's activeCritChanceBonus forward when nothing new was earned", () => {
    const result = resolveAction(state({ activeCritChanceBonus: 0.2, critChanceBonusCarried: 0 }), END_TURN, CONSTANTS, () => 0);
    expect(result.activeCritChanceBonus).toBe(0);
  });
});

describe("resolveAction — playCard", () => {
  const action: Action = { type: "playCard", servantId: 1, handCardIndex: 0, targetNpcId: 9001, context: CARD_CONTEXT, chainCards: DEFAULT_CHAIN_CARDS, chainPosition: 1 };

  it("deals damage, reduces the target's HP, and grants the acting servant NP gauge", () => {
    const result = resolveAction(state(), action, CONSTANTS);
    const targetEnemy = result.enemies.find((e) => e.npcId === 9001);
    const actingServant = result.servants.find((s) => s.servantId === 1);
    expect(targetEnemy?.currentHp).toBeLessThan(50000);
    expect(actingServant?.currentNpGauge).toBeGreaterThan(0);
  });

  it("removes the played card from the hand and resets consecutiveNpChainCount", () => {
    const result = resolveAction(state({ consecutiveNpChainCount: 3 }), action, CONSTANTS);
    expect(result.handCards).toEqual(FIVE_CARD_HAND.slice(1));
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

  it("throws when the hand card at handCardIndex belongs to a different servant", () => {
    const mixedHand = [handCardsFor([BUSTER], 2)[0] as HandCard, ...FIVE_CARD_HAND.slice(1)];
    expect(() => resolveAction(state({ handCards: mixedHand }), action, CONSTANTS)).toThrow(RangeError);
  });

  it("throws when chainCards doesn't include the card actually being played", () => {
    const wrongChain: Action = { ...action, chainCards: [{ type: ARTS, servantId: 2 }, { type: QUICK, servantId: 3 }, { type: ARTS, servantId: 1 }] };
    expect(() => resolveAction(state(), wrongChain, CONSTANTS)).toThrow(RangeError);
  });

  it("derives isCrit from the played slot's handCardStars allocation instead of taking it from context", () => {
    const critState = state({ handCardStars: [10, 0, 0, 0, 0] });
    const nonCritState = state({ handCardStars: [0, 0, 0, 0, 0] });
    const critResult = resolveAction(critState, action, CONSTANTS, () => 0.5);
    const nonCritResult = resolveAction(nonCritState, action, CONSTANTS, () => 0.5);
    const critHp = critResult.enemies.find((e) => e.npcId === 9001)?.currentHp ?? 0;
    const nonCritHp = nonCritResult.enemies.find((e) => e.npcId === 9001)?.currentHp ?? 0;
    expect(critHp).toBeLessThan(nonCritHp);
  });

  it("removes the played slot's handCardStars entry alongside the hand card", () => {
    const result = resolveAction(state({ handCardStars: [7, 1, 2, 3, 4] }), action, CONSTANTS);
    expect(result.handCardStars).toEqual([1, 2, 3, 4]);
  });

  it("derives isBusterChain from chainCards, boosting damage over a non-Buster chain", () => {
    const busterChain: Action = { ...action, chainCards: [{ type: BUSTER, servantId: 1 }, { type: BUSTER, servantId: 2 }, { type: BUSTER, servantId: 3 }] };
    // `action`'s own DEFAULT_CHAIN_CARDS is one-of-each-color (a Mighty Chain, whose own
    // +50% ATK bonus is larger than Buster chain's +20%) — a mixed, non-uniform,
    // non-Mighty chain (classifyChain's "none") is the true zero-chain-bonus baseline here.
    const baselineAction: Action = { ...action, chainCards: [{ type: BUSTER, servantId: 1 }, { type: BUSTER, servantId: 2 }, { type: ARTS, servantId: 3 }] };
    const busterResult = resolveAction(state(), busterChain, CONSTANTS);
    const baselineResult = resolveAction(state(), baselineAction, CONSTANTS);
    const busterHp = busterResult.enemies.find((e) => e.npcId === 9001)?.currentHp ?? 0;
    const baselineHp = baselineResult.enemies.find((e) => e.npcId === 9001)?.currentHp ?? 0;
    expect(busterHp).toBeLessThan(baselineHp);
  });

  it("grants +20% NP gauge (CHAINBONUS_ARTS_RATE) to every distinct servant in a completed Arts chain, not just the attacker", () => {
    const artsAction: Action = {
      type: "playCard",
      servantId: 1,
      handCardIndex: 2, // ARTS card in FIVE_CARD_HAND, servantId 1
      targetNpcId: 9001,
      context: { ...CARD_CONTEXT, card: { type: ARTS, position: 1 } },
      chainCards: [{ type: ARTS, servantId: 2 }, { type: ARTS, servantId: 3 }, { type: ARTS, servantId: 1 }],
      chainPosition: 3,
    };
    const result = resolveAction(state(), artsAction, CONSTANTS);
    expect(result.servants.find((s) => s.servantId === 1)?.currentNpGauge).toBeGreaterThanOrEqual(2000);
    expect(result.servants.find((s) => s.servantId === 2)?.currentNpGauge).toBe(2000);
    expect(result.servants.find((s) => s.servantId === 3)?.currentNpGauge).toBe(2000);
  });

  it("does not grant the Arts-chain NP-gauge bonus until the chain's 3rd card is played", () => {
    const artsAction: Action = {
      type: "playCard",
      servantId: 1,
      handCardIndex: 2,
      targetNpcId: 9001,
      context: { ...CARD_CONTEXT, card: { type: ARTS, position: 1 } },
      chainCards: [{ type: ARTS, servantId: 1 }, { type: ARTS, servantId: 2 }, { type: ARTS, servantId: 3 }],
      chainPosition: 1,
    };
    const result = resolveAction(state(), artsAction, CONSTANTS);
    expect(result.servants.find((s) => s.servantId === 2)?.currentNpGauge).toBe(0);
    expect(result.servants.find((s) => s.servantId === 3)?.currentNpGauge).toBe(0);
  });

  it("caps the Arts-chain NP-gauge bonus at each servant's own NP-level ceiling", () => {
    const artsAction: Action = {
      type: "playCard",
      servantId: 1,
      handCardIndex: 2,
      targetNpcId: 9001,
      context: { ...CARD_CONTEXT, card: { type: ARTS, position: 1 } },
      chainCards: [{ type: ARTS, servantId: 2 }, { type: ARTS, servantId: 3 }, { type: ARTS, servantId: 1 }],
      chainPosition: 3,
    };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1 }), servant({ servantId: 2, npLevel: 1, currentNpGauge: 9000 }), servant({ servantId: 3 })] }),
      artsAction,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 2)?.currentNpGauge).toBeLessThanOrEqual(10000);
  });

  it("adds CHAINBONUS_QUICK_STARS to starsCarried for next turn when a Quick chain completes", () => {
    const quickAction: Action = {
      type: "playCard",
      servantId: 1,
      handCardIndex: 4, // QUICK card in FIVE_CARD_HAND, servantId 1
      targetNpcId: 9001,
      context: { ...CARD_CONTEXT, card: { type: QUICK, position: 1 } },
      chainCards: [{ type: QUICK, servantId: 2 }, { type: QUICK, servantId: 3 }, { type: QUICK, servantId: 1 }],
      chainPosition: 3,
    };
    const result = resolveAction(state({ starsCarried: 5 }), quickAction, CONSTANTS);
    expect(result.starsCarried).toBe(25);
  });

  it("does not touch starsCarried for a completed non-Quick chain", () => {
    const result = resolveAction(state({ starsCarried: 5 }), { ...action, chainPosition: 3, chainCards: [{ type: ARTS, servantId: 2 }, { type: QUICK, servantId: 3 }, { type: BUSTER, servantId: 1 }] }, CONSTANTS);
    expect(result.starsCarried).toBe(5);
  });

  it("adds CHAINBONUS_QUICK_CRIT_RATE to critChanceBonusCarried when Quick leads a chain, even a non-uniform, non-Mighty one", () => {
    // Quick leads, but this isn't a uniform Quick chain (isQuickChainFrom) nor a Mighty
    // Chain (only 2 distinct colors) — isolates the Quick-lead bonus from both.
    const quickLedChain: Action = {
      ...action,
      context: { ...CARD_CONTEXT, card: { type: BUSTER, position: 1 } },
      chainCards: [{ type: QUICK, servantId: 2 }, { type: QUICK, servantId: 3 }, { type: BUSTER, servantId: 1 }],
      chainPosition: 3,
    };
    const result = resolveAction(state(), quickLedChain, CONSTANTS);
    expect(result.critChanceBonusCarried).toBeCloseTo(0.2);
    // Not a uniform Quick chain, so the separate stars-next-turn bonus must not also fire.
    expect(result.starsCarried).toBe(0);
  });

  it("does not add CHAINBONUS_QUICK_CRIT_RATE when Quick does not lead the chain", () => {
    const quickNotLeading: Action = {
      ...action,
      handCardIndex: 4,
      context: { ...CARD_CONTEXT, card: { type: QUICK, position: 1 } },
      chainCards: [{ type: BUSTER, servantId: 2 }, { type: QUICK, servantId: 1 }, { type: ARTS, servantId: 3 }],
      chainPosition: 2,
    };
    const result = resolveAction(state(), quickNotLeading, CONSTANTS);
    expect(result.critChanceBonusCarried).toBe(0);
  });

  it("leaves activeCritChanceBonus untouched mid-turn — the bonus only applies to a future hand draw", () => {
    const quickLeadCompleting: Action = {
      ...action,
      context: { ...CARD_CONTEXT, card: { type: BUSTER, position: 1 } },
      chainCards: [{ type: QUICK, servantId: 2 }, { type: QUICK, servantId: 3 }, { type: BUSTER, servantId: 1 }],
      chainPosition: 3,
    };
    const result = resolveAction(state(), quickLeadCompleting, CONSTANTS);
    // The completion bonus lands in critChanceBonusCarried (verified above), never directly in
    // activeCritChanceBonus — that only happens via resolveEndTurn's next hand draw.
    expect(result.critChanceBonusCarried).toBeCloseTo(0.2);
    expect(result.activeCritChanceBonus).toBe(0);
  });

  it("adds state.activeCritChanceBonus into the crit roll for every hand card, capped at 1.0", () => {
    // A single star gives 10% (CRITICAL_RATE_PER_STAR); with a 95% activeCritChanceBonus the
    // combined 105% must still roll as a crit even at randomFn's near-top-of-range value.
    const boostedState = state({ handCardStars: [1, 0, 0, 0, 0], activeCritChanceBonus: 0.95 });
    const result = resolveAction(boostedState, action, CONSTANTS, () => 0.99);
    const hitEnemy = result.enemies.find((e) => e.npcId === 9001);
    // A crit hit does strictly more damage than the non-crit baseline for the same setup.
    const nonCritResult = resolveAction(state({ handCardStars: [1, 0, 0, 0, 0], activeCritChanceBonus: 0 }), action, CONSTANTS, () => 0.99);
    const nonCritEnemy = nonCritResult.enemies.find((e) => e.npcId === 9001);
    expect(hitEnemy?.currentHp ?? 0).toBeLessThan(nonCritEnemy?.currentHp ?? 0);
  });

  it("derives chainLeadCardType from chainCards[0], boosting a non-lead card's damage via the chain lead's own firstCardBonus", () => {
    const artsCard: Action = {
      type: "playCard",
      servantId: 1,
      handCardIndex: 2, // ARTS card in FIVE_CARD_HAND, servantId 1
      targetNpcId: 9001,
      context: { ...CARD_CONTEXT, card: { type: ARTS, position: 1 } },
      chainCards: [{ type: BUSTER, servantId: 2 }, { type: ARTS, servantId: 1 }, { type: QUICK, servantId: 3 }],
      chainPosition: 2,
    };
    // Same Arts card, same fixed card.position — only which color leads the chain differs.
    const artsLeads: Action = { ...artsCard, chainCards: [{ type: ARTS, servantId: 1 }, { type: BUSTER, servantId: 2 }, { type: QUICK, servantId: 3 }], chainPosition: 1 };
    const busterLedResult = resolveAction(state(), artsCard, CONSTANTS);
    const artsLedResult = resolveAction(state(), artsLeads, CONSTANTS);
    const busterLedHp = busterLedResult.enemies.find((e) => e.npcId === 9001)?.currentHp ?? 0;
    const artsLedHp = artsLedResult.enemies.find((e) => e.npcId === 9001)?.currentHp ?? 0;
    // Buster's own addAtk (+30%, non-zero) beats Arts' own addAtk (0) as the chain's lead bonus.
    expect(busterLedHp).toBeLessThan(artsLedHp);
  });

  it("derives isMightyChain from a one-of-each-color chain, dealing more damage than the same card played outside a Mighty Chain", () => {
    const mightyAction: Action = {
      ...action,
      chainCards: [{ type: BUSTER, servantId: 1 }, { type: ARTS, servantId: 2 }, { type: QUICK, servantId: 3 }],
      chainPosition: 1,
    };
    // A mixed, non-uniform, non-Mighty chain (classifyChain's "none") — no chain bonus fires
    // at all, giving a clean zero-bonus baseline for the Mighty-Chain ATK term.
    const nonMightyAction: Action = { ...action, chainCards: [{ type: BUSTER, servantId: 1 }, { type: BUSTER, servantId: 2 }, { type: ARTS, servantId: 3 }], chainPosition: 1 };
    const mightyHp = resolveAction(state(), mightyAction, CONSTANTS).enemies.find((e) => e.npcId === 9001)?.currentHp ?? 0;
    const nonMightyHp = resolveAction(state(), nonMightyAction, CONSTANTS).enemies.find((e) => e.npcId === 9001)?.currentHp ?? 0;
    expect(mightyHp).toBeLessThan(nonMightyHp);
  });

  it("derives isMightyChain to also boost NP gain (CHAINBONUS_MIGHTY_NPGAIN_RATE) over the same card played outside a Mighty Chain", () => {
    const mightyAction: Action = {
      ...action,
      chainCards: [{ type: BUSTER, servantId: 1 }, { type: ARTS, servantId: 2 }, { type: QUICK, servantId: 3 }],
      chainPosition: 1,
    };
    const nonMightyAction: Action = { ...action, chainCards: [{ type: BUSTER, servantId: 1 }, { type: BUSTER, servantId: 2 }, { type: ARTS, servantId: 3 }], chainPosition: 1 };
    const mightyGauge = resolveAction(state(), mightyAction, CONSTANTS).servants.find((s) => s.servantId === 1)?.currentNpGauge ?? 0;
    const nonMightyGauge = resolveAction(state(), nonMightyAction, CONSTANTS).servants.find((s) => s.servantId === 1)?.currentNpGauge ?? 0;
    expect(mightyGauge).toBeGreaterThan(nonMightyGauge);
  });

  it("adds CHAINBONUS_MIGHTY_CRIT_RATE to critChanceBonusCarried when a Mighty Chain completes", () => {
    const mightyCompleting: Action = {
      ...action,
      chainCards: [{ type: ARTS, servantId: 2 }, { type: QUICK, servantId: 3 }, { type: BUSTER, servantId: 1 }],
      chainPosition: 3,
    };
    const result = resolveAction(state(), mightyCompleting, CONSTANTS);
    expect(result.critChanceBonusCarried).toBeCloseTo(0.2);
  });

  it("stacks the Mighty-Chain and Quick-lead crit-chance bonuses when a Mighty Chain also starts with Quick", () => {
    // Plays the default BUSTER card (servantId 1), which sits at chainCards[2] here — the
    // chain's lead (chainCards[0]) is Quick, so both the Quick-lead and Mighty-Chain
    // crit-chance bonuses should fire when this, the chain's last card, completes it.
    const quickLedMighty: Action = {
      ...action,
      chainCards: [{ type: QUICK, servantId: 2 }, { type: ARTS, servantId: 3 }, { type: BUSTER, servantId: 1 }],
      chainPosition: 3,
    };
    const result = resolveAction(state(), quickLedMighty, CONSTANTS);
    expect(result.critChanceBonusCarried).toBeCloseTo(0.4);
  });
});

describe("resolveAction — castNp", () => {
  const action: Action = { type: "castNp", servantId: 1, targetNpcId: 9001, context: NP_CONTEXT };

  it("deals damage without touching the hand, and increments consecutiveNpChainCount", () => {
    const result = resolveAction(state({ consecutiveNpChainCount: 1 }), action, CONSTANTS);
    const targetEnemy = result.enemies.find((e) => e.npcId === 9001);
    expect(targetEnemy?.currentHp).toBeLessThan(50000);
    expect(result.handCards).toEqual(FIVE_CARD_HAND);
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

  it("applies effects (e.g. instantDeath) after its own damage/gauge resolution, in array order", () => {
    const withEffects: Action = { ...action, effects: [instantDeathEffect({ deathRate: 600, targetType: "enemyOne" })] };
    const succeeds = resolveAction(state(), withEffects, CONSTANTS, () => 0.5);
    expect(succeeds.enemies.find((e) => e.npcId === 9001)?.currentHp).toBe(0);

    const fails = resolveAction(state(), withEffects, CONSTANTS, () => 0.9);
    expect(fails.enemies.find((e) => e.npcId === 9001)?.currentHp).toBeGreaterThan(0);
  });

  it("instantDeath with enemyAll targeting rolls independently per enemy", () => {
    const withEffects: Action = { ...action, effects: [instantDeathEffect({ deathRate: 1000, targetType: "enemyAll" })] };
    const result = resolveAction(
      state({ enemies: [enemy({ npcId: 9001, currentHp: 50000 }), enemy({ npcId: 9002, currentHp: 30000 })] }),
      withEffects,
      CONSTANTS,
      () => 0.1,
    );
    expect(result.enemies.find((e) => e.npcId === 9001)?.currentHp).toBe(0);
    expect(result.enemies.find((e) => e.npcId === 9002)?.currentHp).toBe(0);
  });

  it("omitting effects entirely resolves the same as an empty array (defaults to [])", () => {
    const result = resolveAction(state(), action, CONSTANTS);
    expect(result.enemies.find((e) => e.npcId === 9001)?.currentHp).toBeGreaterThan(0);
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

describe("resolveAction — useSkill", () => {
  it("grants a self-targeted buff and sets the skill slot's cooldown, regardless of front-line status", () => {
    const benched = servant({ servantId: 4, isFrontLine: false, skillCooldowns: [0, 0, 0] });
    const action: Action = { type: "useSkill", servantId: 4, skillSlot: 2, effects: [buffGrantEffect()], cooldownTurns: 7 };
    const result = resolveAction(state({ servants: [servant({ servantId: 1 }), servant({ servantId: 2 }), servant({ servantId: 3 }), benched] }), action, CONSTANTS);
    const acted = result.servants.find((s) => s.servantId === 4);
    expect(acted?.activeBuffs).toHaveLength(1);
    expect(acted?.skillCooldowns).toEqual([0, 7, 0]);
  });

  it("grants a ptAll-targeted buff to every front-line servant, not the bench", () => {
    const benched = servant({ servantId: 4, isFrontLine: false });
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [buffGrantEffect({ targetType: "ptAll" })], cooldownTurns: 5 };
    const result = resolveAction(state({ servants: [servant({ servantId: 1 }), servant({ servantId: 2 }), servant({ servantId: 3 }), benched] }), action, CONSTANTS);
    expect(result.servants.find((s) => s.servantId === 1)?.activeBuffs).toHaveLength(1);
    expect(result.servants.find((s) => s.servantId === 2)?.activeBuffs).toHaveLength(1);
    expect(result.servants.find((s) => s.servantId === 3)?.activeBuffs).toHaveLength(1);
    expect(result.servants.find((s) => s.servantId === 4)?.activeBuffs).toHaveLength(0);
  });

  it("grants a ptOne-targeted buff only to targetServantId", () => {
    const action: Action = {
      type: "useSkill",
      servantId: 1,
      skillSlot: 3,
      effects: [buffGrantEffect({ targetType: "ptOne" })],
      cooldownTurns: 5,
      targetServantId: 2,
    };
    const result = resolveAction(state(), action, CONSTANTS);
    expect(result.servants.find((s) => s.servantId === 1)?.activeBuffs).toHaveLength(0);
    expect(result.servants.find((s) => s.servantId === 2)?.activeBuffs).toHaveLength(1);
  });

  it("throws when the targeted skill slot is still on cooldown", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 1, effects: [], cooldownTurns: 5 };
    expect(() => resolveAction(state({ servants: [servant({ servantId: 1, skillCooldowns: [3, 0, 0] }), servant({ servantId: 2 }), servant({ servantId: 3 })] }), action, CONSTANTS)).toThrow(RangeError);
  });

  it("throws when a ptOne effect's targetServantId is benched", () => {
    const benched = servant({ servantId: 4, isFrontLine: false });
    const action: Action = {
      type: "useSkill",
      servantId: 1,
      skillSlot: 3,
      effects: [buffGrantEffect({ targetType: "ptOne" })],
      cooldownTurns: 5,
      targetServantId: 4,
    };
    expect(() => resolveAction(state({ servants: [servant({ servantId: 1 }), servant({ servantId: 2 }), servant({ servantId: 3 }), benched] }), action, CONSTANTS)).toThrow(RangeError);
  });

  it("throws for an unknown servantId", () => {
    const action: Action = { type: "useSkill", servantId: 999, skillSlot: 1, effects: [], cooldownTurns: 5 };
    expect(() => resolveAction(state(), action, CONSTANTS)).toThrow(RangeError);
  });

  it("dispels a self-targeted trait-matching buff, leaving a non-matching one untouched", () => {
    const matching = trackedBuff({ vals: new Set([3004]) });
    const nonMatching = trackedBuff({ type: "downDefence" as Buff.BuffType, vals: new Set([9999]) });
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [removeBuffEffect({ targetType: "self" })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, activeBuffs: [matching, nonMatching] }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.activeBuffs).toEqual([nonMatching]);
  });

  it("dispels an enemyOne-targeted enemy's matching buffs", () => {
    const matching = trackedBuff({ vals: new Set([3004]) });
    const action: Action = {
      type: "useSkill",
      servantId: 1,
      skillSlot: 3,
      effects: [removeBuffEffect({ targetType: "enemyOne", targetTrait: 3004 })],
      cooldownTurns: 5,
      targetNpcId: 9001,
    };
    const result = resolveAction(state({ enemies: [enemy({ activeBuffs: [matching] })] }), action, CONSTANTS);
    expect(result.enemies.find((e) => e.npcId === 9001)?.activeBuffs).toEqual([]);
  });

  it("dispels every enemy's matching buffs for an enemyAll effect", () => {
    const matching = trackedBuff({ vals: new Set([3004]) });
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [removeBuffEffect({ targetType: "enemyAll" })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ enemies: [enemy({ npcId: 9001, activeBuffs: [matching] }), enemy({ npcId: 9002, activeBuffs: [matching] })] }),
      action,
      CONSTANTS,
    );
    expect(result.enemies.every((e) => e.activeBuffs.length === 0)).toBe(true);
  });

  it("throws for an enemyOne effect with no targetNpcId", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [removeBuffEffect({ targetType: "enemyOne" })], cooldownTurns: 5 };
    expect(() => resolveAction(state(), action, CONSTANTS)).toThrow(RangeError);
  });

  it("gainNp adds raw gauge units to the target, capped at the servant's own NP-level ceiling", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [gainNpEffect({ rawAmount: 3000 })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, npLevel: 1, currentNpGauge: 9000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentNpGauge).toBe(10000);
  });

  it("gainNp respects ptOne targeting", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [gainNpEffect({ targetType: "ptOne" })], cooldownTurns: 5, targetServantId: 2 };
    const result = resolveAction(state(), action, CONSTANTS);
    expect(result.servants.find((s) => s.servantId === 1)?.currentNpGauge).toBe(0);
    expect(result.servants.find((s) => s.servantId === 2)?.currentNpGauge).toBe(3000);
  });

  it("gainHp adds flat HP to the target, capped at maxHp (no overheal)", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [gainHpEffect({ rawAmount: 5000 })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 13000, maxHp: 15000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentHp).toBe(15000);
  });

  it("gainHp respects ptAll targeting, reaching only front-line servants", () => {
    const benched = servant({ servantId: 4, isFrontLine: false, currentHp: 1000, maxHp: 15000 });
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [gainHpEffect({ targetType: "ptAll", rawAmount: 100 })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 14900, maxHp: 15000 }), servant({ servantId: 2 }), servant({ servantId: 3 }), benched] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentHp).toBe(15000);
    expect(result.servants.find((s) => s.servantId === 4)?.currentHp).toBe(1000);
  });

  it("gainHpPercent heals rawPercent/1000 of the target's own maxHp, rounded", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [gainHpPercentEffect({ rawPercent: 300 })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 5000, maxHp: 10000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentHp).toBe(8000);
  });

  it("gainHpPercent caps at maxHp (no overheal)", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [gainHpPercentEffect({ rawPercent: 1000 })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 9000, maxHp: 10000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentHp).toBe(10000);
  });

  it("gainHpPercent respects ptOne targeting", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [gainHpPercentEffect({ targetType: "ptOne", rawPercent: 500 })], cooldownTurns: 5, targetServantId: 2 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 5000, maxHp: 10000 }), servant({ servantId: 2, currentHp: 5000, maxHp: 10000 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentHp).toBe(5000);
    expect(result.servants.find((s) => s.servantId === 2)?.currentHp).toBe(10000);
  });

  it("revival revives a dead self-targeted servant to full HP and its own NP-level gauge cap", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [revivalEffect()], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 0, maxHp: 10000, npLevel: 5 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)).toMatchObject({ currentHp: 10000, currentNpGauge: 30000 });
  });

  it("revival leaves an already-living target untouched", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [revivalEffect()], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 8000, maxHp: 10000, currentNpGauge: 1000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)).toMatchObject({ currentHp: 8000, currentNpGauge: 1000 });
  });

  it("revival respects ptAll targeting, reviving only dead front-line servants", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [revivalEffect({ targetType: "ptAll" })], cooldownTurns: 5 };
    const result = resolveAction(
      state({
        servants: [
          servant({ servantId: 1, currentHp: 0, maxHp: 10000, npLevel: 1 }),
          servant({ servantId: 2, currentHp: 5000 }),
          servant({ servantId: 3, currentHp: 0, maxHp: 12000, npLevel: 1 }),
        ],
      }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)).toMatchObject({ currentHp: 10000, currentNpGauge: 10000 });
    expect(result.servants.find((s) => s.servantId === 2)?.currentHp).toBe(5000);
    expect(result.servants.find((s) => s.servantId === 3)).toMatchObject({ currentHp: 12000, currentNpGauge: 10000 });
  });

  it("gainStar adds rawAmount directly to BattleState.starsCarried, a Master-wide resource with no per-servant target", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [gainStarEffect({ rawAmount: 12 })], cooldownTurns: 5 };
    const result = resolveAction(state({ starsCarried: 3 }), action, CONSTANTS);
    expect(result.starsCarried).toBe(15);
  });

  it("lossNp subtracts rawAmount from the target's currentNpGauge, floored at 0", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [lossNpEffect({ rawAmount: 3000 })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentNpGauge: 2000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentNpGauge).toBe(0);
  });

  it("lossHpSafe subtracts rawPercent/1000 of maxHp from currentHp, floored at 1 (never lethal)", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [lossHpSafeEffect({ rawPercent: 900 })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 5000, maxHp: 10000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentHp).toBe(1);
  });

  it("shortenSkill subtracts rawTurns from all 3 skillCooldowns entries, each floored at 0", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [shortenSkillEffect({ rawTurns: 2, targetType: "ptOne" })], cooldownTurns: 5, targetServantId: 2 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1 }), servant({ servantId: 2, skillCooldowns: [3, 1, 0] }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 2)?.skillCooldowns).toEqual([1, 0, 0]);
  });

  it("lossStar subtracts rawAmount directly from BattleState.starsCarried, floored at 0", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [lossStarEffect({ rawAmount: 12 })], cooldownTurns: 5 };
    const result = resolveAction(state({ starsCarried: 8 }), action, CONSTANTS);
    expect(result.starsCarried).toBe(0);
  });

  it("lossHpPercent subtracts rawPercent/1000 of maxHp from currentHp, floored at 0 (can be lethal, unlike lossHpSafe)", () => {
    const action: Action = { type: "useSkill", servantId: 1, skillSlot: 3, effects: [lossHpPercentEffect({ rawPercent: 1000 })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 5000, maxHp: 10000 }), servant({ servantId: 2 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentHp).toBe(0);
  });
});

describe("resolveAction — useMysticCodeSkill", () => {
  it("grants a ptAll-targeted buff to every front-line servant and sets the MC's cooldown slot", () => {
    const action: Action = { type: "useMysticCodeSkill", slot: 3, effects: [buffGrantEffect({ targetType: "ptAll" })], cooldownTurns: 10 };
    const result = resolveAction(state(), action, CONSTANTS);
    for (const s of result.servants) {
      expect(s.activeBuffs).toHaveLength(1);
    }
    expect(result.mysticCodeSkillCooldowns).toEqual([0, 0, 10]);
  });

  it("throws for a self-targeted effect, since a Mystic Code has no servant of its own", () => {
    const action: Action = { type: "useMysticCodeSkill", slot: 1, effects: [buffGrantEffect({ targetType: "self" })], cooldownTurns: 5 };
    expect(() => resolveAction(state(), action, CONSTANTS)).toThrow(RangeError);
  });

  it("throws when the targeted MC skill slot is still on cooldown", () => {
    const action: Action = { type: "useMysticCodeSkill", slot: 2, effects: [], cooldownTurns: 5 };
    expect(() => resolveAction(state({ mysticCodeSkillCooldowns: [0, 4, 0] }), action, CONSTANTS)).toThrow(RangeError);
  });

  it("dispels an enemyAll-targeted enemy's matching buffs", () => {
    const matching = trackedBuff({ vals: new Set([3004]) });
    const action: Action = { type: "useMysticCodeSkill", slot: 1, effects: [removeBuffEffect({ targetType: "enemyAll" })], cooldownTurns: 5 };
    const result = resolveAction(state({ enemies: [enemy({ activeBuffs: [matching] })] }), action, CONSTANTS);
    expect(result.enemies[0]?.activeBuffs).toEqual([]);
  });

  it("throws for a self-targeted removeBuff effect too, since a Mystic Code has no servant of its own", () => {
    const action: Action = { type: "useMysticCodeSkill", slot: 1, effects: [removeBuffEffect({ targetType: "self" })], cooldownTurns: 5 };
    expect(() => resolveAction(state(), action, CONSTANTS)).toThrow(RangeError);
  });

  it("gainHp ptAll heals every front-line servant (e.g. MC 'Cure-All')", () => {
    const action: Action = { type: "useMysticCodeSkill", slot: 1, effects: [gainHpEffect({ targetType: "ptAll", rawAmount: 2000 })], cooldownTurns: 5 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1, currentHp: 10000, maxHp: 15000 }), servant({ servantId: 2, currentHp: 10000, maxHp: 15000 }), servant({ servantId: 3 })] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.currentHp).toBe(12000);
    expect(result.servants.find((s) => s.servantId === 2)?.currentHp).toBe(12000);
  });

  it("gainNp ptOne charges a single target's gauge (e.g. MC 'Spiritron Transfer')", () => {
    const action: Action = { type: "useMysticCodeSkill", slot: 1, effects: [gainNpEffect({ targetType: "ptOne", rawAmount: 5000 })], cooldownTurns: 5, targetServantId: 3 };
    const result = resolveAction(state(), action, CONSTANTS);
    expect(result.servants.find((s) => s.servantId === 3)?.currentNpGauge).toBe(5000);
  });
});

describe("resolveAction — orderChange", () => {
  it("flips isFrontLine on both servants and re-attributes the outgoing servant's hand-card slots to the incoming one", () => {
    const benched = servant({ servantId: 4, isFrontLine: false, cardTypes: FIVE_CARD_DECK });
    const action: Action = { type: "orderChange", outgoingServantId: 1, incomingServantId: 4 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1 }), servant({ servantId: 2 }), servant({ servantId: 3 }), benched] }),
      action,
      CONSTANTS,
    );
    expect(result.servants.find((s) => s.servantId === 1)?.isFrontLine).toBe(false);
    expect(result.servants.find((s) => s.servantId === 4)?.isFrontLine).toBe(true);
    expect(result.handCards.map((hc) => hc.servantId)).toEqual([4, 4, 4, 4, 4]);
    expect(result.handCards.map((hc) => hc.card)).toEqual(FIVE_CARD_HAND.map((hc) => hc.card));
  });

  it("leaves other servants' hand-card slots and front-line status untouched", () => {
    const benched = servant({ servantId: 4, isFrontLine: false });
    const mixedHand = [...handCardsFor(FIVE_CARD_DECK.slice(0, 2), 1), ...handCardsFor(FIVE_CARD_DECK.slice(2), 2)];
    const action: Action = { type: "orderChange", outgoingServantId: 1, incomingServantId: 4 };
    const result = resolveAction(
      state({ servants: [servant({ servantId: 1 }), servant({ servantId: 2 }), servant({ servantId: 3 }), benched], handCards: mixedHand }),
      action,
      CONSTANTS,
    );
    expect(result.handCards.slice(0, 2).map((hc) => hc.servantId)).toEqual([4, 4]);
    expect(result.handCards.slice(2).map((hc) => hc.servantId)).toEqual([2, 2, 2]);
    expect(result.servants.find((s) => s.servantId === 2)?.isFrontLine).toBe(true);
  });

  it("preserves the swapped-out servant's HP/NP gauge/buffs/cooldowns unchanged", () => {
    const outgoingBuffs = [trackedBuff({ turnsRemaining: 2 })];
    const action: Action = { type: "orderChange", outgoingServantId: 1, incomingServantId: 4 };
    const result = resolveAction(
      state({
        servants: [
          servant({ servantId: 1, currentHp: 7000, currentNpGauge: 4000, activeBuffs: outgoingBuffs, skillCooldowns: [2, 0, 0] }),
          servant({ servantId: 2 }),
          servant({ servantId: 3 }),
          servant({ servantId: 4, isFrontLine: false }),
        ],
      }),
      action,
      CONSTANTS,
    );
    const swappedOut = result.servants.find((s) => s.servantId === 1);
    expect(swappedOut).toMatchObject({ currentHp: 7000, currentNpGauge: 4000, activeBuffs: outgoingBuffs, skillCooldowns: [2, 0, 0], isFrontLine: false });
  });

  it("throws when outgoingServantId is not front-line", () => {
    const benched = servant({ servantId: 4, isFrontLine: false });
    const action: Action = { type: "orderChange", outgoingServantId: 4, incomingServantId: 1 };
    expect(() => resolveAction(state({ servants: [servant({ servantId: 1 }), servant({ servantId: 2 }), servant({ servantId: 3 }), benched] }), action, CONSTANTS)).toThrow(RangeError);
  });

  it("throws when incomingServantId is already front-line", () => {
    const action: Action = { type: "orderChange", outgoingServantId: 1, incomingServantId: 2 };
    expect(() => resolveAction(state(), action, CONSTANTS)).toThrow(RangeError);
  });

  it("throws for an unknown servantId on either side", () => {
    expect(() => resolveAction(state(), { type: "orderChange", outgoingServantId: 999, incomingServantId: 4 }, CONSTANTS)).toThrow(RangeError);
  });
});
