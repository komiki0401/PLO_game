import { describe, it, expect } from "vitest";
import { create, defaults, act, legal } from "../game/engine";
import { actionAnnouncement } from "./actionAnnouncement";
const seed = (n: number) => () => {
  n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
  return n / 4294967296;
};
describe("all-in announcement uses paid chips, not the button label", () => {
  it("detects a legal full-stack bet and keeps the engine waiting for opponents", () => {
    let s = create({ ...defaults, count: 3, stack: 100, ante: 25 }, seed(1));
    s = act(s, { type: "check" });
    s = act(s, { type: "check" });
    const a = { type: "raise", to: 75 } as const;
    expect(legal(s, s.actor).allIn).toBe(true);
    expect(actionAnnouncement(s, a)).toBe("allin");
    const next = act(s, a);
    expect(next.players[0].stack).toBe(0);
    expect(next.done).toBe(false);
  });
  it("recognizes short all-in calls while ordinary calls keep the call voice", () => {
    const s = create();
    s.high = 100;
    s.players[s.actor].stack = 50;
    expect(actionAnnouncement(s, { type: "call" })).toBe("allin");
    s.players[s.actor].stack = 200;
    expect(actionAnnouncement(s, { type: "call" })).toBe("call");
  });
  it("does not mistake a pot-limited bet for an all-in and distinguishes an opening bet", () => {
    const s = create();
    expect(actionAnnouncement(s, { type: "raise", to: 100 })).toBe("bet");
    s.high = 100;
    expect(actionAnnouncement(s, { type: "raise", to: 200 })).toBe("raise");
    expect(actionAnnouncement(s, { type: "check" })).toBeNull();
    expect(actionAnnouncement(s, { type: "fold" })).toBeNull();
  });
});
