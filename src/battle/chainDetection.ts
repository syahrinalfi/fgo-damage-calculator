import { Card } from "@atlasacademy/api-connector";
import type { ExtraCardChainType } from "../engine/damage.js";

/**
 * One 3-card chain's classification (research/03 §3-4, research/06 §7) along its two
 * independent axes: `chainType` (same-color "color chain" vs. one-of-each "Mighty Chain"
 * vs. neither) and `isBraveChain` (all 3 cards from the same servant, orthogonal to color —
 * a same-servant same-color chain is *both* a color chain and a Brave Chain at once).
 */
export type ChainType = "busterChain" | "artsChain" | "quickChain" | "mightyChain" | "none";

export interface ChainClassification {
  readonly chainType: ChainType;
  readonly isBraveChain: boolean;
}

const CARD_COLOR: Partial<Record<Card, "buster" | "arts" | "quick">> = {
  [Card.BUSTER]: "buster",
  [Card.ARTS]: "arts",
  [Card.QUICK]: "quick",
};

function colorOf(cardType: Card): "buster" | "arts" | "quick" {
  const color = CARD_COLOR[cardType];
  if (!color) {
    throw new RangeError(`Card type ${String(cardType)} has no chain color — only Buster/Arts/Quick cards form a chain`);
  }
  return color;
}

/**
 * Classifies one turn's exactly 3 selected attack slots into its `ChainType` and
 * Brave-Chain status. A selected NP is outside the random five-card bag but still occupies
 * one attack slot and contributes its real Arts/Buster/Quick color and owner. `Card.NP` and
 * Extra remain invalid here: callers represent NP with its real color plus `isNp: true`,
 * while Extra Attack is the automatic fourth action after a Brave Chain.
 *
 * `chainType` is `"mightyChain"` when the 3 cards are one of each color in any order
 * (research/06 §7.4 — order and servant don't matter for whether Mighty Chain triggers,
 * only for each card's own position-based modifier), a same-color chain type when all 3
 * share one color, and `"none"` for any other mix (e.g. Buster/Buster/Arts).
 *
 * **Scope**: this only classifies the chain — it does not compute any chain's numeric
 * bonus. Only `isBusterChainFrom`/`extraCardChainTypeFrom` (below) turn a classification
 * into something `HitResolutionContext` actually has a field for; Arts chain's NP-gauge
 * bonus, Quick chain's star-generation bonus, Mighty Chain's ATK/crit/NP-gain/star-rate
 * bonuses, and the color-chain first-card bonus (research/06 §7.2, §7.4) have **no field
 * anywhere** in this project's `DamageInput`/`AttackingNpGainInput`/`StarDropInput` yet
 * (research/09 §7) — applying them is a separate, larger follow-up that extends those
 * three engine modules, not something this classifier can produce on its own.
 */
export function classifyChain(playedCards: readonly { readonly type: Card; readonly servantId: number }[]): ChainClassification {
  if (playedCards.length !== 3) {
    throw new RangeError(`A chain is always exactly 3 command cards, got ${playedCards.length}`);
  }

  const colors = playedCards.map((card) => colorOf(card.type));
  // Length is checked === 3 above, so index 0 always exists — `noUncheckedIndexedAccess` can't see that.
  const firstServantId = (playedCards[0] as (typeof playedCards)[number]).servantId;
  const isBraveChain = playedCards.every((card) => card.servantId === firstServantId);

  const firstColor = colors[0] as "buster" | "arts" | "quick";
  let chainType: ChainType;
  if (colors.every((color) => color === firstColor)) {
    chainType = `${firstColor}Chain` as ChainType;
  } else if (new Set(colors).size === 3) {
    chainType = "mightyChain";
  } else {
    chainType = "none";
  }

  return { chainType, isBraveChain };
}

/** Whether this chain qualifies for the damage formula's flat Buster-chain bonus (research/06 §7.2, `DamageInput.isBusterChain`/`CHAINBONUS_BUSTER_RATE`) — true only for a uniform-Buster chain. */
export function isBusterChainFrom(classification: ChainClassification): boolean {
  return classification.chainType === "busterChain";
}

/** Whether this chain qualifies for the Arts-chain NP-gauge bonus (research/06 §7.2, `CHAINBONUS_ARTS_RATE` — +20% gauge to every servant whose card is in the chain) — true only for a uniform-Arts chain. */
export function isArtsChainFrom(classification: ChainClassification): boolean {
  return classification.chainType === "artsChain";
}

/** Whether this chain qualifies for the Quick-chain critical-star bonus (research/06 §7.2, `CHAINBONUS_QUICK` — a flat star count added for next turn's allocation) — true only for a uniform-Quick chain. */
export function isQuickChainFrom(classification: ChainClassification): boolean {
  return classification.chainType === "quickChain";
}

/** Whether this chain qualifies for Mighty Chain's bonuses (research/06 §7.4, `CHAINBONUS_MIGHTY_ATK_RATE`/`CHAINBONUS_MIGHTY_CRIT_RATE`) — true only for a one-of-each-color (QAB) chain. */
export function isMightyChainFrom(classification: ChainClassification): boolean {
  return classification.chainType === "mightyChain";
}

/**
 * The Extra Attack multiplier a would-be 4th card gets after this chain (research/06 §7.3,
 * `DamageInput.extraCardChainType`/`EXTRA_ATTACK_RATE_SINGLE`/`EXTRA_ATTACK_RATE_GRAND`):
 * `"none"` unless this is a Brave Chain (Extra Attack only unlocks via same-servant play),
 * `"grand"` (3.5x) for a same-servant *same-color* chain, `"single"` (2.0x) for a
 * same-servant chain that isn't uniformly colored — including a Mighty Brave Chain (QAB
 * from one servant), which research/06 §7.3's table places in the mixed-color/"single"
 * bucket despite also being a Mighty Chain.
 */
export function extraCardChainTypeFrom(classification: ChainClassification): ExtraCardChainType {
  if (!classification.isBraveChain) {
    return "none";
  }
  const isUniformColor = classification.chainType === "busterChain" || classification.chainType === "artsChain" || classification.chainType === "quickChain";
  return isUniformColor ? "grand" : "single";
}
