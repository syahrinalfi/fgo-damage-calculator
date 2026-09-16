export type CardType = "1" | "2" | "3";

export const CARD_LABEL: Readonly<Record<CardType, string>> = { "1": "Arts", "2": "Buster", "3": "Quick" };
export const CARD_TONE: Readonly<Record<CardType, "arts" | "buster" | "quick">> = { "1": "arts", "2": "buster", "3": "quick" };

export function formatDamage(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
