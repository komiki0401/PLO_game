import { type Card, rank, suit, combinations } from "./cards";
export const names = [
  "ハイカード",
  "ワンペア",
  "ツーペア",
  "スリーカード",
  "ストレート",
  "フラッシュ",
  "フルハウス",
  "フォーカード",
  "ストレートフラッシュ",
];
export type Hand = {
  score: number;
  category: number;
  cards: Card[];
  hole: Card[];
  board: Card[];
};
export function five(cards: Card[]): { score: number; category: number } {
  if (cards.length !== 5) throw new Error("Five cards required");
  const ranks = cards.map(rank).sort((a, b) => b - a);
  const groups = [...new Set(ranks)]
    .map((r) => [ranks.filter((v) => v === r).length, r])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const flush = cards.every((c) => suit(c) === suit(cards[0]));
  const unique = [...new Set(ranks)];
  const straight =
    unique.length === 5
      ? unique[0] - unique[4] === 4
        ? unique[0]
        : unique.join(",") === "14,5,4,3,2"
          ? 5
          : 0
      : 0;
  let category = 0,
    kick = ranks;
  if (flush && straight) {
    category = 8;
    kick = [straight];
  } else if (groups[0][0] === 4) {
    category = 7;
    kick = groups.map((g) => g[1]);
  } else if (groups[0][0] === 3 && groups[1][0] === 2) {
    category = 6;
    kick = groups.map((g) => g[1]);
  } else if (flush) category = 5;
  else if (straight) {
    category = 4;
    kick = [straight];
  } else if (groups[0][0] === 3) {
    category = 3;
    kick = groups.map((g) => g[1]);
  } else if (groups[0][0] === 2 && groups[1][0] === 2) {
    category = 2;
    kick = groups.map((g) => g[1]);
  } else if (groups[0][0] === 2) {
    category = 1;
    kick = groups.map((g) => g[1]);
  }
  return {
    category,
    score: [category, ...kick, ...Array(5 - kick.length).fill(0)].reduce(
      (s, v) => s * 15 + v,
      0,
    ),
  };
}
export function evaluate(hole: Card[], board: Card[]): Hand {
  if (hole.length !== 5 || board.length < 3 || board.length > 5)
    throw new Error("Invalid Omaha hand");
  let best: Hand | undefined;
  for (const h of combinations(hole, 2))
    for (const b of combinations(board, 3)) {
      const cards = [...h, ...b],
        result = five(cards);
      if (!best || result.score > best.score)
        best = { ...result, cards, hole: h, board: b };
    }
  return best!;
}
