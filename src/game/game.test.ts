import { describe, it, expect } from "vitest";
import { deck, combinations, rank, suit } from "./cards";
import { five, evaluate } from "./evaluate";
import { makePots, distribute } from "./pots";
import { legal, applyBet, type Betting } from "./betting";
import { create, act, nextHand, defaults, type State } from "./engine";
import { cpu, nuts } from "./cpu";
const cards = (s: string) =>
  s
    .split(" ")
    .map((t) => "23456789TJQKA".indexOf(t[0]) + 13 * "shcd".indexOf(t[1]));
function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const bettor = (
  stack = 1000,
  bet = 0,
  total = bet,
  actedAt: number | null = null,
) => ({ stack, bet, total, actedAt, folded: false });
const betting = (
  players: Betting["players"],
  high = 0,
  lastRaise = 100,
): Betting => ({ players, high, lastRaise, minBet: 100 });
function checkState(s: State) {
  const used = [
    ...s.players.flatMap((p) => p.hole),
    ...s.boards.flat(),
    ...s.deck,
  ];
  expect(new Set(used).size).toBe(52);
  expect(used.length).toBe(52);
  expect(
    s.players.every(
      (p) => Number.isInteger(p.stack) && p.stack >= 0 && p.total >= 0,
    ),
  ).toBe(true);
  expect(
    s.players.reduce((n, p) => n + p.stack + (s.done ? 0 : p.total), 0),
  ).toBe(s.initialTotal);
  if (!s.done) {
    expect(s.actor).toBeGreaterThanOrEqual(0);
    expect(s.players[s.actor].folded).toBe(false);
    expect(s.players[s.actor].stack).toBeGreaterThan(0);
  }
}
describe("five-card hand rankings", () => {
  it.each([
    ["As Ks Qs Js Ts", 8],
    ["9h 8h 7h 6h 5h", 8],
    ["As Ah Ac Ad 2c", 7],
    ["Ks Kh Kc 2s 2d", 6],
    ["As Js 8s 5s 2s", 5],
    ["9s 8h 7c 6d 5s", 4],
    ["As 2h 3c 4d 5s", 4],
    ["Qs Qh Qc 8s 2d", 3],
    ["Ks Kh 3c 3d As", 2],
    ["As Ah 8c 5d 2s", 1],
    ["As Jh 8c 5d 2s", 0],
  ])("%s -> category %i", (hand, category) =>
    expect(five(cards(hand)).category).toBe(category),
  );
  it("orders wheel below six-high and compares kickers", () => {
    expect(five(cards("As 2h 3c 4d 5s")).score).toBeLessThan(
      five(cards("2s 3h 4c 5d 6s")).score,
    );
    expect(five(cards("As Ah Kc 5d 2s")).score).toBeGreaterThan(
      five(cards("As Ah Qc Jd Ts")).score,
    );
    expect(five(cards("Ks Kh Kc 2s 2d")).score).toBeGreaterThan(
      five(cards("Qs Qh Qc As Ad")).score,
    );
  });
});
describe("exact Omaha construction", () => {
  it("cannot play a royal-flush board or a one-hole flush", () => {
    const h = evaluate(cards("2h 3d 4c 5h 6d"), cards("As Ks Qs Js Ts"));
    expect(h.category).toBeLessThan(5);
    expect(h.hole).toHaveLength(2);
    expect(h.board).toHaveLength(3);
    expect(
      evaluate(cards("As 2h 3d 4c 5h"), cards("Ks Qs 9s 7s 6d")).category,
    ).not.toBe(5);
  });
  it("cannot use three hole cards to make a full house", () => {
    expect(
      evaluate(cards("As Ah Ac 2d 3c"), cards("Ks Kh 8c 7d 5s")).category,
    ).toBe(2);
  });
  it("selects wheel using exactly two hole cards", () => {
    const h = evaluate(cards("As 2h Kd Qc Jh"), cards("3c 4d 5s 9h Tc"));
    expect(h.category).toBe(4);
    expect(h.hole).toEqual(cards("As 2h"));
  });
  it("evaluates boards independently and retains winning card indices", () => {
    const hole = cards("As Ks 2h 2d 3c");
    const a = evaluate(hole, cards("Qs Js Ts 8d 7c")),
      b = evaluate(hole, cards("2c 9h 9d 6c 5h"));
    expect(a.category).toBe(8);
    expect(b.category).toBe(6);
    expect(new Set(a.cards).size).toBe(5);
  });
  it("matches a separate combinatorial search for randomized hands", () => {
    const rng = seeded(6);
    for (let i = 0; i < 150; i++) {
      const d = deck(rng),
        hole = d.slice(0, 5),
        board = d.slice(5, 10);
      const h = evaluate(hole, board);
      let score = -1;
      for (let a = 0; a < 5; a++)
        for (let b = a + 1; b < 5; b++)
          for (let x = 0; x < 5; x++)
            for (let y = x + 1; y < 5; y++)
              for (let z = y + 1; z < 5; z++)
                score = Math.max(
                  score,
                  five([hole[a], hole[b], board[x], board[y], board[z]]).score,
                );
      expect(h.score).toBe(score);
      expect(h.hole.every((c) => hole.includes(c))).toBe(true);
      expect(h.board.every((c) => board.includes(c))).toBe(true);
    }
  });
  it("combination counts and deck uniqueness", () => {
    expect(combinations([1, 2, 3, 4, 5], 2)).toHaveLength(10);
    for (let i = 0; i < 100; i++) expect(new Set(deck()).size).toBe(52);
    expect(rank(12)).toBe(14);
    expect(suit(51)).toBe(3);
  });
});
const boardA = cards("Qs Js Ts 8d 7c"),
  boardB = cards("2c 9h 9d 6c 5h");
const strong = cards("As Ks 2h 2d 3c"),
  weak = cards("4s 4h 6d 7d 8h");
const contributors = (totals: number[], holes = totals.map(() => strong)) =>
  totals.map((total, id) => ({ id, total, hole: holes[id], folded: false }));
describe("pot distribution", () => {
  it("scoops both boards", () => {
    const r = distribute(
      contributors([100, 100], [strong, weak]),
      [boardA, boardB],
      0,
    );
    expect(r.payouts).toEqual({ 0: 200, 1: 0 });
    expect(r.awards.every((a) => a.winners[0] === 0)).toBe(true);
  });
  it("chops between independent board winners", () => {
    const r = distribute(
      contributors(
        [100, 100],
        [cards("As Ks 4h 5d 6h"), cards("2h 2d 3c 4c 5c")],
      ),
      [boardA, boardB],
      0,
    );
    expect(r.payouts).toEqual({ 0: 100, 1: 100 });
  });
  it("splits three-way ties and assigns odd chips clockwise from button", () => {
    const r = distribute(contributors([3, 3, 3]), [boardA, boardB], 0);
    expect(r.awards.map((a) => a.amount)).toEqual([5, 4]);
    expect(r.payouts).toEqual({ 0: 2, 1: 4, 2: 3 });
  });
  it("forms multiple side pots with folded chips and eligibility", () => {
    const ps = contributors([100, 200, 300, 300]);
    ps[3].folded = true;
    expect(makePots(ps)).toEqual([
      { amount: 400, eligible: [0, 1, 2] },
      { amount: 300, eligible: [1, 2] },
      { amount: 200, eligible: [2] },
    ]);
    const r = distribute(ps, [boardA, boardB], 3);
    expect(r.payouts[3]).toBe(0);
    expect(Object.values(r.payouts).reduce((a, b) => a + b, 0)).toBe(900);
    expect(r.payouts[2]).toBeGreaterThanOrEqual(200);
  });
});
describe("pot-limit betting", () => {
  it("maximum raise includes call and resulting pot", () => {
    const s = betting(
      [bettor(1000, 0, 100), bettor(1000, 100, 200), bettor(1000, 0, 100)],
      100,
    );
    const l = legal(s, 0);
    expect(l.call).toBe(100);
    expect(l.max).toBe(600);
    expect(l.min).toBe(200);
    applyBet(s, 0, { type: "raise", to: 600 });
    expect(s.lastRaise).toBe(500);
    expect(s.players[0].stack).toBe(400);
  });
  it("opening max is pot and illegal actions do not spend chips", () => {
    const s = betting([bettor(1000, 0, 100), bettor(1000, 0, 100)]);
    expect(legal(s, 0).max).toBe(200);
    for (const a of [
      { type: "raise", to: 201 },
      { type: "raise", to: 99 },
      { type: "raise", to: 100.5 },
      { type: "call" },
      { type: "fold" },
    ] as const)
      expect(() => applyBet(s, 0, a)).toThrow();
    expect(s.players[0].stack).toBe(1000);
  });
  it("short all-in is legal but does not reopen a full raise", () => {
    const s = betting(
      [
        bettor(1000, 100, 200, 100),
        bettor(50, 100, 200),
        bettor(1000, 100, 200, 100),
      ],
      100,
    );
    applyBet(s, 1, { type: "raise", to: 150 });
    expect(s.lastRaise).toBe(100);
    expect(legal(s, 0).canRaise).toBe(false);
    expect(legal(s, 0).call).toBe(50);
  });
  it("cumulative short raises reopen action once a full increment is faced", () => {
    const s = betting(
      [
        bettor(1000, 100, 200, 100),
        bettor(50, 100, 200),
        bettor(100, 100, 200),
      ],
      100,
    );
    applyBet(s, 1, { type: "raise", to: 150 });
    applyBet(s, 2, { type: "raise", to: 200 });
    expect(s.high).toBe(200);
    expect(s.lastRaise).toBe(100);
    expect(legal(s, 0).canRaise).toBe(false); // no opponent has chips left
    s.players.push(bettor(1000, 0, 100));
    expect(legal(s, 0).canRaise).toBe(true);
  });
  it("full raise reopens action and resets minimum increment", () => {
    const s = betting(
      [bettor(1000, 100, 200, 100), bettor(1000, 100, 200)],
      100,
    );
    applyBet(s, 1, { type: "raise", to: 350 });
    expect(legal(s, 0).canRaise).toBe(true);
    expect(legal(s, 0).min).toBe(600);
  });
  it("short call all-in cannot exceed stack; no dry side-pot betting", () => {
    const s = betting([bettor(30, 0, 100), bettor(0, 100, 200)], 100);
    expect(legal(s, 0).call).toBe(30);
    expect(legal(s, 0).canRaise).toBe(false);
    applyBet(s, 0, { type: "call" });
    expect(s.players[0].stack).toBe(0);
  });
});
describe("complete game lifecycle", () => {
  it("starts with antes, five holes, two flops and no preflop round", () => {
    const s = create();
    expect(
      s.players.every(
        (p) => p.hole.length === 5 && p.total === 100 && p.bet === 0,
      ),
    ).toBe(true);
    expect(s.boards.map((b) => b.length)).toEqual([3, 3]);
    expect(s.actor).toBe(1);
    checkState(s);
  });
  it("checks through all streets, distributes, and rotates dealer next hand", () => {
    let s = create();
    let actions = 0;
    while (!s.done) {
      s = act(s, { type: "check" });
      actions++;
    }
    expect(actions).toBe(18);
    expect(s.boards.map((b) => b.length)).toEqual([5, 5]);
    checkState(s);
    const next = nextHand(s, seeded(5));
    expect(next.hand).toBe(2);
    expect(next.dealer).toBe(1);
    checkState(next);
    expect(() => nextHand(next)).toThrow();
  });
  it("refunds unmatched bet after everyone folds", () => {
    let s = create();
    s = act(s, { type: "raise", to: 600 });
    while (!s.done) s = act(s, { type: "fold" });
    expect(s.players[1].stack).toBe(10500);
    expect(s.players.reduce((n, p) => n + p.total, 0)).toBe(600);
    checkState(s);
  });
  it("runs out immediately when all players ante all-in", () => {
    const s = create({ ...defaults, count: 6, stack: 10, ante: 100 });
    expect(s.done).toBe(true);
    expect(s.boards[0]).toHaveLength(5);
    checkState(s);
  });
  it("skips busted seats and stops a completed session", () => {
    let s = create({ ...defaults, count: 2 });
    while (!s.done) s = act(s, { type: "check" });
    s.players[0].stack = 0;
    s.players[1].stack = s.initialTotal;
    expect(() => nextHand(s)).toThrow("Session finished");
  });
  it("randomized 1,000 hands: legal actions, side pots, conservation and no stuck rounds", () => {
    const rng = seeded(42);
    let completed = 0;
    for (let run = 0; run < 200; run++) {
      let s = create(
        {
          ...defaults,
          count: 2 + Math.floor(rng() * 5),
          stack: 100 + Math.floor(rng() * 1000),
          ante: 1 + Math.floor(rng() * 100),
          difficulty: "EASY",
        },
        rng,
      );
      for (let hand = 0; hand < 5; hand++) {
        let steps = 0;
        checkState(s);
        while (!s.done) {
          const l = legal(s, s.actor),
            roll = rng();
          let a: Parameters<typeof act>[1];
          if (l.canFold && roll < 0.13) a = { type: "fold" };
          else if (l.canRaise && roll < 0.5)
            a = { type: "raise", to: rng() < 0.5 ? l.min : l.max };
          else a = { type: l.canCheck ? "check" : "call" };
          s = act(s, a);
          checkState(s);
          expect(++steps).toBeLessThan(250);
        }
        completed++;
        checkState(s);
        if (s.players.filter((p) => p.stack > 0).length < 2) {
          s = create({ ...s.settings }, rng);
        } else s = nextHand(s, rng);
      }
    }
    expect(completed).toBe(1000);
  }, 60000);
  it.each(["EASY", "NORMAL", "HARD"] as const)(
    "%s CPU only makes legal moves and completes hands",
    (difficulty) => {
      const rng = seeded(123);
      for (let i = 0; i < 4; i++) {
        let s = create(
          { ...defaults, count: 3, stack: 500, ante: 30, difficulty },
          rng,
        );
        let steps = 0;
        while (!s.done) {
          const action = cpu(s, rng);
          expect(() => act(s, action)).not.toThrow();
          s = act(s, action);
          checkState(s);
          expect(++steps).toBeLessThan(150);
        }
        checkState(s);
      }
    },
    60000,
  );
});
describe("integrity and rare betting scenarios", () => {
  it("short opening bet after a check does not reopen action until full increment", () => {
    const s = betting([
      bettor(1000, 0, 100, 0),
      bettor(50, 0, 100),
      bettor(1000, 0, 100),
    ]);
    applyBet(s, 1, { type: "raise", to: 50 });
    expect(legal(s, 0).canRaise).toBe(false);
    expect(legal(s, 2).min).toBe(150);
    applyBet(s, 2, { type: "raise", to: 150 });
    expect(legal(s, 0).canRaise).toBe(true);
  });
  it("CPU decisions are independent of opponents hidden cards and real deck", () => {
    const s = create({ ...defaults, difficulty: "HARD" }, seeded(77));
    const altered = structuredClone(s);
    altered.players.forEach((p, i) => {
      if (i !== s.actor) p.hole = cards("As Ah Ac Ad Ks");
    });
    altered.deck.reverse();
    expect(cpu(s, seeded(8))).toEqual(cpu(altered, seeded(8)));
  });
  it("three physically distinct Omaha hands tie on a straight", () => {
    const ps = contributors(
      [101, 101, 101],
      [
        cards("2s 3s Ac Kh Qd"),
        cards("2h 3h Ad Kc Qs"),
        cards("2c 3c Ah Ks Qh"),
      ],
    );
    const a = cards("4s 5h 6d 9c Jd"),
      b = cards("4h 5s 6c 9d Js");
    expect(new Set([...ps.flatMap((p) => p.hole), ...a, ...b]).size).toBe(25);
    const r = distribute(ps, [a, b], 0);
    expect(r.awards.every((a) => a.winners.length === 3)).toBe(true);
    expect(Object.values(r.payouts).reduce((a, b) => a + b, 0)).toBe(303);
  });
  it("rejects nonsensical settings and actions after completion", () => {
    expect(() => create({ ...defaults, stack: Infinity })).toThrow();
    expect(() => create({ ...defaults, stack: 1.5 })).toThrow();
    const s = create({ ...defaults, stack: 1 });
    expect(() => act(s, { type: "check" })).toThrow();
  });
});

describe("hard CPU board awareness and side-pot winners", () => {
  it("recognizes nuts on one board and both boards", () => {
    expect(nuts(strong, [boardA, boardB])).toBe(0.5);
    expect(nuts(strong, [boardA, cards("Qh Jh Th 8c 7d")])).toBe(0.5);
    expect(
      nuts(cards("As Ks Ah Kh 2c"), [boardA, cards("Qh Jh Th 8c 7d")]),
    ).toBe(1);
  });
  it("main-pot winner cannot take a side pot without eligibility", () => {
    const ps = contributors(
      [100, 200, 200],
      [strong, cards("Qh Qd Ac 3d 4d"), cards("Jh Jd Kc 3h 8h")],
    );
    const r = distribute(ps, [boardA, boardB], 2);
    expect(r.payouts).toEqual({ 0: 300, 1: 200, 2: 0 });
    expect(r.awards[2].winners).toEqual([1]);
  });
});
