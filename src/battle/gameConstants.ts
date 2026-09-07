import type { Buff, CardDetail, ClassDetail, Attribute as AttributeModule } from "@atlasacademy/api-connector";
import type { GameDataClient } from "../data/gameDataClient.js";

/**
 * The region-wide (not servant/quest-specific) lookup tables every resolver in this module
 * needs: the buff-action registry, per-card-type-and-position constants, and the three
 * class/attribute "triangle" tables. Fetched once per region and reused across every
 * damage/NP-gain/star-drop resolution in that region — none of these change more often
 * than a game version update.
 */
export interface BattleConstants {
  buff: Buff.BuffConstantMap;
  card: CardDetail.CardConstantMap;
  classAttack: ClassDetail.ClassAttackRateMap;
  classAffinity: ClassDetail.ClassAffinityMap;
  attribute: AttributeModule.AttributeAffinityMap;
}

/** Fetches all five tables in parallel via the given region's `GameDataClient`. */
export async function loadBattleConstants(client: GameDataClient): Promise<BattleConstants> {
  const [buff, card, classAttack, classAffinity, attribute] = await Promise.all([
    client.buffConstant(),
    client.cardConstant(),
    client.classAttackConstant(),
    client.classAffinityConstant(),
    client.attributeConstant(),
  ]);
  return { buff, card, classAttack, classAffinity, attribute };
}
