import { describe, it, expect } from "vitest";
import { Room, TURN_MS, validateOptions } from "../../worker/room";
import { legal } from "../game/engine";
import type { Mode } from "./protocol";
const seeded = (value: number) => () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
function table(mode: Mode, count = 6) {
  const r = new Room({ mode, stack: 10000, ante: 100 }, 0);
  for (let i = 0; i < count; i++) r.join(`友達${i}`, `secret${i}`, 1);
  return r;
}
describe("authoritative online rooms", () => {
  it.each(["holdem", "plo4", "plo5"] as const)("plays two complete six-human %s hands without changing total chips", mode => {
    const r = table(mode), rng = seeded(42);
    r.command(0, { type: "start", revision: r.data.revision }, 2, rng);
    for (let hand = 0; hand < 2; hand++) {
      let steps = 0;
      while (!r.data.game!.done && steps++ < 150) {
        const s = r.data.game!, seat = s.actor, l = legal(s, seat);
        r.command(seat, { type: "action", revision: r.data.revision, action: { type: l.canCheck ? "check" : "call" } }, 3, rng);
      }
      expect(r.data.game!.done).toBe(true);
      expect(r.data.game!.players.reduce((n, p) => n + p.stack, 0)).toBe(60000);
      expect(r.data.game!.boards).toHaveLength(mode === "plo5" ? 2 : 1);
      expect(r.data.game!.players[0].hole).toHaveLength(mode === "holdem" ? 2 : mode === "plo4" ? 4 : 5);
      if (!hand) r.command(0, { type: "next", revision: r.data.revision }, 4, rng);
    }
    expect(r.data.game!.hand).toBe(2);
  });
  it.each(["holdem", "plo4", "plo5"] as const)("sends only each seat's %s cards, never the deck, burns or other credentials", mode => {
    const r = table(mode);
    r.command(0, { type: "start", revision: r.data.revision }, 2, seeded(42));
    for (let seat = 0; seat < 6; seat++) {
      const v = r.view(seat);
      expect(v.game!.players[seat].hole).toEqual(r.data.game!.players[seat].hole);
      for (const p of v.game!.players.filter(p => p.id !== seat)) expect(p.hole.every(c => c === null)).toBe(true);
      const serialized = JSON.stringify(v);
      for (const word of ["secret", "tokenHash", "deck", "burns", "actedAt", '"log"']) expect(serialized).not.toContain(word);
      expect(v.legal !== null).toBe(r.data.game!.actor === seat);
    }
  });
  it("rejects forged turns, stale/duplicate actions, illegal raises and non-host controls", () => {
    const r = table("holdem");
    expect(() => r.command(1, { type: "start", revision: r.data.revision }, 2)).toThrow();
    r.command(0, { type: "start", revision: r.data.revision }, 2, seeded(8));
    const actor = r.data.game!.actor, revision = r.data.revision;
    expect(() => r.command((actor + 1) % 6, { type: "action", revision, action: { type: "call" } }, 3)).toThrow();
    expect(() => r.command(actor, { type: "action", revision, action: { type: "raise", to: 999999999 } }, 3)).toThrow();
    const l = legal(r.data.game!, actor);
    const command = { type: "action" as const, revision, action: { type: l.canCheck ? "check" as const : "call" as const } };
    r.command(actor, command, 3);
    const snapshot = structuredClone(r.data);
    expect(() => r.command(actor, command, 4)).toThrow();
    expect(r.data).toEqual(snapshot);
  });
  it("reconnects the same seat, transfers the host and enforces capacity/late joins", () => {
    const r = table("plo4");
    expect(() => r.join("7人目", "extra", 2)).toThrow(/満員/);
    r.disconnect(0); expect(r.host).toBe(1);
    expect(r.join("別の表示名", "secret0", 3)).toBe(0);
    expect(r.data.members).toHaveLength(6);
    expect(r.data.members[0].name).toBe("友達0");
    const small = table("plo4", 2);
    small.command(0, { type: "start", revision: small.data.revision }, 2, seeded(2));
    expect(() => small.join("後から", "unknown", 3)).toThrow(/開始済み/);
  });
  it("keeps folded and uncontested winning hands private", () => {
    const r = table("holdem", 3);
    r.command(0, { type: "start", revision: r.data.revision }, 2, seeded(2));
    while (!r.data.game!.done) {
      const s = r.data.game!, l = legal(s, s.actor);
      r.command(s.actor, { type: "action", revision: r.data.revision, action: { type: l.canFold ? "fold" : "check" } }, 3);
    }
    expect(r.data.game!.awards).toHaveLength(0);
    expect(r.view(0).game!.players.filter(p => p.id !== 0).every(p => p.hole.every(c => c === null))).toBe(true);
  });
  it("persists deck/turn privately, resumes, and checks/folds only after the deadline", () => {
    const r = table("holdem", 3);
    r.command(0, { type: "start", revision: r.data.revision }, 100, seeded(4));
    const restored = new Room(r.data.options, 100, structuredClone(r.data));
    expect(restored.data.game).toEqual(r.data.game);
    expect(restored.timeout(100 + TURN_MS - 1)).toBe(false);
    const actor = restored.data.game!.actor;
    expect(restored.timeout(100 + TURN_MS)).toBe(true);
    expect(restored.data.game!.players[actor].folded).toBe(true);
    expect(restored.data.deadline).toBe(100 + TURN_MS * 2);
    const free = table("plo5", 2);
    free.command(0, { type: "start", revision: free.data.revision }, 100, seeded(4));
    const checker = free.data.game!.actor;
    free.timeout(100 + TURN_MS);
    expect(free.data.game!.players[checker].folded).toBe(false);
    expect(free.data.game!.players[checker].last).toBe("CHECK");
  });
  it("validates options and expires rooms", () => {
    expect(() => validateOptions({ mode: "invalid", stack: 1000, ante: 100 })).toThrow();
    expect(() => validateOptions({ mode: "holdem", stack: 1000, ante: 2000 })).toThrow();
    const r = table("holdem", 2);
    expect(() => r.join("friend", "expired", r.data.expiresAt)).toThrow(/期限/);
  });
});
