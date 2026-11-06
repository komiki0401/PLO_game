import type { Action, Legal } from "../game/betting";
export type Mode = "holdem" | "plo4" | "plo5";
export const modeNames: Record<Mode, string> = {
  holdem: "ホールデム・ノンリミット", plo4: "PLO4・プリフロップ", plo5: "PLO5・Wボードボムポット",
};
export type RoomOptions = { mode: Mode; stack: number; ante: number };
export type PublicPlayer = { id: number; name: string; stack: number; bet: number; total: number; folded: boolean; last: string; hole: (number | null)[] };
export type PublicGame = {
  players: PublicPlayer[]; boards: number[][]; dealer: number; actor: number;
  hand: number; street: number; high: number; done: boolean;
  payouts: Record<number, number>; results: { board: number; amount: number; winners: number[]; category: number; label: string }[];
};
export type RoomView = {
  type: "state"; revision: number; you: number; host: number;
  members: { seat: number; name: string; connected: boolean }[];
  options: RoomOptions; game: PublicGame | null; legal: Legal | null;
  deadline: number | null; expiresAt: number;
};
export type Command =
  | { type: "start" | "next"; revision: number }
  | { type: "action"; revision: number; action: Action };
export type ClientMessage = Command | { type: "join"; name: string; token: string };
export type ServerMessage = RoomView | { type: "error"; message: string; code?: string };
