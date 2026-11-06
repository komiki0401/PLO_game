import { handName } from "../src/game/evaluate";
import { create, act, nextHand, defaults, legal, type State } from "../src/game/engine";
import type { Command, RoomOptions, RoomView } from "../src/online/protocol";
export const TURN_MS = 45000;
export const ROOM_MS = 24 * 60 * 60 * 1000;
type Member = { seat: number; name: string; tokenHash: string; connected: boolean };
export type SavedRoom = { options: RoomOptions; members: Member[]; game: State | null; revision: number; deadline: number | null; expiresAt: number };
export function validateOptions(value: unknown): RoomOptions {
  const o = value as RoomOptions;
  if (!o || !["holdem", "plo4", "plo5"].includes(o.mode) ||
    !Number.isSafeInteger(o.stack) || o.stack < 100 || o.stack > 10000000 ||
    !Number.isSafeInteger(o.ante) || o.ante < 1 || o.ante > o.stack)
    throw new Error("ゲーム・初期チップ・アンティ／ブラインドを確認してください。");
  return { mode: o.mode, stack: o.stack, ante: o.ante };
}
// Cryptographic shuffle input. This code is never bundled in the client.
export function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}
export class Room {
  data: SavedRoom;
  constructor(options: RoomOptions, now = Date.now(), saved?: SavedRoom) {
    this.data = saved ?? { options: validateOptions(options), members: [], game: null, revision: 0, deadline: null, expiresAt: now + ROOM_MS };
  }
  get host() { return this.data.members.find(m => m.connected)?.seat ?? -1; }
  join(name: string, tokenHash: string, now = Date.now()): number {
    this.checkExpiry(now);
    const existing = this.data.members.find(m => m.tokenHash === tokenHash);
    if (existing) { existing.connected = true; this.data.revision++; return existing.seat; }
    if (this.data.game) throw new Error("対戦開始済みです。新しい部屋を作成してください。");
    if (this.data.members.length >= 6) throw new Error("この部屋は満員です（最大6人）。");
    name = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 20) : "";
    if (!name) throw new Error("表示名を入力してください。");
    const seat = this.data.members.length;
    this.data.members.push({ seat, name, tokenHash, connected: true });
    this.data.revision++;
    return seat;
  }
  disconnect(seat: number) {
    const member = this.data.members[seat];
    if (member) { member.connected = false; this.data.revision++; }
  }
  checkExpiry(now: number) {
    if (now >= this.data.expiresAt) throw new Error("部屋の有効期限が切れました。新しい部屋を作成してください。");
  }
  command(seat: number, message: Command, now = Date.now(), rng = secureRandom) {
    this.checkExpiry(now);
    if (!this.data.members[seat]?.connected) throw new Error("再接続してください。");
    if (!Number.isSafeInteger(message.revision) || message.revision !== this.data.revision)
      throw new Error("状況が更新されました。画面を確認してもう一度操作してください。");
    const game = this.data.game;
    if (message.type === "start") {
      if (seat !== this.host || game) throw new Error("ホストだけが対戦を開始できます。");
      if (this.data.members.length < 2 || this.data.members.some(m => !m.connected))
        throw new Error("2人以上、全員が接続した状態で開始してください。");
      this.data.game = create({ ...defaults, ...this.data.options, count: this.data.members.length, sound: false, voice: false }, rng);
      this.data.game.players.forEach((p, i) => { p.name = this.data.members[i].name; });
    } else if (message.type === "next") {
      if (seat !== this.host || !game?.done || game.players.filter(p => p.stack > 0).length < 2)
        throw new Error("ホストがハンド終了後に進められます。");
      this.data.game = nextHand(game, rng);
    } else if (message.type === "action") {
      if (!game || game.done || game.actor !== seat) throw new Error("あなたの手番ではありません。");
      const a = message.action;
      if (!a || !["fold", "check", "call", "raise"].includes(a.type)) throw new Error("不正な操作です。");
      this.data.game = act(game, a);
    } else throw new Error("不正な操作です。");
    this.data.revision++;
    this.resetDeadline(now);
  }
  resetDeadline(now: number) {
    this.data.deadline = this.data.game && !this.data.game.done ? now + TURN_MS : null;
  }
  timeout(now = Date.now()) {
    const s = this.data.game;
    if (!s || s.done || this.data.deadline === null || now < this.data.deadline) return false;
    this.data.game = act(s, { type: legal(s, s.actor).canCheck ? "check" : "fold" });
    this.data.revision++;
    this.resetDeadline(now);
    return true;
  }
  view(seat: number): RoomView {
    const s = this.data.game;
    return {
      type: "state", revision: this.data.revision, you: seat, host: this.host,
      options: this.data.options, members: this.data.members.map(({ seat, name, connected }) => ({ seat, name, connected })),
      deadline: this.data.deadline, expiresAt: this.data.expiresAt,
      legal: s && !s.done && s.actor === seat ? legal(s, seat) : null,
      game: s ? {
        players: s.players.map(p => ({
          id: p.id, name: p.name, stack: p.stack, bet: p.bet, total: p.total, folded: p.folded, last: p.last,
          // A fold win never reveals the winner's hand. Folded cards stay private.
          hole: p.id === seat || (s.done && s.awards.length > 0 && !p.folded) ? [...p.hole] : p.hole.map(() => null),
        })),
        boards: s.boards.map(b => [...b]), dealer: s.dealer, actor: s.actor, hand: s.hand, street: s.street,
        high: s.high, done: s.done, payouts: { ...s.payouts },
        results: s.awards.map(a => ({ board: a.board, amount: a.amount, winners: [...a.winners], category: a.hands[a.winners[0]].category, label: handName(a.hands[a.winners[0]]) })),
      } : null,
    };
  }
}
