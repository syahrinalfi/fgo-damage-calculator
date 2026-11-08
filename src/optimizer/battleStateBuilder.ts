import type { Servant as ServantModule } from "@atlasacademy/api-connector";
import type { ServantBuild } from "../account/types.js";
import { allocateCritStars } from "../battle/critStarLottery.js";
import { drawCardBagHand } from "../battle/cardBag.js";
import { buildCombinedCardDeck } from "../battle/cardDeck.js";
import { buildEnemyInstance, buildServantInstance, type BattleState, type EquippedCraftEssence, type HandCard } from "../battle/battleState.js";
import { applyCraftEssencePassives, servantPassiveSkills } from "../battle/craftEssencePassive.js";
import type { Wave } from "../quest/types.js";

/**
 * One fielded party member's raw account+static data — everything `buildServantInstance`
 * (`../battle/battleState.js`) needs, plus `isFrontLine` (a party-formation decision that
 * function deliberately leaves to its caller).
 */
export interface PartyMemberSpec {
  readonly niceServant: ServantModule.Servant;
  readonly build: ServantBuild;
  readonly isFrontLine: boolean;
  readonly equippedCe?: EquippedCraftEssence;
  /** Borrowed from the support list rather than owned: never counts toward party Cost (owner-confirmed) and is keyed by `supportBattleId`. */
  readonly isSupport?: boolean;
}

/**
 * In-battle key for a borrowed support. `ServantInstance.servantId` is the battle's unit key;
 * owned servants use their Atlas id (a roster holds each servant once), so a negative key lets
 * a borrowed copy share the field with the owned copy of the same servant.
 */
export function supportBattleId(servantId: number): number {
  return -servantId;
}

/** The `ServantInstance.servantId`/`Action.servantId` this party member resolves to in battle. */
export function partyMemberBattleId(member: Pick<PartyMemberSpec, "build" | "isSupport">): number {
  return member.isSupport === true ? supportBattleId(member.build.servantId) : member.build.servantId;
}

export interface InitialBattleStateOptions {
  readonly costBudget: number;
  /** Command Seals available going into this specific battle — defaults to `0`, matching research/09 §4's default (non-Command-Seal) search scope rather than assuming the account-wide max of 3 is always spendable here. */
  readonly commandSealsRemaining?: number;
  /** The quest's terrain trait(s) (research/06 §1) — no `Wave`/`QuestData` field sources this yet (`src/quest/types.ts` has no field-trait concept), so this stays an explicit, empty-by-default caller input rather than something this function derives. */
  readonly fieldTraits?: ReadonlySet<number>;
  readonly randomFn?: () => number;
}

/**
 * Assembles one complete, valid starting `BattleState` from a chosen party (one concrete
 * servant-subset × CE-assignment combination, research/09 §4's other 2 search-space axes)
 * plus the quest's waves — the "substantially bigger integration" `cardOrderCandidates.ts`
 * flagged as still open. Composes 4 pieces that all already existed but had never been
 * called together: `buildServantInstance` (per party member, stats), `buildEnemyInstance`
 * (per `waves[0].initialEnemies`, research/08 §3's "which enemies are present when the wave
 * starts"), `buildCombinedCardDeck` (the front-line 3 servants' 15-card deck,
 * `src/battle/cardDeck.ts`), and `drawCardBagHand` + `allocateCritStars` (turn 1's dealt
 * hand and its crit-star allocation, mirroring `resolveEndTurn`'s own turn-bootstrap
 * sequence in `src/battle/turnLoop.ts` exactly, since there was previously no other place in
 * this project that built a *first* turn's hand from scratch).
 *
 * `party` must contain exactly `FRONT_LINE_SERVANT_COUNT` (3) front-line entries plus
 * however many benched sub-members — the same invariant `buildCombinedCardDeck` already
 * enforces (throws otherwise, not silently building an under/oversized deck).
 * `costSpent` is computed directly from `party` (`niceServant.cost` + `equippedCe.data.cost`
 * per owned member, both real `Entity.cost` fields, research/09 §6; a borrowed support is free) rather than from the built
 * `ServantInstance`s, which don't carry Cost at all — matching how `costSpent` is defined
 * (research/09 §1: "the party actually fielded," not per-`ServantInstance` bookkeeping).
 *
 * Deliberately **not** attempted here — composing this with `enumerateServantSubsets`/
 * `enumerateCeAssignments` (`./candidateGeneration.js`) across every combination a caller's
 * shortlist/CE-pool produces is a trivial `.flatMap` once this function exists, left to the
 * caller rather than wrapped in a dedicated helper (keeps this function's own scope to "one
 * party in, one `BattleState` out," independently testable without a real shortlist).
 */
export function buildInitialBattleState(party: readonly PartyMemberSpec[], waves: readonly Wave[], options: InitialBattleStateOptions): BattleState {
  const baseServants = party.map((member) => ({
    ...buildServantInstance(member.niceServant, member.build, member.isFrontLine, member.equippedCe),
    servantId: partyMemberBattleId(member),
  }));
  const { servants, startingStars } = applyCraftEssencePassives(baseServants, party.map((member) => ({
    servantId: partyMemberBattleId(member),
    isFrontLine: member.isFrontLine,
    servantPassives: servantPassiveSkills(member.niceServant, member.build),
    ...(member.equippedCe === undefined ? {} : { equippedCe: member.equippedCe }),
  })));
  const costSpent = party.reduce(
    (sum, member) => member.isSupport === true ? sum : sum + member.niceServant.cost + (member.equippedCe?.data.cost ?? 0),
    0,
  );
  const initialWave = waves[0];
  const enemies = initialWave === undefined ? [] : initialWave.initialEnemies.map(buildEnemyInstance);

  const randomFn = options.randomFn ?? Math.random;
  const fullDeck = buildCombinedCardDeck(servants);
  const { hand, nextBag } = drawCardBagHand<HandCard>([], fullDeck, 5, randomFn);
  const handCardStars = allocateCritStars(hand, servants, startingStars, randomFn);

  return {
    waves,
    currentWaveIndex: 0,
    currentTurn: 1,
    servants,
    enemies,
    handCards: hand,
    cardBag: nextBag,
    starsCarried: 0,
    handCardStars,
    critChanceBonusCarried: 0,
    activeCritChanceBonus: 0,
    fieldTraits: options.fieldTraits ?? new Set(),
    costSpent,
    costBudget: options.costBudget,
    commandSealsRemaining: options.commandSealsRemaining ?? 0,
    consecutiveNpChainCount: 0,
    mysticCodeSkillCooldowns: [0, 0, 0],
  };
}
