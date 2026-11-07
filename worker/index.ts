import { DurableObject } from "cloudflare:workers";
import { Room, validateOptions, type SavedRoom } from "./room";
import type { ClientMessage } from "../src/online/protocol";
interface Env { ROOMS: DurableObjectNamespace<PokerRoom>; ALLOWED_ORIGINS: string }
type Attachment = { seat: number; created: number; bucket: number; count: number };
const json = (value: unknown, status = 200) => Response.json(value, { status });
function allowed(request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  return !!origin && env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).includes(origin);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true });
    if (!allowed(request, env)) return json({ error: "このサイトからの接続は許可されていません。" }, 403);
    const cors = { "Access-Control-Allow-Origin": request.headers.get("Origin")!, "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      let response: Response;
      if (url.pathname === "/rooms" && request.method === "POST") {
        if ((request.headers.get("Content-Length") && Number(request.headers.get("Content-Length")) > 2048)) throw new Error("リクエストが大きすぎます。");
        const text = await request.text();
        if (text.length > 2048) throw new Error("リクエストが大きすぎます。");
        const options = validateOptions(JSON.parse(text));
        const id = env.ROOMS.newUniqueId();
        response = await env.ROOMS.get(id).fetch(new Request("https://room/initialize", { method: "POST", body: JSON.stringify(options) }));
        if (response.ok) response = json({ room: id.toString() }, 201);
      } else {
        const match = url.pathname.match(/^\/rooms\/([a-f0-9]{64})\/ws$/);
        if (!match || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") response = json({ error: "部屋が見つかりません。" }, 404);
        else return env.ROOMS.get(env.ROOMS.idFromString(match[1])).fetch(request);
      }
      return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...cors } });
    } catch {
      return new Response(JSON.stringify({ error: "部屋を作成できませんでした。設定を確認してください。" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
  },
} satisfies ExportedHandler<Env>;

export class PokerRoom extends DurableObject<Env> {
  private room: Room | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<SavedRoom>("room");
      if (saved) {
        this.room = new Room(saved.options, Date.now(), saved);
        saved.members.forEach(m => { m.connected = false; });
        for (const ws of ctx.getWebSockets()) {
          const attachment = ws.deserializeAttachment() as Attachment;
          if (attachment.seat >= 0 && saved.members[attachment.seat]) saved.members[attachment.seat].connected = true;
        }
      }
    });
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => {});
    return next;
  }
  async fetch(request: Request): Promise<Response> {
    return this.serial(async () => {
      if (new URL(request.url).pathname === "/initialize" && request.method === "POST") {
        if (this.room) return json({ error: "作成済みです。" }, 409);
        this.room = new Room(validateOptions(await request.json()));
        await this.persist();
        return json({ ok: true });
      }
      if (!this.room || Date.now() >= this.room.data.expiresAt) return json({ error: "部屋が存在しないか有効期限切れです。" }, 404);
      if (this.ctx.getWebSockets().length >= 12) return json({ error: "接続が多すぎます。少し待って再接続してください。" }, 429);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ seat: -1, created: Date.now(), bucket: 0, count: 0 } satisfies Attachment);
      await this.setAlarm();
      return new Response(null, { status: 101, webSocket: client });
    });
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    await this.serial(async () => {
      try {
        if (!this.room || typeof raw !== "string" || raw.length > 2048) throw new Error("不正な通信です。");
        this.room.checkExpiry(Date.now());
        const attachment = ws.deserializeAttachment() as Attachment;
        const bucket = Math.floor(Date.now() / 1000);
        attachment.count = attachment.bucket === bucket ? attachment.count + 1 : 1;
        attachment.bucket = bucket;
        ws.serializeAttachment(attachment);
        if (attachment.count > 15) throw new Error("操作が多すぎます。少し待ってください。");
        const message = JSON.parse(raw) as ClientMessage;
        if (attachment.seat < 0) {
          if (message.type !== "join" || !/^[a-f0-9]{64}$/.test(message.token)) throw new Error("入室情報が正しくありません。");
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message.token));
          const hash = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, "0")).join("");
          attachment.seat = this.room.join(message.name, hash);
          // A reconnect replaces the previous connection for the same seat.
          for (const other of this.ctx.getWebSockets()) {
            if (other !== ws && (other.deserializeAttachment() as Attachment).seat === attachment.seat) {
              const old = other.deserializeAttachment() as Attachment;
              other.serializeAttachment({ ...old, seat: -2 });
              other.close(4001, "別の画面で再接続しました。");
            }
          }
          ws.serializeAttachment(attachment);
        } else if (attachment.seat >= 0 && message.type !== "join") {
          // Process an overdue turn first. A late action cannot beat the timeout.
          if (this.room.timeout()) { await this.persist(); this.broadcast(); }
          this.room.command(attachment.seat, message);
        } else throw new Error("再接続してください。");
        await this.persist();
        this.broadcast();
      } catch (error) {
        const attachment = ws.deserializeAttachment() as Attachment;
        ws.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "通信エラーです。" }));
        if (attachment.seat >= 0 && this.room) {
          ws.send(JSON.stringify(this.room.view(attachment.seat)));
        } else ws.close(4003, "入室できませんでした。");
      }
    });
  }
  async webSocketClose(ws: WebSocket) { ws.close(1000, "接続を終了しました。"); await this.closed(ws); }
  async webSocketError(ws: WebSocket) { ws.close(1011, "通信エラー"); await this.closed(ws); }
  private async closed(ws: WebSocket) {
    await this.serial(async () => {
      const attachment = ws.deserializeAttachment() as Attachment;
      if (!this.room || attachment.seat < 0) return;
      ws.serializeAttachment({ ...attachment, seat: -2 });
      this.room.disconnect(attachment.seat);
      await this.persist();
      this.broadcast();
    });
  }
  private broadcast() {
    if (!this.room) return;
    for (const ws of this.ctx.getWebSockets()) {
      const { seat } = ws.deserializeAttachment() as Attachment;
      if (seat >= 0) {
        try { ws.send(JSON.stringify(this.room.view(seat))); } catch { /* Close callback updates presence. */ }
      }
    }
  }
  private async persist() {
    if (!this.room) return;
    await this.ctx.storage.put("room", this.room.data);
    await this.setAlarm();
  }
  private async setAlarm() {
    if (!this.room) return;
    const times = [this.room.data.expiresAt, this.room.data.deadline ?? Infinity];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (a.seat === -1) times.push(a.created + 10000);
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...times)));
  }
  async alarm() {
    await this.serial(async () => {
      if (!this.room) return;
      if (Date.now() >= this.room.data.expiresAt) {
        for (const ws of this.ctx.getWebSockets()) ws.close(4004, "部屋の有効期限が切れました。");
        this.room = null;
        await this.ctx.storage.deleteAll();
        return;
      }
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Attachment;
        if (a.seat === -1 && Date.now() >= a.created + 10000) {
          ws.serializeAttachment({ ...a, seat: -2 });
          ws.close(4003, "入室タイムアウト");
        }
      }
      this.room.timeout();
      // Empty rooms stop taking actions; the last state remains resumable.
      await this.persist();
      this.broadcast();
    });
  }
}
