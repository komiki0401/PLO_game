import type { Settings, State } from "../game/engine";
export type ScoreStatus = "playing" | "bust" | "winner" | "interrupted";
export type ScoreRecord = {
  id: string;
  startedAt: string;
  updatedAt: string;
  initialStack: number;
  finalStack: number;
  peakStack: number;
  net: number;
  hands: number;
  scoops: number;
  players: number;
  ante: number;
  difficulty: Settings["difficulty"];
  status: ScoreStatus;
};
export const SCORE_KEY = "plo-scores-v1";
export function newScore(
  settings: Settings,
  id:string = crypto.randomUUID(),
  now = new Date().toISOString(),
): ScoreRecord {
  return {
    id,
    startedAt: now,
    updatedAt: now,
    initialStack: settings.stack,
    finalStack: settings.stack,
    peakStack: settings.stack,
    net: 0,
    hands: 0,
    scoops: 0,
    players: settings.count,
    ante: settings.ante,
    difficulty: settings.difficulty,
    status: "playing",
  };
}
export function recordCompletedHand(
  previous: ScoreRecord,
  game: State,
  now = new Date().toISOString(),
): ScoreRecord {
  if (!game.done) throw new Error("Only settled hands can be recorded");
  if (previous.hands >= game.hand) return previous;
  const stack = game.players[0].stack;
  const scoop =
    game.awards.length > 0 &&
    game.awards.every((a) => a.winners.length === 1 && a.winners[0] === 0);
  return {
    ...previous,
    updatedAt: now,
    finalStack: stack,
    peakStack: Math.max(previous.peakStack, stack),
    net: stack - previous.initialStack,
    hands: previous.hands + 1,
    scoops: previous.scoops + (scoop ? 1 : 0),
    status:
      stack === 0
        ? "bust"
        : game.players.filter((p) => p.stack > 0).length < 2
          ? "winner"
          : "playing",
  };
}
export function upsertScore(records: ScoreRecord[], record: ScoreRecord) {
  return [record, ...records.filter((r) => r.id !== record.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 50);
}
function valid(record: unknown): record is ScoreRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as ScoreRecord;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.startedAt === "string" &&
    typeof r.updatedAt === "string" &&
    Number.isFinite(Date.parse(r.startedAt)) &&
    Number.isFinite(Date.parse(r.updatedAt)) &&
    [
      r.initialStack,
      r.finalStack,
      r.peakStack,
      r.hands,
      r.scoops,
      r.players,
      r.ante,
    ].every((n) => Number.isSafeInteger(n) && n >= 0) &&
    r.initialStack > 0 &&
    r.players >= 2 &&
    r.players <= 6 &&
    r.ante > 0 &&
    r.peakStack >= Math.max(r.initialStack, r.finalStack) &&
    r.scoops <= r.hands &&
    r.net === r.finalStack - r.initialStack &&
    ["EASY", "NORMAL", "HARD"].includes(r.difficulty) &&
    ["playing", "bust", "winner", "interrupted"].includes(r.status)
  );
}
export function readScores(
  storage: Pick<Storage, "getItem"> = localStorage,
): ScoreRecord[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SCORE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(valid)
      .slice(0, 50)
      .map((r) => ({
        ...r,
        status: r.status === "playing" ? "interrupted" : r.status,
      }));
  } catch {
    return [];
  }
}
export function writeScores(
  records: ScoreRecord[],
  storage: Pick<Storage, "setItem"> = localStorage,
): boolean {
  try {
    storage.setItem(SCORE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
