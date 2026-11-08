import {
  ApiConnector,
  type CraftEssence,
  type MysticCode,
  type CommandCode,
  type Skill,
  type NoblePhantasm,
  type Func,
  type Buff,
  type Item,
  type Event,
  type War,
  type Quest,
  type Ai,
  type Enemy,
  type Servant as ServantModule,
} from "@atlasacademy/api-connector";
import type { SupportedRegion } from "./region.js";
import { attachTriggerSkills } from "./triggerSkills.js";

// EnemyMaster isn't re-exported from the package root and the package's `exports`
// field blocks deep subpath imports, so its type is derived from the connector method.
type EnemyMaster = Awaited<ReturnType<ApiConnector["enemyMaster"]>>;

export type NiceServant = ServantModule.Servant;
export type NiceServantWithLore = ServantModule.ServantWithLore;

/**
 * Thin, typed wrapper around the official Atlas Academy `@atlasacademy/api-connector`,
 * scoped to exactly the "nice" endpoints this project's research (research/01-data-sources.md
 * §2) identified as needed. One instance is bound to a single region — the account-data layer
 * (separate per-region roster storage, research/00 §3) is expected to hold one GameDataClient
 * per region a user has an account on, not share a single instance across regions.
 */
export class GameDataClient {
  readonly region: SupportedRegion;
  private readonly connector: ApiConnector;

  constructor(region: SupportedRegion) {
    this.region = region;
    this.connector = new ApiConnector({ region });
  }

  /** The servant, with the skills its after-attack trigger buffs run attached (`attachTriggerSkills`). */
  async servant(id: number): Promise<NiceServant> {
    const servant = await this.connector.servant(id, false);
    await attachTriggerSkills(servant, (skillId) => this.connector.skill(skillId));
    return servant;
  }

  servantWithLore(id: number): Promise<NiceServantWithLore> {
    return this.connector.servant(id, true);
  }

  craftEssence(id: number): Promise<CraftEssence.CraftEssence> {
    return this.connector.craftEssence(id);
  }

  mysticCode(id: number): Promise<MysticCode.MysticCode> {
    return this.connector.mysticCode(id);
  }

  mysticCodeList(): Promise<MysticCode.MysticCodeBasic[]> {
    return this.connector.mysticCodeList();
  }

  commandCode(id: number): Promise<CommandCode.CommandCode> {
    return this.connector.commandCode(id);
  }

  skill(id: number): Promise<Skill.Skill> {
    return this.connector.skill(id);
  }

  noblePhantasm(id: number): Promise<NoblePhantasm.NoblePhantasm> {
    return this.connector.noblePhantasm(id);
  }

  func(id: number): Promise<Func.Func> {
    return this.connector.func(id);
  }

  buff(id: number): Promise<Buff.Buff> {
    return this.connector.buff(id);
  }

  item(id: number): Promise<Item.Item> {
    return this.connector.item(id);
  }

  event(id: number): Promise<Event.Event> {
    return this.connector.event(id);
  }

  war(id: number): Promise<War.War> {
    return this.connector.war(id);
  }

  /** Metadata across phases; use questPhase() for actual enemy/wave data. */
  quest(id: number): Promise<Quest.Quest> {
    return this.connector.quest(id);
  }

  /** Full enemy/wave data for one specific difficulty/phase (research/01 §4). */
  questPhase(id: number, phase: number): Promise<Quest.QuestPhase> {
    return this.connector.questPhase(id, phase);
  }

  ai(type: Ai.AiType, id: number): Promise<Ai.AiCollection> {
    return this.connector.ai(type, id);
  }

  enemyMaster(id: number): Promise<EnemyMaster> {
    return this.connector.enemyMaster(id);
  }

  enemy(id: number, lore = false): Promise<Enemy.Enemy> {
    return this.connector.enemy(id, lore);
  }

  masterLevelConstant(): ReturnType<ApiConnector["masterLevelConstant"]> {
    return this.connector.masterLevelConstant();
  }

  classAttackConstant(): ReturnType<ApiConnector["classAttackConstant"]> {
    return this.connector.classAttackConstant();
  }

  classAffinityConstant(): ReturnType<ApiConnector["classAffinityConstant"]> {
    return this.connector.classAffinityConstant();
  }

  attributeConstant(): ReturnType<ApiConnector["attributeConstant"]> {
    return this.connector.attributeConstant();
  }

  /**
   * Per-buff-action registry (`NiceBuffList.ActionList.json`) — for each `BuffAction`
   * (e.g. `atk`, `criticalPoint`, `dropNp`), which `BuffType`s are its plus/minus
   * contributors and the action's own `baseParam`/`baseValue`/`limit`/`maxRate`
   * (research/05-buffs-and-debuffs.md §2). This is the live, official source for the
   * type-to-action mapping the buff-evaluation layer (src/buffs/) is built from, rather
   * than a hand-maintained table of the 239 NiceBuffType values.
   */
  buffConstant(): ReturnType<ApiConnector["buffConstant"]> {
    return this.connector.buffConstant();
  }

  /** Per-card-type-and-position damage/NP-gauge/star-chance constants (`NiceCard.json`). */
  cardConstant(): ReturnType<ApiConnector["cardConstant"]> {
    return this.connector.cardConstant();
  }
}

const clients = new Map<SupportedRegion, GameDataClient>();

/** Returns a memoized GameDataClient per region — reuses the connector's own result cache. */
export function getGameDataClient(region: SupportedRegion): GameDataClient {
  let client = clients.get(region);
  if (!client) {
    client = new GameDataClient(region);
    clients.set(region, client);
  }
  return client;
}
