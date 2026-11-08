import type { Buff, Card, CardDetail } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import type { Action, DerivedHitContext } from "../battle/action.js";
import type { BattleState, EnemyInstance, HandCard, ServantInstance } from "../battle/battleState.js";
import { BUFF_ACTION_KEYS } from "../battle/buffActionKeys.js";
import type { BattleConstants } from "../battle/gameConstants.js";
import { damageDealtAtSlot } from "./objectives.js";
import { advanceBeam, attackingServantIds, flattenTurnCandidates, searchMultiTurnActionSequences, startBeam, type PerTurnCandidateBuilder } from "./multiTurnSearch.js";
import { simulateActionSequence, type ActionSequenceCandidate, type SequenceScoreFn } from "./turnSearch.js";
import { ActionUnavailableError } from "../battle/actionError.js";
import { resolveAction } from "../battle/turnLoop.js";
import { buildAttackChainCandidates, type NpAttackOption } from "./cardOrderCandidates.js";
import { buildSkillAndCardOrderCandidates, buildSkillSetups, type SkillActivation } from "./skillUsageCandidates.js";

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

const BUFF_CONSTANTS = {
  [BUFF_ACTION_KEYS.ATK]: percentAction("upAtk", "downAtk"),
  [BUFF_ACTION_KEYS.DAMAGE]: percentAction("upDamage", "downDamage", 1000),
} as unknown as Buff.BuffConstantMap;

const CARD_CONSTANTS = {
  "1": { 1: { individuality: [], adjustAtk: 300, adjustTdGauge: 3000, adjustCritical: 1000, addAtk: 0, addTdGauge: 0, addCritical: 0 } },
  "2": { 1: { individuality: [], adjustAtk: 1200, adjustTdGauge: 1000, adjustCritical: 1400, addAtk: 300, addTdGauge: 0, addCritical: 50 } },
  "3": { 1: { individuality: [], adjustAtk: 800, adjustTdGauge: 1000, adjustCritical: 1000, addAtk: 0, addTdGauge: 0, addCritical: 0 } },
} as unknown as CardDetail.CardConstantMap;

const CONSTANTS: BattleConstants = {
  buff: BUFF_CONSTANTS,
  card: CARD_CONSTANTS,
  classAttack: { saber: 1000 } as BattleConstants["classAttack"],
  classAffinity: { saber: { lancer: 1000 } } as BattleConstants["classAffinity"],
  attribute: { human: { earth: 1000 } } as BattleConstants["attribute"],
};

function servant(servantId: number, overrides: Partial<ServantInstance> = {}): ServantInstance {
  return {
    servantId,
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
    skillCooldowns: [0, 0, 0],
    criticalWeight: 99,
    starGen: 60,
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
    currentNpTurns: 0,
    npTurnLimit: 5,
    deathRate: 1000,
    readyToNp: false,
    serverMod: { tdRate: 1000, tdAttackRate: 1000, starRate: 1000 },
    ...overrides,
  };
}

// A 3-front-line-servant state is required: `resolveEndTurn` (fired by every turn this
// module simulates) rebuilds the combined 15-card deck via `buildCombinedCardDeck`, which
// throws unless exactly `FRONT_LINE_SERVANT_COUNT` front-line servants are present.
function state(overrides: Partial<BattleState> = {}): BattleState {
  const servants = [servant(1), servant(2), servant(3)];
  return {
    waves: [],
    currentWaveIndex: 0,
    currentTurn: 1,
    servants,
    enemies: [enemy()],
    handCards: servants.flatMap((s) => s.cardTypes.map((card): HandCard => ({ card, servantId: s.servantId }))).slice(0, 5),
    cardBag: [],
    starsCarried: 0,
    handCardStars: [0, 0, 0, 0, 0],
    critChanceBonusCarried: 0,
    activeCritChanceBonus: 0,
    fieldTraits: new Set(),
    costSpent: 0,
    costBudget: 100,
    commandSealsRemaining: 3,
    consecutiveNpChainCount: 0,
    mysticCodeSkillCooldowns: [0, 0, 0],
    ...overrides,
  };
}

const BUSTER_CONTEXT: DerivedHitContext = {
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

function playAction(handCardIndex: number, servantId: number, cardType: Card): Extract<Action, { type: "playCard" }> {
  return {
    type: "playCard",
    servantId,
    handCardIndex,
    targetNpcId: 9001,
    context: { ...BUSTER_CONTEXT, card: { type: cardType, position: 1 } },
    chainCards: [
      { type: BUSTER, servantId },
      { type: BUSTER, servantId },
      { type: ARTS, servantId },
    ],
    chainPosition: 1,
  };
}

function oneBusterCandidate(label: string): ActionSequenceCandidate {
  return { label, actions: [playAction(0, 1, BUSTER)] };
}

function passCandidate(): ActionSequenceCandidate {
  return { label: "pass", actions: [] };
}

describe("searchMultiTurnActionSequences", () => {
  it("simulates every turn's endTurn between candidates, advancing currentTurn across the horizon", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => [passCandidate()];
    const results = searchMultiTurnActionSequences(state(), 2, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0));
    expect(results).toHaveLength(1);
    expect(results[0]?.finalState.currentTurn).toBe(3);
  });

  it("scores only the final state, crediting a setup-then-burst line even when turn 1 deals no damage", () => {
    const buildCandidates: PerTurnCandidateBuilder = (_state, turnIndex) => (turnIndex === 0 ? [passCandidate()] : [oneBusterCandidate("burst")]);
    const results = searchMultiTurnActionSequences(state(), 2, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0));
    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBeGreaterThan(0);
    expect(results[0]?.turnActions).toEqual([[], [playAction(0, 1, BUSTER)]]);
  });

  it("cross-multiplies every turn's candidates (2 turns x 2 candidates = 4 full lines)", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => [passCandidate(), oneBusterCandidate("buster")];
    const results = searchMultiTurnActionSequences(state(), 2, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0));
    expect(results).toHaveLength(4);
  });

  it("keeps only the strongest frontier when beamWidth bounds a combinatorial search", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => [passCandidate(), oneBusterCandidate("buster")];
    const results = searchMultiTurnActionSequences(
      state(),
      2,
      buildCandidates,
      CONSTANTS,
      () => 0,
      damageDealtAtSlot(0),
      { beamWidth: 2 },
    );
    expect(results).toHaveLength(2);
    expect(results[0]?.label).toBe("buster>>buster");
  });

  it("identifies distinct damage dealers without counting setup actions", () => {
    const secondAttacker = playAction(0, 2, BUSTER);
    expect(attackingServantIds([
      { type: "useSkill", servantId: 3, skillSlot: 1, effects: [], cooldownTurns: 5 },
      playAction(0, 1, BUSTER),
      {
        type: "playExtraCard",
        servantId: 2,
        targetNpcId: secondAttacker.targetNpcId,
        context: secondAttacker.context,
        chainCards: secondAttacker.chainCards,
      },
    ])).toEqual(new Set([1, 2]));
  });

  it("ranks descending by final score — the line that bursts on the last turn scores highest", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => [passCandidate(), oneBusterCandidate("buster")];
    const results = searchMultiTurnActionSequences(state(), 2, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0));
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]?.score).toBeGreaterThanOrEqual(results[i]?.score ?? -Infinity);
    }
    expect(results[0]?.label).toBe("buster>>buster");
  });

  it("prunes a branch entirely when a turn has no candidates at all", () => {
    const buildCandidates: PerTurnCandidateBuilder = (_state, turnIndex) => (turnIndex === 1 ? [] : [passCandidate()]);
    expect(searchMultiTurnActionSequences(state(), 2, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0))).toEqual([]);
  });

  it("returns a single result with an empty turnActions array for a 0-turn horizon", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => {
      throw new Error("should not be called for a 0-turn horizon");
    };
    const results = searchMultiTurnActionSequences(state(), 0, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0));
    expect(results).toHaveLength(1);
    expect(results[0]?.turnActions).toEqual([]);
    expect(results[0]?.finalState.currentTurn).toBe(1);
  });

  it("throws rather than recursing forever for a negative turnCount", () => {
    const buildCandidates: PerTurnCandidateBuilder = () => [passCandidate()];
    expect(() => searchMultiTurnActionSequences(state(), -1, buildCandidates, CONSTANTS, () => 0, damageDealtAtSlot(0))).toThrow(RangeError);
  });
});

describe("advanceBeam shared setup and NP pre-filter", () => {
  const ALL_POSITIONS = {
    ...CONSTANTS,
    card: Object.fromEntries(Object.entries(CARD_CONSTANTS).map(([type, byPosition]) => {
      const first = (byPosition as Record<number, unknown>)[1];
      return [type, { 1: first, 2: first, 3: first }];
    })) as unknown as CardDetail.CardConstantMap,
  };
  // The old per-candidate behavior: simulate every candidate in full from the branch state.
  function referenceAdvance(start: BattleState, candidates: readonly ActionSequenceCandidate[], scoreFn: SequenceScoreFn) {
    return candidates.flatMap((candidate) => {
      try {
        const afterActions = simulateActionSequence(start, candidate.actions, ALL_POSITIONS, () => 0.5);
        const afterTurn = resolveAction(afterActions, { type: "endTurn" }, ALL_POSITIONS, () => 0.5);
        return [{ label: candidate.label, score: scoreFn(afterTurn, start) }];
      } catch (error) {
        if (error instanceof ActionUnavailableError) return [];
        throw error;
      }
    });
  }

  it("keeps exactly the lines a full per-candidate simulation keeps, in the same order", () => {
    const start = state({ servants: [servant(1), servant(2, { currentNpGauge: 9500 }), servant(3)] });
    const skills: readonly SkillActivation[] = [
      { type: "useSkill", servantId: 1, skillSlot: 1, effects: [{ kind: "gainNp", rawAmount: 10000, targetType: "self" }], cooldownTurns: 5 },
      { type: "useSkill", servantId: 3, skillSlot: 1, effects: [], cooldownTurns: 5 },
    ];
    const npOption = (servantId: number): NpAttackOption => ({
      servantId,
      cardType: BUSTER,
      context: { ...BUSTER_CONTEXT, isNP: true, npDamageMultiplier: 3 },
      targetNpcIds: [9001],
      label: `NP:${servantId}`,
    });
    const chains = buildAttackChainCandidates(start.handCards, start.handCards.map((card) => ({ ...BUSTER_CONTEXT, card: { type: card.card, position: 1 } })), [npOption(1), npOption(2)], 9001);
    const candidates = buildSkillAndCardOrderCandidates(skills, chains);
    const scoreFn = damageDealtAtSlot(0);

    const reference = referenceAdvance(start, candidates, scoreFn);
    const beam = advanceBeam(startBeam(start, scoreFn), 0, start, () => candidates, ALL_POSITIONS, () => 0.5, scoreFn, { beamWidth: candidates.length });

    expect(reference.length).toBeGreaterThan(0);
    expect(reference.length).toBeLessThan(candidates.length);
    expect(beam.map((entry) => [entry.label, entry.score])).toEqual(
      [...reference].sort((a, b) => b.score - a.score).map((entry) => [entry.label, entry.score]),
    );
    expect(beam.some((entry) => entry.label.startsWith("useSkill:1.1|") && entry.label.includes("NP:1"))).toBe(true);
    expect(beam.some((entry) => entry.label.includes("NP:2"))).toBe(false);
  });

  it("coarse-then-fine: scores every setup with one NP-first chain and searches every chain only for the best setups (a heuristic: it may miss the exhaustive best)", () => {
    const start = state({ servants: [servant(1), servant(2), servant(3)] });
    const skills: readonly SkillActivation[] = [
      { type: "useSkill", servantId: 1, skillSlot: 1, effects: [{ kind: "gainNp", rawAmount: 10000, targetType: "self" }], cooldownTurns: 5 },
      { type: "useSkill", servantId: 3, skillSlot: 1, effects: [], cooldownTurns: 5 },
    ];
    const npOption: NpAttackOption = { servantId: 1, cardType: BUSTER, context: { ...BUSTER_CONTEXT, isNP: true, npDamageMultiplier: 3 }, targetNpcIds: [9001], label: "NP:1" };
    const chains = buildAttackChainCandidates(start.handCards, start.handCards.map((card) => ({ ...BUSTER_CONTEXT, card: { type: card.card, position: 1 } })), [npOption], 9001);
    const candidates = buildSkillAndCardOrderCandidates(skills, chains);
    const scoreFn = damageDealtAtSlot(0);
    const setupOf = (label: string) => label.split("|")[0];
    const exhaustive = advanceBeam(startBeam(start, scoreFn), 0, start, () => candidates, ALL_POSITIONS, () => 0.5, scoreFn, { beamWidth: candidates.length });
    const pruned = advanceBeam(startBeam(start, scoreFn), 0, start, () => candidates, ALL_POSITIONS, () => 0.5, scoreFn, { beamWidth: candidates.length, fineSetupCount: 1 });

    const countBySetup = (entries: readonly { label: string }[]) => entries.reduce((counts, entry) => counts.set(setupOf(entry.label) as string, (counts.get(setupOf(entry.label) as string) ?? 0) + 1), new Map<string, number>());
    const exhaustiveCounts = countBySetup(exhaustive);
    const prunedCounts = countBySetup(pruned);
    const topSetup = setupOf(pruned[0]!.label) as string;

    expect(prunedCounts.size).toBe(exhaustiveCounts.size);
    expect(prunedCounts.get(topSetup)).toBe(exhaustiveCounts.get(topSetup));
    for (const [setup, count] of prunedCounts) if (setup !== topSetup) expect(count).toBe(1);
    const chargedSetups = [...prunedCounts.keys()].filter((setup) => setup.includes("useSkill:1.1"));
    expect(chargedSetups.length).toBeGreaterThan(0);
    for (const setup of chargedSetups) expect(pruned.filter((entry) => setupOf(entry.label) === setup).every((entry) => entry.label.includes("NP:1") || setup === topSetup)).toBe(true);
    expect(pruned[0]!.score).toBeLessThanOrEqual(exhaustive[0]!.score);
  });

  it("searches factored setups × chains exactly like the same lines given as a flat list", () => {
    const start = state({ servants: [servant(1), servant(2, { currentNpGauge: 9500 }), servant(3)] });
    const skills: readonly SkillActivation[] = [
      { type: "useSkill", servantId: 1, skillSlot: 1, effects: [{ kind: "gainNp", rawAmount: 10000, targetType: "self" }], cooldownTurns: 5 },
      { type: "useSkill", servantId: 3, skillSlot: 1, effects: [], cooldownTurns: 5 },
    ];
    const npOption = (servantId: number): NpAttackOption => ({ servantId, cardType: BUSTER, context: { ...BUSTER_CONTEXT, isNP: true, npDamageMultiplier: 3 }, targetNpcIds: [9001], label: `NP:${servantId}` });
    const chains = buildAttackChainCandidates(start.handCards, start.handCards.map((card) => ({ ...BUSTER_CONTEXT, card: { type: card.card, position: 1 } })), [npOption(1), npOption(2)], 9001);
    const factored = { groups: [{ setups: buildSkillSetups(skills), chains }] };
    const scoreFn = damageDealtAtSlot(0);
    const run = (builder: PerTurnCandidateBuilder) =>
      advanceBeam(startBeam(start, scoreFn), 0, start, builder, ALL_POSITIONS, () => 0.5, scoreFn, { beamWidth: 1000 }).map((entry) => [entry.label, entry.score]);

    expect(flattenTurnCandidates(factored).map((c) => c.label)).toEqual(buildSkillAndCardOrderCandidates(skills, chains).map((c) => c.label));
    expect(run(() => factored)).toEqual(run(() => buildSkillAndCardOrderCandidates(skills, chains)));
  });

  it("keeps one line when chains differ only in face cards played after the wave is cleared", () => {
    const start = state({ servants: [servant(1, { currentNpGauge: 10000 }), servant(2), servant(3)], enemies: [enemy({ currentHp: 1, maxHp: 1 })] });
    const npOption: NpAttackOption = { servantId: 1, cardType: BUSTER, context: { ...BUSTER_CONTEXT, isNP: true, npDamageMultiplier: 3 }, targetNpcIds: [9001], label: "NP:1" };
    const chains = buildAttackChainCandidates(start.handCards, start.handCards.map((card) => ({ ...BUSTER_CONTEXT, card: { type: card.card, position: 1 } })), [npOption], 9001);
    const npFirst = chains.filter((chain) => chain.actions[0]?.type === "castNp");
    const scoreFn = damageDealtAtSlot(0);
    const beam = advanceBeam(startBeam(start, scoreFn), 0, start, () => ({ groups: [{ setups: [{ label: "", actions: [] }], chains: npFirst }] }), ALL_POSITIONS, () => 0.5, scoreFn, { beamWidth: 1000 });

    const makeup = (chain: ActionSequenceCandidate) => {
      const first = chain.actions[0];
      return first !== undefined && "chainCards" in first ? first.chainCards.map((card) => `${card.type}:${card.servantId}`).sort().join() : "";
    };
    expect(npFirst.length).toBeGreaterThan(new Set(npFirst.map(makeup)).size);
    expect(beam).toHaveLength(new Set(npFirst.map(makeup)).size);

    const sameMakeup = npFirst.filter((chain) => makeup(chain) === makeup(npFirst[0]!));
    const after = (chain: ActionSequenceCandidate) => resolveAction(simulateActionSequence(start, chain.actions, ALL_POSITIONS, () => 0.5), { type: "endTurn" }, ALL_POSITIONS, () => 0.5);
    expect(sameMakeup.length).toBeGreaterThan(1);
    for (const chain of sameMakeup.slice(1)) expect(after(chain)).toEqual(after(sameMakeup[0]!));
  });

  it("rejects a fineSetupCount below 1", () => {
    const start = state();
    expect(() => searchMultiTurnActionSequences(start, 1, () => [], CONSTANTS, () => 0.5, damageDealtAtSlot(0), { fineSetupCount: 0 })).toThrow(RangeError);
  });
});
