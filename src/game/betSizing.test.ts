import { describe, expect, it } from "vitest";
import { betSizing } from "./betSizing";
import type { Legal } from "./betting";

const range = (min: number, max: number, allIn = false): Legal => ({
  min, max, allIn, canRaise: true, call: 0, canCheck: true, canFold: false,
});

describe("hundred-chip bet selection", () => {
  it("rounds the minimum up and pot limit down without crossing either", () => {
    const s = betSizing(range(150, 375));
    expect(s).toMatchObject({ min: 200, max: 300, canRaise: true });
    expect(s.normalize(259)).toBe(200);
    expect(s.normalize(375)).toBe(300);
    expect(s.normalize(0)).toBe(200);
  });
  it("does not offer a normal raise when no hundred lies in the legal range", () => {
    expect(betSizing(range(1, 75)).canRaise).toBe(false);
    expect(betSizing(range(210, 275)).canRaise).toBe(false);
  });
  it("keeps exact short all-ins and distinguishes them from normal sizes", () => {
    const short = betSizing(range(75, 75, true));
    expect(short).toMatchObject({ canRaise: true, hasRegular: false });
    expect(short.normalize(100)).toBe(75);
    const s = betSizing(range(100, 375, true));
    expect(s.normalize(350)).toBe(300);
    expect(s.normalize(375)).toBe(375);
    expect(s.normalize(9999)).toBe(375);
  });
  it("never reopens raising rights or makes an inactive player able to raise", () => {
    expect(betSizing({ ...range(100, 1000, true), canRaise: false }).canRaise).toBe(false);
  });
  it("always emits a legal hundred or the full all-in across irregular limits", () => {
    for (let min = 1; min < 400; min += 17) {
      for (let max = min; max < min + 500; max += 23) {
        for (const allIn of [true, false]) {
          const s = betSizing(range(min, max, allIn));
          if (!s.canRaise) continue;
          for (const target of [0, min, (min + max) / 2, max, 100000]) {
            const amount = s.normalize(target);
            expect(amount).toBeGreaterThanOrEqual(min);
            expect(amount).toBeLessThanOrEqual(max);
            expect(amount % 100 === 0 || (allIn && amount === max)).toBe(true);
          }
        }
      }
    }
  });
});
