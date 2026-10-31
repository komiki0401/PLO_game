import { evaluate, type Hand } from "./evaluate";
import type { Card } from "./cards";
export type Contributor = {
  id: number;
  total: number;
  folded: boolean;
  hole: Card[];
};
export type Pot = { amount: number; eligible: number[] };
export type Award = {
  pot: number;
  board: number;
  amount: number;
  winners: number[];
  hands: Record<number, Hand>;
};
export function makePots(players: Contributor[]): Pot[] {
  const levels = [...new Set(players.map((p) => p.total).filter(Boolean))].sort(
    (a, b) => a - b,
  );
  let prev = 0;
  return levels.map((level) => {
    const payers = players.filter((p) => p.total >= level);
    const pot = {
      amount: (level - prev) * payers.length,
      eligible: payers.filter((p) => !p.folded).map((p) => p.id),
    };
    prev = level;
    return pot;
  });
}
// Odd pot chip -> board A. Tied-board odd chips -> first winner clockwise after dealer.
export function distribute(
  players: Contributor[],
  boards: Card[][],
  dealer: number,
): { payouts: Record<number, number>; awards: Award[] } {
  const payouts: Record<number, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  const awards: Award[] = [];
  makePots(players).forEach((pot, pi) => {
    if (!pot.eligible.length) throw new Error("Pot without eligible player");
    for (let b = 0; b < 2; b++) {
      const amount =
        b === 0 ? Math.ceil(pot.amount / 2) : Math.floor(pot.amount / 2);
      const hands: Record<number, Hand> = {};
      pot.eligible.forEach(
        (id) =>
          (hands[id] = evaluate(
            players.find((p) => p.id === id)!.hole,
            boards[b],
          )),
      );
      const high = Math.max(...Object.values(hands).map((h) => h.score));
      const winners = pot.eligible
        .filter((id) => hands[id].score === high)
        .sort(
          (a, b) =>
            ((a - dealer - 1 + players.length) % players.length) -
            ((b - dealer - 1 + players.length) % players.length),
        );
      winners.forEach(
        (id, i) =>
          (payouts[id] +=
            Math.floor(amount / winners.length) +
            (i < amount % winners.length ? 1 : 0)),
      );
      awards.push({ pot: pi, board: b, amount, winners, hands });
    }
  });
  return { payouts, awards };
}
