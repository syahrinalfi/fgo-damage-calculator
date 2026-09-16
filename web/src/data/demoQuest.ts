import { BUFF_ACTION_KEYS, type BattleConstants } from "fgo-damage-calculator/battle";
import type { Wave, WaveEnemy } from "fgo-damage-calculator/quest";

/**
 * The quest/wave side of this demo is still synthetic — there's no quest-picker surface yet,
 * only the roster is now real (`./liveRoster.ts`). Disclosed as such in the UI.
 */
export const DEMO_ENEMY_NAME = "Ruler-class Phantom (demo target)";

/**
 * Shared between `useOptimizerResults` (the original search) and `computeTurnBreakdown` (the
 * per-turn replay) — both must use the exact same `randomFn` for the replay to reproduce the
 * search's own result bit-for-bit. Kept as one exported constant rather than two independent
 * `() => 0.5` literals so they can't silently drift apart.
 */
export const DEMO_RANDOM_FN = (): number => 0.5;

function waveEnemy(): WaveEnemy {
  return {
    npcId: 9001,
    atk: 9500,
    hp: 620000,
    deathRate: 1000,
    chargeTurn: 4,
    traits: [{ id: 200, name: "" }],
    svt: { className: "lancer", attribute: "earth" },
    enemyScript: {},
    serverMod: { tdRate: 1000, tdAttackRate: 1000, starRate: 1000 },
  } as unknown as WaveEnemy;
}

export const DEMO_WAVES: readonly Wave[] = [{ waveNumber: 1, initialEnemies: [waveEnemy()], enemyPool: [waveEnemy()] }];

function percentAction(plusType: string, minusType: string, baseValue = 0) {
  return {
    limit: "normal",
    plusTypes: [plusType],
    minusTypes: [minusType],
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
} as unknown as BattleConstants["buff"];

const CARD_POSITIONS = { 1: { addAtk: 500, addTdGauge: 0, addCritical: 0 }, 2: { addAtk: 0, addTdGauge: 0, addCritical: 0 }, 3: { addAtk: 0, addTdGauge: 0, addCritical: 0 } };
function cardPositionEntries(base: { adjustAtk: number; adjustTdGauge: number; adjustCritical: number }) {
  return Object.fromEntries(Object.entries(CARD_POSITIONS).map(([position, bonus]) => [position, { individuality: [], ...base, ...bonus }]));
}
const CARD_CONSTANTS = {
  "1": cardPositionEntries({ adjustAtk: 1200, adjustTdGauge: 1000, adjustCritical: 1400 }), // arts
  "2": cardPositionEntries({ adjustAtk: 800, adjustTdGauge: 1000, adjustCritical: 1000 }), // buster
  "3": cardPositionEntries({ adjustAtk: 300, adjustTdGauge: 3000, adjustCritical: 1000 }), // quick
} as unknown as BattleConstants["card"];

const CLASSES = ["saber", "archer", "lancer", "caster"] as const;
const ATTRIBUTES = ["human", "earth", "sky"] as const;

export const DEMO_CONSTANTS: BattleConstants = {
  buff: BUFF_CONSTANTS,
  card: CARD_CONSTANTS,
  classAttack: Object.fromEntries(CLASSES.map((c) => [c, 1000])) as unknown as BattleConstants["classAttack"],
  classAffinity: Object.fromEntries(CLASSES.map((c) => [c, { lancer: 1000 }])) as unknown as BattleConstants["classAffinity"],
  attribute: Object.fromEntries(ATTRIBUTES.map((a) => [a, { earth: 1000 }])) as unknown as BattleConstants["attribute"],
};
