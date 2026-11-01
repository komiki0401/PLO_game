import { describe, it, expect } from "vitest";
import { create, defaults } from "../game/engine";
import {
  newScore,
  recordCompletedHand,
  readScores,
  writeScores,
  upsertScore,
  SCORE_KEY,
} from "./scores";
const settings = { ...defaults, count: 3, stack: 100, ante: 100 };
const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const now = "2026-11-01T00:00:00.000Z";
describe("persistent session scores", () => {
  it("records a bust only after the final payout, with correct loss and peak", () => {
    const game = create(settings, seeded(5)),
      score = recordCompletedHand(newScore(settings, "bust", now), game, now);
    expect(score).toMatchObject({
      id: "bust",
      finalStack: 0,
      peakStack: 100,
      net: -100,
      hands: 1,
      scoops: 0,
      status: "bust",
    });
    expect(recordCompletedHand(score, game)).toBe(score);
  });
  it("records positive winnings even when the player was all-in", () => {
    const score = recordCompletedHand(
      newScore(settings, "positive", now),
      create(settings, seeded(6)),
      now,
    );
    expect(score).toMatchObject({
      finalStack: 150,
      peakStack: 150,
      net: 50,
      status: "playing",
      hands: 1,
    });
  });
  it("does not accept an unsettled hand with chips still in the pot", () => {
    expect(() =>
      recordCompletedHand(newScore(defaults, "pending", now), create(defaults)),
    ).toThrow("Only settled hands");
  });
  it("upserts one row per session instead of duplicating each hand", () => {
    const first = newScore(settings, "same", now),
      next = { ...first, finalStack: 150, peakStack: 150, net: 50, hands: 1 };
    expect(upsertScore([first], next)).toEqual([next]);
  });
  it("keeps the newest 50 records", () => {
    let records: ReturnType<typeof newScore>[] = [];
    for (let i = 0; i < 60; i++)
      records = upsertScore(
        records,
        newScore(
          settings,
          `id-${i}`,
          new Date(Date.parse(now) + i * 1000).toISOString(),
        ),
      );
    expect(records).toHaveLength(50);
    expect(records[0].id).toBe("id-59");
    expect(records.at(-1)?.id).toBe("id-10");
  });
  it("restores stored results and treats an unclosed session as interrupted", () => {
    const record = newScore(settings, "saved", now),
      values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    expect(writeScores([record], storage)).toBe(true);
    expect(values.has(SCORE_KEY)).toBe(true);
    expect(readScores(storage)).toEqual([{ ...record, status: "interrupted" }]);
  });
  it("ignores invalid or corrupted data without losing valid records", () => {
    const record = newScore(settings, "valid", now);
    expect(
      readScores({
        getItem: () =>
          JSON.stringify([
            null,
            { ...record, finalStack: -1 },
            { ...record, updatedAt: 123 },
            record,
          ]),
      }),
    ).toEqual([{ ...record, status: "interrupted" }]);
    expect(readScores({ getItem: () => "{bad json" })).toEqual([]);
  });
  it("reports blocked storage instead of throwing", () => {
    expect(
      readScores({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toEqual([]);
    expect(
      writeScores([], {
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).toBe(false);
  });
});
