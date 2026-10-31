export type Bettor = {
  stack: number;
  bet: number;
  total: number;
  folded: boolean;
  actedAt: number | null;
};
export type Betting = {
  players: Bettor[];
  high: number;
  lastRaise: number;
  minBet: number;
};
export type Legal = {
  call: number;
  canCheck: boolean;
  canFold: boolean;
  canRaise: boolean;
  min: number;
  max: number;
  allIn: boolean;
};
export function legal(s: Betting, id: number): Legal {
  const p = s.players[id],
    call = Math.max(0, s.high - p.bet);
  const pot = s.players.reduce((n, p) => n + p.total, 0);
  const max = Math.min(p.bet + p.stack, s.high + pot + call);
  const min = s.high + s.lastRaise;
  const rights = p.actedAt === null || s.high - p.actedAt >= s.lastRaise;
  const opponent = s.players.some(
    (o, i) => i !== id && !o.folded && o.stack > 0,
  );
  const canRaise =
    !p.folded &&
    p.stack > call &&
    rights &&
    opponent &&
    max > s.high &&
    (max >= min || max === p.bet + p.stack);
  return {
    call: Math.min(call, p.stack),
    canCheck: call === 0,
    canFold: call > 0,
    canRaise,
    min: Math.min(min, p.bet + p.stack),
    max,
    allIn: canRaise && max === p.bet + p.stack,
  };
}
export type Action =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; to: number };
export function applyBet(s: Betting, id: number, a: Action): void {
  const p = s.players[id],
    l = legal(s, id);
  if (p.folded || p.stack === 0) throw new Error("Inactive player");
  if (a.type === "fold") {
    if (!l.canFold) throw new Error("Check available");
    p.folded = true;
  } else if (a.type === "check") {
    if (!l.canCheck) throw new Error("Must call");
  } else if (a.type === "call") {
    if (l.canCheck) throw new Error("Nothing to call");
    pay(p, l.call);
  } else {
    if (!Number.isInteger(a.to) || !l.canRaise || a.to < l.min || a.to > l.max)
      throw new Error("Illegal raise");
    const increment = a.to - s.high;
    pay(p, a.to - p.bet);
    if (increment >= s.lastRaise) s.lastRaise = increment;
    s.high = a.to;
  }
  p.actedAt = s.high;
}
export function pay(p: Bettor, amount: number) {
  if (!Number.isInteger(amount) || amount < 0 || amount > p.stack)
    throw new Error("Invalid payment");
  p.stack -= amount;
  p.bet += amount;
  p.total += amount;
}
export function needsAction(s: Betting, id: number) {
  const p = s.players[id];
  return !p.folded && p.stack > 0 && (p.actedAt === null || p.bet < s.high);
}
