import { describe, it, expect } from "vitest";
import { chipBreakdown } from "./ChipStacks";
describe("stack denomination amounts", () => {
  it.each([
    0, 1, 4, 5, 24, 25, 99, 100, 999, 1000, 9900, 10000, 10000001, 60000000,
  ])("represents %i chips exactly", (amount) => {
    const piles = chipBreakdown(amount);
    expect(piles.reduce((sum, p) => sum + p.value * p.count, 0)).toBe(amount);
    expect(piles.every((p) => p.count > 0 && Number.isInteger(p.count))).toBe(
      true,
    );
  });
  it("shows zero as an empty rack and rejects invalid balances", () => {
    expect(chipBreakdown(0)).toEqual([]);
    for (const amount of [-1, 1.5, Infinity, NaN])
      expect(() => chipBreakdown(amount)).toThrow();
  });
});
