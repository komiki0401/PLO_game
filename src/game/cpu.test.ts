import { describe, expect, it } from "vitest";
import { act, create, defaults, legal, type State } from "./engine";
import { chooseCpuAction, cpu, type CpuRead } from "./cpu";
import { personalities, personalityFor } from "./personalities";

const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
function facingBet(id: number, high = 200): State {
  const s = create({ ...defaults, difficulty: "NORMAL" }, seeded(12));
  s.actor = id;
  s.high = high;
  s.players.forEach(p => { p.bet = 0; p.total = 100; p.actedAt = null; });
  s.players[0].bet = high;
  s.players[0].total += high;
  return s;
}
const medium: CpuRead = { equity: 0.6, scoop: 0.2, nutShare: 0, categories: [2, 1] };
const strong: CpuRead = { equity: 0.95, scoop: 0.8, nutShare: 0.5, categories: [5, 4] };

describe("fixed NPC personalities", () => {
  it("assigns a distinct stable style to each named CPU", () => {
    const s = create();
    expect(s.players.slice(1).map(p => personalityFor(p.id).name)).toEqual(s.players.slice(1).map(p => p.name));
    expect(new Set(personalities.map(p => p.style)).size).toBe(5);
    expect(personalityFor(0).style).toBe("balanced");
  });
  it("makes the aggressive player raise more often and larger than the rock on the same assessment", () => {
    const raises = (id: number) => Array.from({ length: 200 }, (_, i) =>
      chooseCpuAction(facingBet(id), medium, seeded(i * 7919 + 7)),
    ).filter(a => a.type === "raise").length;
    expect(raises(1)).toBeGreaterThan(120);
    expect(raises(2)).toBeLessThan(10);
    const attack = chooseCpuAction(facingBet(1), strong, () => 0);
    const rock = chooseCpuAction(facingBet(2), strong, () => 0);
    expect(attack.type).toBe("raise");
    expect(rock.type).toBe("raise");
    if (attack.type === "raise" && rock.type === "raise") expect(attack.to).toBeGreaterThan(rock.to);
  });
  it("makes the rock fold marginal expensive calls that the attacker plays", () => {
    const marginal = { ...medium, equity: 0.35 };
    expect(chooseCpuAction(facingBet(1), marginal, () => 0.5).type).not.toBe("fold");
    expect(chooseCpuAction(facingBet(2), marginal, () => 0.5).type).toBe("fold");
  });
  it("makes the hunter raise strong made hands but never bluff an unfinished hand or preflop", () => {
    const s = facingBet(3);
    let raises = 0;
    for (let i = 0; i < 100; i++) {
      const rng = seeded(i * 7919 + 7);
      if (chooseCpuAction(s, strong, rng).type === "raise") raises++;
      expect(chooseCpuAction(s, { ...strong, categories: [2, 2] }, () => 0).type).toBe("call");
    }
    expect(raises).toBeGreaterThan(85);
    const preflop = create({ ...defaults, mode: "plo4" });
    preflop.actor = 3;
    expect(chooseCpuAction(preflop, { ...strong, categories: [-1, -1] }, () => 0).type).toBe("call");
    expect(chooseCpuAction(s, { ...medium, categories: [4, 0], equity: 0.45 }, () => 0).type).toBe("call");
  });
  it("makes the defender check or call even the nuts, and fold bad value", () => {
    expect(chooseCpuAction(facingBet(4), strong, () => 0).type).toBe("call");
    expect(chooseCpuAction(facingBet(4, 0), strong, () => 0).type).toBe("check");
    expect(chooseCpuAction(facingBet(4), { ...medium, equity: 0.1 }, () => 0).type).toBe("fold");
  });
  it("makes the cautious player release two pair to pressure but keep free checks and strong draws", () => {
    const s = facingBet(5);
    const twoPair = { ...medium, categories: [2, 2] };
    expect(chooseCpuAction(s, twoPair, () => 0.9).type).toBe("fold");
    expect(chooseCpuAction(s, { ...twoPair, equity: 0.8 }, () => 0.9).type).not.toBe("fold");
    expect(chooseCpuAction(s, { ...twoPair, categories: [2, 4] }, () => 0.9).type).not.toBe("fold");
    expect(chooseCpuAction(facingBet(5, 0), twoPair, () => 0.9).type).toBe("check");
    expect(chooseCpuAction(facingBet(5, 10), twoPair, () => 0.9).type).toBe("call");
  });
  it("never permits a personality to exceed the pot, raise without rights or fold a free check", () => {
    for (const profile of personalities) {
      for (const read of [medium, strong, { ...medium, equity: 0.01 }]) {
        for (const high of [0, 200]) {
          const s = facingBet(personalities.indexOf(profile) + 1, high);
          for (const roll of [0, 0.5, 0.99]) {
            const action = chooseCpuAction(s, read, () => roll);
            expect(() => act(s, action)).not.toThrow();
            if (high === 0) expect(action.type).not.toBe("fold");
            if (action.type === "raise") expect(action.to).toBeLessThanOrEqual(legal(s, s.actor).max);
          }
        }
      }
      const locked = facingBet(personalities.indexOf(profile) + 1);
      locked.players[locked.actor].actedAt = locked.high;
      expect(chooseCpuAction(locked, strong, () => 0).type).not.toBe("raise");
    }
  });
  it.each(["plo4", "plo5"] as const)("uses no hidden cards or undealt deck for any %s personality at any difficulty", mode => {
    for (const difficulty of ["EASY", "NORMAL", "HARD"] as const) {
      for (let id = 1; id <= 5; id++) {
        const s = create({ ...defaults, mode, difficulty }, seeded(9));
        s.actor = id;
        const original = structuredClone(s), altered = structuredClone(s);
        altered.deck.reverse();
        altered.players.forEach(p => { if (p.id !== id) p.hole.fill(51); });
        expect(cpu(s, seeded(42))).toEqual(cpu(altered, seeded(42)));
        expect(s).toEqual(original);
        expect(() => act(s, cpu(s, seeded(19)))).not.toThrow();
      }
    }
  });
  it.each(["plo4", "plo5"] as const)("completes a full six-seat %s hand with all five personalities at every difficulty", mode => {
    for (const difficulty of ["EASY", "NORMAL", "HARD"] as const) {
      const rng = seeded(17);
      let s = create({ ...defaults, mode, difficulty, stack: 1000 }, rng), steps = 0;
      while (!s.done && steps++ < 200) s = act(s, cpu(s, rng));
      expect(s.done).toBe(true);
      expect(s.players.reduce((n, p) => n + p.stack, 0)).toBe(s.initialTotal);
      const cards = [...s.players.flatMap(p => p.hole), ...s.boards.flat(), ...s.deck];
      expect(cards).toHaveLength(52);
      expect(new Set(cards).size).toBe(52);
    }
  }, 60000);
});
