export type { BuffActionLimit, BuffActionInput } from "./buffAction.js";
export { resolveBuffAction } from "./buffAction.js";
export type { ExtraCardChainType, DamageInput } from "./damage.js";
export { calculateHitDamage } from "./damage.js";
export type { AttackingNpGainInput, DefendingNpGainInput } from "./npGain.js";
export { calculateAttackingNpGain, calculateDefendingNpGain, rawGaugeToPercent } from "./npGain.js";
export type { OverchargeStage } from "./overcharge.js";
export { overchargeStage } from "./overcharge.js";
export type { StarDropInput } from "./starDrop.js";
export { calculateStarDropChance } from "./starDrop.js";
export {
  ATTACK_RATE,
  CRITICAL_ATTACK_RATE,
  ATTACK_RATE_RANDOM_MIN,
  ATTACK_RATE_RANDOM_MAX,
  EXTRA_ATTACK_RATE_SINGLE,
  EXTRA_ATTACK_RATE_GRAND,
  CHAINBONUS_BUSTER_RATE,
  FULL_TD_POINT,
  CRITICAL_TD_POINT_RATE,
  OVER_KILL_NP_RATE,
  CRITICAL_STAR_RATE,
  OVER_KILL_STAR_RATE,
  OVER_KILL_STAR_ADD,
} from "./constants.js";
