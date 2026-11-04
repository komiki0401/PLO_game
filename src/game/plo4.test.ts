import { describe, expect, it } from "vitest";
import { act, create, defaults, legal, nextHand, type State } from "./engine";
import { cpu, estimate, nuts } from "./cpu";
import { evaluate } from "./evaluate";
import { newScore, readScores, recordCompletedHand } from "../records/scores";

const settings = { ...defaults, mode: "plo4" as const };
const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
function assertState(s: State) {
  const cards = [...s.players.flatMap(p => p.hole), ...s.boards.flat(), ...s.deck];
  expect(cards).toHaveLength(52);
  expect(new Set(cards).size).toBe(52);
  expect(s.players.reduce((n, p) => n + p.stack + (s.done ? 0 : p.total), 0)).toBe(s.initialTotal);
  expect(s.players.every(p => Number.isSafeInteger(p.stack) && p.stack >= 0)).toBe(true);
  if (!s.done) expect(s.players[s.actor].stack).toBeGreaterThan(0);
}
function shortTable(stacks: number[]) {
  const previous = create({ ...settings, count: stacks.length });
  previous.done = true;
  previous.dealer = stacks.length - 1;
  previous.players.forEach((p, i) => { p.stack = stacks[i]; });
  previous.initialTotal = stacks.reduce((n, v) => n + v, 0);
  return nextHand(previous, seeded(7));
}

describe("four-card single-board PLO", () => {
  it("deals four cards, posts only SB/BB and starts left of BB", () => {
    const s = create(settings, seeded(4));
    expect(s.street).toBe(-1);
    expect(s.boards).toEqual([[]]);
    expect(s.players.every(p => p.hole.length === 4)).toBe(true);
    expect(s.blinds).toEqual({ small: 1, big: 2 });
    expect(s.players.map(p => p.total)).toEqual([0, 50, 100, 0, 0, 0]);
    expect(s.actor).toBe(3);
    expect(legal(s, 3)).toMatchObject({ call: 100, min: 200, max: 350 });
    assertState(s);
  });
  it("gives BB its option and deals three cards per board only after everyone acts", () => {
    let s = create({ ...settings, count: 3 }, seeded(4));
    for (let n = 0; n < 2; n++) s = act(s, { type: "call" });
    expect(s.actor).toBe(2);
    expect(s.street).toBe(-1);
    expect(legal(s, 2)).toMatchObject({ canCheck: true, canRaise: true });
    s = act(s, { type: "check" });
    expect(s.street).toBe(0);
    expect(s.actor).toBe(1);
    expect(s.boards.map(b => b.length)).toEqual([3]);
    expect(s.players.every(p => p.bet === 0)).toBe(true);
    expect(s.high).toBe(0);
    assertState(s);
  });
  it("uses button/SB first preflop and BB first postflop in heads-up", () => {
    let s = create({ ...settings, count: 2 }, seeded(1));
    expect(s.blinds).toEqual({ small: 0, big: 1 });
    expect(s.actor).toBe(0);
    expect(legal(s, 0)).toMatchObject({ call: 50, min: 200, max: 300 });
    s = act(s, { type: "call" });
    s = act(s, { type: "check" });
    expect(s.actor).toBe(1);
    expect(s.street).toBe(0);
  });
  it("settles preflop folds without revealing boards and rotates the blinds", () => {
    let s = create({ ...settings, count: 2 }, seeded(2));
    s = act(s, { type: "fold" });
    expect(s.done).toBe(true);
    expect(s.awards).toEqual([]);
    expect(s.boards).toEqual([[]]);
    expect(s.players.map(p => p.stack)).toEqual([9950, 10050]);
    assertState(s);
    s = nextHand(s, seeded(3));
    expect(s.blinds).toEqual({ small: 1, big: 0 });
    expect(s.actor).toBe(1);
  });
  it("skips busted seats, including when only two funded seats remain", () => {
    const s = shortTable([1000, 0, 1000, 0]);
    expect(s.blinds).toEqual({ small: 0, big: 2 });
    expect(s.actor).toBe(0);
    expect(s.players[1].hole).toEqual([]);
    assertState(s);
  });
  it("runs out short blind all-ins without dry side-pot betting", () => {
    const s = shortTable([1000, 25]);
    expect(s.done).toBe(true);
    expect(s.players.map(p => p.total)).toEqual([25, 25]);
    expect(s.boards.map(b => b.length)).toEqual([5]);
    expect(s.awards).toHaveLength(1);
    expect(s.awards[0]).toMatchObject({ board: 0, amount: 50 });
    expect(Object.values(s.payouts).reduce((sum, value) => sum + value, 0)).toBe(50);
    assertState(s);
    const allIn = shortTable([25, 25, 25]);
    let end = allIn;
    while (!end.done) end = act(end, { type: "call" });
    assertState(end);
  });
  it("keeps the full BB bring-in when the BB is short and other players can bet", () => {
    const s = shortTable([1000, 1000, 25]);
    expect(s.high).toBe(100);
    expect(s.actor).toBe(0);
    expect(legal(s, 0).call).toBe(100);
    assertState(s);
  });
  it("only asks a sole funded player to match actual short blinds", () => {
    let s = shortTable([1000, 50, 25]);
    expect(s.actor).toBe(0);
    expect(legal(s, 0)).toMatchObject({ call: 50, canRaise: false });
    s = act(s, { type: "call" });
    expect(s.done).toBe(true);
    expect(s.players.map(p => p.total)).toEqual([50, 50, 25]);
    expect(s.awards.some(a => a.pot > 0)).toBe(true);
    assertState(s);
  });
  it("uses exactly two of four hole cards and three board cards", () => {
    const hand = evaluate([12, 11, 13, 14], [10, 9, 8, 27, 28]);
    expect(hand.category).toBe(8);
    expect(hand.hole).toHaveLength(2);
    expect(hand.board).toHaveLength(3);
    expect(() => evaluate([12, 11, 13], [10, 9, 8])).toThrow();
  });
  it("simulates legal four-card opponents before the flop at every CPU level", () => {
    for (const difficulty of ["EASY", "NORMAL", "HARD"] as const) {
      let s = create({ ...settings, count: 3, difficulty }, seeded(12));
      const rng = seeded(5);
      let count = 0;
      while (!s.done && count++ < 200) { s = act(s, cpu(s, rng)); assertState(s); }
      expect(s.done).toBe(true);
    }
    expect(nuts([0, 1, 2, 3], [[]])).toBe(0);
    const sample = estimate([0, 1, 2, 3], [[]], 3, 5, seeded(19));
    expect(sample.equity).toBeGreaterThanOrEqual(0);
    expect(sample.equity).toBeLessThanOrEqual(1);
  });
  it("preserves cards and chips across 1,000 randomized hands, side pots and all-ins", () => {
    const rng = seeded(29);
    for (let n = 0; n < 1000; n++) {
      let s = create({ ...settings, count: 2 + n % 5, stack: 1 + n % 500, ante: 1 + n % 70 }, rng);
      let actions = 0;
      assertState(s);
      while (!s.done && actions++ < 200) {
        const l = legal(s, s.actor), r = rng();
        s = act(s, l.canRaise && r < 0.25 ? { type: "raise", to: r < 0.12 ? l.max : l.min }
          : l.canFold && r < 0.4 ? { type: "fold" } : { type: l.canCheck ? "check" : "call" });
        assertState(s);
      }
      expect(s.done).toBe(true);
      if (s.awards.length) expect(s.boards.map(b => b.length)).toEqual([5]);
    }
  });
  it("keeps old scores readable and labels new four-card sessions", () => {
    const s = act(create({ ...settings, count: 2 }), { type: "fold" });
    const score = recordCompletedHand(newScore(settings, "new"), s);
    const old = { ...score, id: "old", mode: undefined };
    const records = readScores({ getItem: () => JSON.stringify([old, score]) });
    expect(records).toHaveLength(2);
    expect(records[0].mode).toBeUndefined();
    expect(records[1].mode).toBe("plo4");
    expect(create({ ...defaults, mode: undefined }).players.every(p => p.hole.length === 5)).toBe(true);
  });
});
