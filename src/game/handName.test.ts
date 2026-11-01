import { describe, expect, it } from "vitest";
import { evaluate, five, handName } from "./evaluate";

const cards = (text: string) => text.split(" ").map(card =>
  "23456789TJQKA".indexOf(card[0]) + 13 * "shcd".indexOf(card[1]),
);
const name = (text: string) => {
  const hand = cards(text);
  return handName({ ...five(hand), cards: hand });
};

describe("royal straight flush display", () => {
  it.each(["s", "h", "c", "d"])("names the royal in suit %s without changing its ranking category", suit => {
    const hand = cards(`A${suit} K${suit} Q${suit} J${suit} T${suit}`);
    expect(handName({ ...five(hand), cards: hand })).toBe("ロイヤルストレートフラッシュ");
    expect(five(hand).category).toBe(8);
    expect(five(hand).score).toBeGreaterThan(five(cards(`K${suit} Q${suit} J${suit} T${suit} 9${suit}`)).score);
  });
  it.each(["Ks Qs Js Ts 9s", "9h 8h 7h 6h 5h", "As 2s 3s 4s 5s"])("keeps %s as a regular straight flush", hand => {
    expect(name(hand)).toBe("ストレートフラッシュ");
  });
  it("does not mislabel an ace-high straight with mixed suits", () => {
    expect(name("As Kh Qs Js Ts")).toBe("ストレート");
  });
  it.each(["Qc Ah Th 6s Ts", "Qc Ah Th 6s"])("recognizes the attached heart royal using exactly two of %s", hole => {
    const hand = evaluate(cards(hole), cards("8h Jh 4c Kh Qh"));
    expect(handName(hand)).toBe("ロイヤルストレートフラッシュ");
    expect(hand.hole).toEqual(cards("Ah Th"));
    expect(hand.board).toEqual(cards("Jh Kh Qh"));
  });
  it("cannot call the board a royal when the Omaha hand cannot use two matching hole cards", () => {
    const hand = evaluate(cards("2c 3d 4c 5d"), cards("As Ks Qs Js Ts"));
    expect(handName(hand)).not.toBe("ロイヤルストレートフラッシュ");
  });
});
