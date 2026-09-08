import { Card } from "@atlasacademy/api-connector";
import { describe, expect, it } from "vitest";
import { classifyChain, extraCardChainTypeFrom, isBusterChainFrom, isMightyChainFrom } from "./chainDetection.js";

function card(type: Card, servantId: number): { type: Card; servantId: number } {
  return { type, servantId };
}

describe("classifyChain", () => {
  it("classifies a uniform Buster chain across different servants", () => {
    const result = classifyChain([card(Card.BUSTER, 1), card(Card.BUSTER, 2), card(Card.BUSTER, 3)]);
    expect(result).toEqual({ chainType: "busterChain", isBraveChain: false });
  });

  it("classifies a uniform Arts chain", () => {
    const result = classifyChain([card(Card.ARTS, 1), card(Card.ARTS, 1), card(Card.ARTS, 2)]);
    expect(result.chainType).toBe("artsChain");
  });

  it("classifies a uniform Quick chain", () => {
    const result = classifyChain([card(Card.QUICK, 1), card(Card.QUICK, 2), card(Card.QUICK, 3)]);
    expect(result.chainType).toBe("quickChain");
  });

  it("classifies one-of-each as a Mighty Chain regardless of order or servant", () => {
    const qab = classifyChain([card(Card.QUICK, 1), card(Card.ARTS, 2), card(Card.BUSTER, 3)]);
    const bqa = classifyChain([card(Card.BUSTER, 1), card(Card.QUICK, 1), card(Card.ARTS, 1)]);
    expect(qab.chainType).toBe("mightyChain");
    expect(bqa.chainType).toBe("mightyChain");
  });

  it("classifies a mixed, non-uniform, non-Mighty combination as none", () => {
    const result = classifyChain([card(Card.BUSTER, 1), card(Card.BUSTER, 2), card(Card.ARTS, 3)]);
    expect(result.chainType).toBe("none");
  });

  it("marks isBraveChain true when all 3 cards belong to the same servant, regardless of color", () => {
    const result = classifyChain([card(Card.QUICK, 5), card(Card.ARTS, 5), card(Card.BUSTER, 5)]);
    expect(result.isBraveChain).toBe(true);
    expect(result.chainType).toBe("mightyChain");
  });

  it("marks isBraveChain false when any card belongs to a different servant", () => {
    const result = classifyChain([card(Card.BUSTER, 5), card(Card.BUSTER, 5), card(Card.BUSTER, 6)]);
    expect(result.isBraveChain).toBe(false);
  });

  it("throws when given anything other than exactly 3 cards", () => {
    expect(() => classifyChain([card(Card.BUSTER, 1), card(Card.BUSTER, 1)])).toThrow(RangeError);
    expect(() => classifyChain([card(Card.BUSTER, 1), card(Card.BUSTER, 1), card(Card.BUSTER, 1), card(Card.BUSTER, 1)])).toThrow(RangeError);
  });

  it("throws when a card isn't Buster/Arts/Quick (e.g. an NP or Extra card)", () => {
    expect(() => classifyChain([card(Card.BUSTER, 1), card(Card.BUSTER, 1), card(Card.BLANK, 1)])).toThrow(RangeError);
    expect(() => classifyChain([card(Card.BUSTER, 1), card(Card.BUSTER, 1), card(Card.EXTRA, 1)])).toThrow(RangeError);
  });
});

describe("isBusterChainFrom", () => {
  it("is true only for a busterChain classification", () => {
    expect(isBusterChainFrom({ chainType: "busterChain", isBraveChain: false })).toBe(true);
    expect(isBusterChainFrom({ chainType: "artsChain", isBraveChain: false })).toBe(false);
    expect(isBusterChainFrom({ chainType: "mightyChain", isBraveChain: false })).toBe(false);
    expect(isBusterChainFrom({ chainType: "none", isBraveChain: true })).toBe(false);
  });
});

describe("isMightyChainFrom", () => {
  it("is true only for a mightyChain classification", () => {
    expect(isMightyChainFrom({ chainType: "mightyChain", isBraveChain: false })).toBe(true);
    expect(isMightyChainFrom({ chainType: "busterChain", isBraveChain: false })).toBe(false);
    expect(isMightyChainFrom({ chainType: "quickChain", isBraveChain: false })).toBe(false);
    expect(isMightyChainFrom({ chainType: "none", isBraveChain: true })).toBe(false);
  });
});

describe("extraCardChainTypeFrom", () => {
  it("is none without a Brave Chain, regardless of color", () => {
    expect(extraCardChainTypeFrom({ chainType: "busterChain", isBraveChain: false })).toBe("none");
    expect(extraCardChainTypeFrom({ chainType: "mightyChain", isBraveChain: false })).toBe("none");
  });

  it("is grand for a same-servant, same-color (uniform) chain", () => {
    expect(extraCardChainTypeFrom({ chainType: "busterChain", isBraveChain: true })).toBe("grand");
    expect(extraCardChainTypeFrom({ chainType: "artsChain", isBraveChain: true })).toBe("grand");
    expect(extraCardChainTypeFrom({ chainType: "quickChain", isBraveChain: true })).toBe("grand");
  });

  it("is single for a same-servant Mighty (QAB) chain, since its colors aren't uniform", () => {
    expect(extraCardChainTypeFrom({ chainType: "mightyChain", isBraveChain: true })).toBe("single");
  });

  it("is single for a same-servant chain with no color-chain bonus at all", () => {
    expect(extraCardChainTypeFrom({ chainType: "none", isBraveChain: true })).toBe("single");
  });
});
