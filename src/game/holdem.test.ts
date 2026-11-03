import { describe, expect, it } from "vitest";
import { act, create, defaults, legal, nextHand, type State } from "./engine";
import { evaluate, handName } from "./evaluate";
import { distribute } from "./pots";
import { applyBet, type Betting } from "./betting";
import { cpu, estimate, nuts } from "./cpu";
import { newScore, readScores, recordCompletedHand } from "../records/scores";
const settings = { ...defaults, mode: "holdem" as const };
const cards = (s: string) => s.split(" ").map(c => "23456789TJQKA".indexOf(c[0]) + 13 * "shcd".indexOf(c[1]));
const seeded = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
function check(s: State) {
  const cards = [...s.players.flatMap(p => p.hole), ...s.boards.flat(), ...s.deck, ...s.burns ?? []];
  expect(cards).toHaveLength(52);
  expect(new Set(cards).size).toBe(52);
  expect(s.players.reduce((n, p) => n + p.stack + (s.done ? 0 : p.total), 0)).toBe(s.initialTotal);
  expect(s.players.every(p => Number.isSafeInteger(p.stack) && p.stack >= 0)).toBe(true);
}
describe("no-limit Texas Hold’em", () => {
  it("deals two cards, one empty board, posts SB/BB and permits over-pot raises", () => {
    let s = create(settings, seeded(7));
    expect(s.players.every(p => p.hole.length === 2)).toBe(true);
    expect(s.boards).toEqual([[]]);
    expect(s.actor).toBe(3);
    expect(s.street).toBe(-1);
    expect(s.blinds).toEqual({ small: 1, big: 2 });
    expect(legal(s, 3)).toMatchObject({ call: 100, min: 200, max: 10000, allIn: true });
    s = act(s, { type: "raise", to: 5000 });
    expect(s.high).toBe(5000);
    check(s);
    expect(legal(create({ ...settings, mode: "plo4" }), 3).max).toBe(350);
  });
  it("uses ordinary heads-up order and burns once before flop, turn and river", () => {
    let s = create({ ...settings, count: 2 }, seeded(3));
    expect(s.actor).toBe(0);
    s = act(s, { type: "call" });
    s = act(s, { type: "check" });
    expect(s.actor).toBe(1);
    expect(s.boards[0]).toHaveLength(3);
    expect(s.burns).toHaveLength(1);
    while (!s.done) s = act(s, { type: "check" });
    expect(s.boards[0]).toHaveLength(5);
    expect(s.burns).toHaveLength(3);
    expect(s.awards).toHaveLength(1);
    expect(s.awards[0].amount).toBe(200);
    check(s);
    s = nextHand(s, seeded(9));
    expect(s.dealer).toBe(1);
    expect(s.blinds).toEqual({ small: 1, big: 0 });
    expect(s.burns).toEqual([]);
  });
  it.each([
    ["2c 3d", "As Ks Qs Js Ts", 0, 8],
    ["As 2d", "Ks Qs Js Ts 4h", 1, 8],
    ["As Ah", "Ac Ad Ks Qh 2c", 2, 7],
  ])("can use 0, 1 or 2 private cards: %s / %s", (hole, board, used, category) => {
    const h = evaluate(cards(hole), cards(board));
    expect(h.hole).toHaveLength(used as number);
    expect(h.board).toHaveLength(5 - (used as number));
    expect(h.category).toBe(category);
  });
  it("compares kickers and recognizes a board-only royal as a tie", () => {
    const board = cards("As Kd 7c 5h 2s");
    expect(evaluate(cards("Ah Qd"), board).score).toBeGreaterThan(evaluate(cards("Ac Jd"), board).score);
    const royal = cards("As Ks Qs Js Ts");
    const players = ["2c 3d", "4c 5d", "6c 7d"].map((h, id) => ({ id, hole: cards(h), folded: false, total: 1 }));
    const result = distribute(players, [royal], 0);
    expect(result.awards).toHaveLength(1);
    expect(result.awards[0].winners).toEqual([1, 2, 0]);
    expect(result.payouts).toEqual({ 0: 1, 1: 1, 2: 1 });
    expect(handName(result.awards[0].hands[0])).toBe("ロイヤルストレートフラッシュ");
  });
  it("gives odd tie chips clockwise and side pots only to eligible players", () => {
    const ps = [
      { id: 0, hole: cards("As Ah"), total: 100, folded: false },
      { id: 1, hole: cards("Ks Kh"), total: 200, folded: false },
      { id: 2, hole: cards("Qs Qh"), total: 200, folded: false },
    ];
    const result = distribute(ps, [cards("2c 4d 7h 9s Jc")], 0);
    expect(result.payouts).toEqual({ 0: 300, 1: 200, 2: 0 });
    expect(result.awards).toHaveLength(2);
    ps[2].folded = true;
    const tie = distribute(ps.map(p => ({ ...p, total: 1 })), [cards("Ac Kc Qc Jc Tc")], 0);
    expect(tie.payouts).toEqual({ 0: 1, 1: 2, 2: 0 });
  });
  it("keeps short opening all-ins, full minimum bets and reopening rights correct", () => {
    const s: Betting = { noLimit: true, high: 0, lastRaise: 100, minBet: 100, players:
      [50, 1000, 1000].map(stack => ({ stack, bet: 0, total: 0, folded: false, actedAt: null })) };
    applyBet(s, 0, { type: "raise", to: 50 });
    expect(legal(s, 1).min).toBe(150);
    applyBet(s, 1, { type: "raise", to: 150 });
    expect(s.lastRaise).toBe(100);
    expect(legal(s, 2).min).toBe(250);
    s.players[2].actedAt = 150;
    s.high = 200;
    expect(legal(s, 2).canRaise).toBe(false);
    s.high = 250;
    expect(legal(s, 2).canRaise).toBe(true);
  });
  it("returns unmatched preflop bets without exposing a board", () => {
    let s = create({ ...settings, count: 2 });
    s = act(s, { type: "fold" });
    expect(s.done).toBe(true);
    expect(s.boards).toEqual([[]]);
    expect(s.burns).toEqual([]);
    expect(s.players.map(p => p.stack)).toEqual([9950, 10050]);
    check(s);
  });
  it("keeps hold’em scores without deleting old PLO records or counting a scoop", () => {
    let s = create({ ...settings, count: 2, stack: 100 });
    s = act(s, { type: "call" });
    const score = recordCompletedHand(newScore({ ...settings, count: 2, stack: 100 }, "nlh"), s);
    expect(score.mode).toBe("holdem");
    expect(score.scoops).toBe(0);
    const legacy = { ...score, mode: undefined, id: "legacy" };
    expect(readScores({ getItem: () => JSON.stringify([legacy, score]) })).toHaveLength(2);
    check(s);
  });
  it("normalizes single-board CPU equity and nuts without seeing hidden cards", () => {
    const board = cards("As Ks Qs Js Ts");
    expect(estimate(cards("2c 3d"), [board], 2, 1, seeded(9)).equity).toBe(0.5);
    expect(nuts(cards("2c 3d"), [board])).toBe(1);
    for (const difficulty of ["EASY", "NORMAL", "HARD"] as const) {
      let s = create({ ...settings, difficulty, stack: 500 }, seeded(5));
      const modified = structuredClone(s);
      modified.deck.reverse();
      modified.players.forEach(p => { if (p.id !== s.actor) p.hole.fill(51); });
      expect(cpu(s, seeded(2))).toEqual(cpu(modified, seeded(2)));
      let actions = 0;
      const rng = seeded(4);
      while (!s.done && actions++ < 200) { s = act(s, cpu(s, rng)); check(s); }
      expect(s.done).toBe(true);
    }
  });
  it("conserves 52 cards and chips through 1,000 randomized no-limit hands", () => {
    const rng = seeded(83);
    for (let n = 0; n < 1000; n++) {
      let s = create({ ...settings, count: 2 + n % 5, stack: 1 + n % 500, ante: 1 + n % 100 }, rng), actions = 0;
      check(s);
      while (!s.done && actions++ < 200) {
        const l = legal(s, s.actor), r = rng();
        s = act(s, l.canRaise && r < 0.25 ? { type: "raise", to: r < 0.1 ? l.max : l.min }
          : l.canFold && r < 0.4 ? { type: "fold" } : { type: l.canCheck ? "check" : "call" });
        check(s);
      }
      expect(s.done).toBe(true);
      if (s.awards.length) { expect(s.boards[0]).toHaveLength(5); expect(s.burns).toHaveLength(3); }
    }
  });
});
