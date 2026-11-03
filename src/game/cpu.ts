import { deck, combinations, type Card } from "./cards";
import { evaluate, five } from "./evaluate";
import { legal, type Action } from "./betting";
import type { State } from "./engine";
import { personalityFor } from "./personalities";
import { betSizing } from "./betSizing";
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
    const others = Array.from({ length: opponents }, () => d.splice(0, hole.length));
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
  return { equity: result / (trials * boards.length), scoop: scoops / trials };
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
  if (boards.some((board) => board.length < 3)) return 0;
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
    outer: for (const pair of pairs) {
      if (hole.length === 2) {
        if (evaluate(pair, board).score > own) { beaten = true; break; }
        continue;
      }
      for (const triple of triples)
        if (five([...pair, ...triple]).score > own) {
          beaten = true;
          break outer;
        }
    }
    if (!beaten) count++;
  }
  return count / boards.length;
}
export function cpu(s: State, rng = Math.random): Action {
  const p = s.players[s.actor],
    level = s.settings.difficulty;
  const opponents = Math.max(
    1,
    s.players.filter((o) => !o.folded && o.id !== p.id).length,
  );
  const sample = estimate(
    p.hole,
    s.boards,
    level === "HARD" ? 32 : level === "NORMAL" ? 10 : 3,
    level === "HARD" ? opponents : 1,
    rng,
  );
  const categories = s.boards.map(board =>
    board.length >= 3 ? evaluate(p.hole, board).category : -1,
  );
  const nutShare = level === "HARD" ? nuts(p.hole, s.boards) : 0;
  return chooseCpuAction(s, { ...sample, categories, nutShare }, rng);
}

export type CpuRead = {
  equity: number;
  scoop: number;
  nutShare: number;
  categories: number[];
};

// Separate the policy from card sampling so each style can be compared using the
// same public hand assessment. Legal actions still bound every personality.
export function chooseCpuAction(s: State, read: CpuRead, rng = Math.random): Action {
  const p = s.players[s.actor],
    l = legal(s, s.actor),
    profile = personalityFor(p.id),
    level = s.settings.difficulty;
  const strength =
    level === "HARD"
      ? read.equity * 0.8 + read.scoop * 0.15 + read.nutShare * 0.05
      : read.equity;
  const pot = s.players.reduce((n, p) => n + p.total, 0),
    odds = l.call / (pot + l.call || 1);
  const postflop = s.boards.every(board => board.length >= 3);
  const weakBoth = postflop && read.categories.every(category => category <= 2);
  const strongMade = postflop && read.categories.some(category => category >= 4);
  // A category alone is not a win: the other board, draws and pot odds matter.
  // Checking is always free, even for the most cautious opponent.
  if (l.canFold && profile.style === "cautious" && weakBoth &&
      odds >= 0.1 && read.equity < 0.66 && read.nutShare === 0)
    return { type: "fold" };
  const callThreshold = Math.max(
    profile.callFloor - (postflop ? 0 : 0.06) - (level === "EASY" ? 0.06 : 0),
    odds * profile.oddsFactor * (level === "EASY" ? 0.8 : 1),
  );
  if (
    l.canFold && strength < callThreshold &&
    (profile.style !== "aggressive" || rng() > 0.12)
  )
    return { type: "fold" };
  if (profile.style === "defender")
    return l.canCheck ? { type: "check" } : { type: "call" };
  const canValueRaise = profile.style === "hunter"
    ? strongMade && (strength >= profile.raiseThreshold || read.nutShare > 0)
    : strength >= profile.raiseThreshold;
  const bluff = profile.bluff * (level === "EASY" ? 0.5 : level === "HARD" ? 1.25 : 1);
  const sizing = betSizing(l);
  if (
    sizing.canRaise &&
    ((canValueRaise && rng() < profile.raiseChance) || (bluff > 0 && rng() < bluff))
  ) {
    const fraction = Math.min(1, profile.sizing + (read.scoop > 0.65 ? 0.15 : 0));
    const target = Math.max(
      l.min,
      Math.min(l.max, s.high + Math.floor((pot + l.call) * fraction)),
    );
    return { type: "raise", to: sizing.normalize(target) };
  }
  return l.canCheck ? { type: "check" } : { type: "call" };
}
