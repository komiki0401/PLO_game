import { deck, combinations, type Card } from "./cards";
import { evaluate, five } from "./evaluate";
import { legal, type Action } from "./betting";
import type { State } from "./engine";
// Only public information and this seat's hole cards are used. Opponent holes and
// the actual undealt deck are deliberately excluded from every simulation.
export function estimate(
  hole: Card[],
  boards: Card[][],
  trials: number,
  opponents: number,
  rng = Math.random,
): { equity: number; scoop: number } {
  const known = new Set([...hole, ...boards.flat()]);
  let result = 0,
    scoops = 0;
  for (let t = 0; t < trials; t++) {
    const d = deck(rng).filter((c) => !known.has(c));
    const others = Array.from({ length: opponents }, () => d.splice(0, 5));
    let wonBoth = true;
    for (const board of boards) {
      const runout = [...board, ...d.splice(0, 5 - board.length)],
        own = evaluate(hole, runout).score;
      const scores = others.map((h) => evaluate(h, runout).score),
        high = Math.max(...scores, own);
      result +=
        own === high ? 1 / (1 + scores.filter((v) => v === own).length) : 0;
      if (own <= Math.max(...scores)) wonBoth = false;
    }
    if (wonBoth) scoops++;
  }
  return { equity: result / (trials * 2), scoop: scoops / trials };
}
export function equity(
  hole: Card[],
  boards: Card[][],
  trials: number,
  rng = Math.random,
): number {
  return estimate(hole, boards, trials, 1, rng).equity;
}
// Current-street nuts, including own-card blockers. Draws are represented by the
// simulated legal turn/river runouts above. Neither function can see actual foes.
export function nuts(hole: Card[], boards: Card[][]): number {
  const known = new Set([...hole, ...boards.flat()]);
  const pairs = combinations(
    Array.from({ length: 52 }, (_, i) => i).filter((c) => !known.has(c)),
    2,
  );
  let count = 0;
  for (const board of boards) {
    const own = evaluate(hole, board).score,
      triples = combinations(board, 3);
    let beaten = false;
    outer: for (const pair of pairs)
      for (const triple of triples)
        if (five([...pair, ...triple]).score > own) {
          beaten = true;
          break outer;
        }
    if (!beaten) count++;
  }
  return count / 2;
}
export function cpu(s: State, rng = Math.random): Action {
  const p = s.players[s.actor],
    l = legal(s, s.actor),
    level = s.settings.difficulty;
  const opponents = Math.max(
    1,
    s.players.filter((o) => !o.folded && o.id !== p.id).length,
  );
  const sample =
    level === "EASY"
      ? { equity: 0.3 + rng() * 0.5, scoop: 0 }
      : estimate(
          p.hole,
          s.boards,
          level === "HARD" ? 32 : 10,
          level === "HARD" ? opponents : 1,
          rng,
        );
  const strength =
    level === "HARD"
      ? sample.equity * 0.8 +
        sample.scoop * 0.15 +
        nuts(p.hole, s.boards) * 0.05
      : sample.equity;
  const pot = s.players.reduce((n, p) => n + p.total, 0),
    odds = l.call / (pot + l.call || 1);
  if (
    l.canFold &&
    strength < (level === "EASY" ? odds * 0.45 : odds * 1.2) &&
    rng() > 0.12
  )
    return { type: "fold" };
  const bluff = level === "HARD" ? 0.065 : level === "NORMAL" ? 0.035 : 0.01;
  // Single-board strength tends toward pot control; scoops support larger value bets.
  if (
    l.canRaise &&
    ((strength > (level === "EASY" ? 0.77 : 0.67) && rng() < 0.65) ||
      rng() < bluff)
  ) {
    const fraction =
      strength > 0.85 || sample.scoop > 0.65 ? 1 : strength > 0.72 ? 0.75 : 0.5;
    const target = Math.max(
      l.min,
      Math.min(l.max, s.high + Math.floor((pot + l.call) * fraction)),
    );
    return { type: "raise", to: target };
  }
  return l.canCheck ? { type: "check" } : { type: "call" };
}
