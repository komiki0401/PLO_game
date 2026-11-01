import { deck, type Card } from "./cards";
import {
  applyBet,
  legal,
  needsAction,
  pay,
  type Action,
  type Bettor,
} from "./betting";
import { distribute, type Award } from "./pots";
export type Settings = {
  mode?: "plo5" | "plo4";
  count: number;
  stack: number;
  ante: number;
  difficulty: "EASY" | "NORMAL" | "HARD";
  speed: number;
  sound: boolean;
  voice: boolean;
  volume: number;
};
export const defaults: Settings = {
  mode: "plo5",
  count: 6,
  stack: 10000,
  ante: 100,
  difficulty: "NORMAL",
  speed: 1,
  sound: true,
  voice: true,
  volume: 0.65,
};
export type Player = Bettor & {
  id: number;
  name: string;
  hole: Card[];
  last: string;
};
export type State = {
  players: Player[];
  boards: Card[][];
  deck: Card[];
  dealer: number;
  actor: number;
  street: number;
  high: number;
  lastRaise: number;
  minBet: number;
  hand: number;
  done: boolean;
  awards: Award[];
  payouts: Record<number, number>;
  log: string[];
  settings: Settings;
  initialTotal: number;
  blinds?: { small: number; big: number };
};
export function create(
  settings: Settings = defaults,
  rng = Math.random,
): State {
  if (
    (settings.mode !== undefined && settings.mode !== "plo5" && settings.mode !== "plo4") ||
    !Number.isInteger(settings.count) ||
    settings.count < 2 ||
    settings.count > 6 ||
    !Number.isSafeInteger(settings.stack) ||
    settings.stack < 1 ||
    settings.stack > 10000000 ||
    !Number.isSafeInteger(settings.ante) ||
    settings.ante < 1 ||
    settings.ante > 1000000
  )
    throw new Error("Invalid settings");
  const players = Array.from({ length: settings.count }, (_, id) => ({
    id,
    name: id === 0 ? "YOU" : ["AKIRA", "LUNA", "REN", "MIKA", "SORA"][id - 1],
    stack: settings.stack,
    bet: 0,
    total: 0,
    folded: false,
    actedAt: null,
    hole: [],
    last: "",
  }));
  return nextHand(
    {
      players,
      boards: [[], []],
      deck: [],
      dealer: settings.count - 1,
      actor: -1,
      street: 0,
      high: 0,
      lastRaise: settings.ante,
      minBet: settings.ante,
      hand: 0,
      done: true,
      awards: [],
      payouts: {},
      log: [],
      settings,
      initialTotal: settings.stack * settings.count,
    },
    rng,
  );
}
export function nextHand(previous: State, rng = Math.random): State {
  if (!previous.done) throw new Error("Hand in progress");
  const s = structuredClone(previous),
    active = s.players.filter((p) => p.stack > 0);
  if (active.length < 2) throw new Error("Session finished");
  s.hand++;
  s.done = false;
  const preflop = s.settings.mode === "plo4";
  s.street = preflop ? -1 : 0;
  s.high = 0;
  s.lastRaise = s.minBet;
  s.awards = [];
  s.payouts = {};
  s.log = [`HAND #${s.hand} · ${preflop ? "PLO4 · PREFLOP" : "BOMB POT"}`];
  s.blinds = undefined;
  s.deck = deck(rng);
  s.boards = [[], []];
  do {
    s.dealer = (s.dealer + 1) % s.players.length;
  } while (s.players[s.dealer].stack === 0);
  s.players.forEach((p) => {
    p.bet = 0;
    p.total = 0;
    p.hole = [];
    p.folded = p.stack === 0;
    p.actedAt = null;
    p.last = p.folded ? "SITTING OUT" : "";
    if (!p.folded && !preflop) {
      pay(p, Math.min(p.stack, s.settings.ante));
      p.bet = 0;
    }
  });
  for (let n = 0; n < (preflop ? 4 : 5); n++)
    for (let offset = 1; offset <= s.players.length; offset++) {
      const p = s.players[(s.dealer + offset) % s.players.length];
      if (!p.folded) p.hole.push(s.deck.pop()!);
    }
  s.actor = s.dealer;
  if (preflop) {
    const nextSeat = (id: number) => {
      do {
        id = (id + 1) % s.players.length;
      } while (s.players[id].folded);
      return id;
    };
    const small = active.length === 2 ? s.dealer : nextSeat(s.dealer);
    const big = nextSeat(small);
    s.blinds = { small, big };
    for (const [id, amount, label] of [
      [small, Math.max(1, Math.floor(s.minBet / 2)), "SB"],
      [big, s.minBet, "BB"],
    ] as const) {
      const p = s.players[id];
      pay(p, Math.min(p.stack, amount));
      p.last = `${label} ${p.bet}${p.stack === 0 ? " · ALL-IN" : ""}`;
      s.log.push(`${p.name}: ${p.last}`);
    }
    s.high = s.minBet;
    s.actor = big;
  } else {
    for (let b = 0; b < 2; b++)
      for (let n = 0; n < 3; n++) s.boards[b].push(s.deck.pop()!);
  }
  advance(s);
  return s;
}
function refund(s: State) {
  const sorted = [...s.players].sort((a, b) => b.total - a.total);
  const excess = sorted[0].total - (sorted[1]?.total ?? 0);
  if (excess > 0) {
    sorted[0].total -= excess;
    sorted[0].stack += excess;
    sorted[0].bet = Math.max(0, sorted[0].bet - excess);
    s.log.push(`${sorted[0].name} 未コール ${excess} 返却`);
  }
}
function finish(s: State) {
  refund(s);
  const alive = s.players.filter((p) => !p.folded);
  if (alive.length === 1) {
    const amount = s.players.reduce((n, p) => n + p.total, 0);
    s.payouts = { [alive[0].id]: amount };
    s.log.push(`${alive[0].name} が ${amount} 獲得（全員フォールド）`);
  } else {
    const result = distribute(s.players, s.boards, s.dealer);
    s.awards = result.awards;
    s.payouts = result.payouts;
    s.log.push("SHOWDOWN");
  }
  s.players.forEach((p) => {
    p.stack += s.payouts[p.id] ?? 0;
    p.bet = 0;
  });
  s.done = true;
  s.actor = -1;
}
function advance(s: State) {
  if (s.players.filter((p) => !p.folded).length === 1) {
    finish(s);
    return;
  }
  for (;;) {
    const able = s.players.filter((p) => !p.folded && p.stack > 0);
    const outstanding = Math.max(
      0,
      ...s.players.filter((p) => !p.folded).map((p) => p.bet),
    );
    // With only one funded player left, match actual all-in chips, not a nominal short BB.
    if (able.length === 1) s.high = outstanding;
    // No dry side-pot betting: a sole player only acts to match an outstanding wager.
    if (able.length <= 1 && (!able.length || able[0].bet >= outstanding)) {
      while (s.boards[0].length < 5)
        for (const b of s.boards) b.push(s.deck.pop()!);
      s.street = 2;
      finish(s);
      return;
    }
    for (let n = 1; n <= s.players.length; n++) {
      const id = (s.actor + n) % s.players.length;
      if (needsAction(s, id)) {
        s.actor = id;
        return;
      }
    }
    refund(s);
    if (s.street === 2) {
      finish(s);
      return;
    }
    s.street++;
    for (const b of s.boards)
      for (let n = 0; n < (s.street === 0 ? 3 : 1); n++) b.push(s.deck.pop()!);
    s.high = 0;
    s.lastRaise = s.minBet;
    s.players.forEach((p) => {
      p.bet = 0;
      p.actedAt = null;
      p.last = p.folded ? "FOLD" : p.stack === 0 ? "ALL-IN" : "";
    });
    s.actor = s.dealer;
    s.log.push(["FLOP", "TURN", "RIVER"][s.street]);
  }
}
export function act(previous: State, a: Action): State {
  if (previous.done || previous.actor < 0) throw new Error("No action");
  const s = structuredClone(previous),
    p = s.players[s.actor];
  const before = p.bet;
  applyBet(s, s.actor, a);
  p.last =
    a.type === "raise"
      ? `${p.stack === 0 ? "ALL-IN" : previous.high === 0 ? "BET" : "RAISE"} ${p.bet}`
      : a.type === "call"
        ? `${p.stack === 0 ? "ALL-IN" : "CALL"} ${p.bet - before}`
        : a.type.toUpperCase();
  s.log.push(`${p.name}: ${p.last}`);
  advance(s);
  return s;
}
export { legal };
