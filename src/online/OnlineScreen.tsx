import { useEffect, useRef, useState } from "react";
import { cardText, suit } from "../game/cards";
import { betSizing } from "../game/betSizing";
import { modeNames, type Command, type Mode, type RoomOptions, type RoomView, type ServerMessage } from "./protocol";
import "./online.css";
const initialRoom = () => new URLSearchParams(location.hash.slice(1)).get("room") ?? "";
const configured = import.meta.env.VITE_ONLINE_SERVER_URL as string | undefined;
const server = (configured || (["localhost", "127.0.0.1"].includes(location.hostname) ? "http://127.0.0.1:8787" : "")).replace(/\/$/, "");
const fmt = (n: number) => n.toLocaleString("en-US");
function roomCode(value: string) {
  try { value = new URLSearchParams(new URL(value).hash.slice(1)).get("room") ?? ""; } catch { /* A room code can be pasted directly. */ }
  if (!/^[a-f0-9]{64}$/.test(value.trim())) throw new Error("招待URLまたは部屋コードを確認してください。");
  return value.trim();
}
function tokenFor(room: string) {
  const key = `poker-online:${server}:${room}`;
  try { const existing = sessionStorage.getItem(key); if (existing) return existing; } catch {}
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
  // A same-tab reload restores the seat without putting its credential in the URL.
  sessionStorage.setItem(key, token);
  return token;
}
function Card({ value }: { value: number | null }) {
  return <span className={`online-card ${value === null ? "online-card-back" : `suit${suit(value)}`}`} aria-label={value === null ? "伏せカード" : cardText(value)}>
    {value === null ? "♠" : cardText(value)}
  </span>;
}
export function OnlineScreen({ onExit }: { onExit: () => void }) {
  const [room, setRoom] = useState("");
  const [joinCode, setJoinCode] = useState(initialRoom);
  const [name, setName] = useState("");
  const [options, setOptions] = useState<RoomOptions>({ mode: "holdem", stack: 10000, ante: 100 });
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState("未接続");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(100);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [reconnect, setReconnect] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const creation = useRef<AbortController | null>(null);
  useEffect(() => () => creation.current?.abort(), []);
  const identity = useRef({ name: "", token: "" });
  const pendingRevision = useRef<number | null>(null);
  const invite = room ? `${location.origin}${location.pathname}#room=${room}` : "";
  useEffect(() => {
    const code = initialRoom();
    if (!/^[a-f0-9]{64}$/.test(code)) return;
    try {
      const token = sessionStorage.getItem(`poker-online:${server}:${code}`);
      if (token && /^[a-f0-9]{64}$/.test(token)) {
        identity.current = { name: "復帰", token };
        setRoom(code);
      }
    } catch { /* Guests can still join manually if storage is unavailable. */ }
  }, []);
  useEffect(() => {
    if (!room) return;
    let cancelled = false, attempt = 0;
    let retry: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    function connect() {
      setStatus(attempt ? "再接続中…" : "接続中…");
      const url = new URL(`${server}/rooms/${room}/ws`);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        setError("");
        ws.send(JSON.stringify({ type: "join", ...identity.current }));
        let lastPong = Date.now();
        heartbeat = setInterval(() => {
          if (Date.now() - lastPong > 60000) { ws.close(); return; }
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 20000);
        ws.addEventListener("message", event => { if (event.data === "pong") lastPong = Date.now(); });
      };
      ws.onmessage = event => {
        if (cancelled) return;
        if (event.data === "pong") return;
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.type === "error") { setError(message.message); pendingRevision.current = null; setBusy(false); return; }
        setView(message); setConnected(true); setStatus("接続済み"); attempt = 0;
        pendingRevision.current = null; setBusy(false);
      };
      ws.onclose = event => {
        clearInterval(heartbeat);
        if (cancelled) return;
        setConnected(false); setBusy(false); pendingRevision.current = null;
        if ([4001, 4003, 4004].includes(event.code)) {
          setStatus("接続終了");
          setError(previous => previous || event.reason || "部屋へ入れませんでした。招待URLを確認してください。");
          return;
        }
        if (attempt >= 5) { setStatus("接続できません"); return; }
        setStatus("接続が切れました。再接続しています…");
        retry = setTimeout(connect, Math.min(10000, 1000 * 2 ** Math.min(attempt++, 4)));
      };
      ws.onerror = () => setError("接続を確認しています。サーバーが利用できない場合は、少し待って再接続してください。");
    }
    connect();
    return () => { cancelled = true; clearTimeout(retry); clearInterval(heartbeat); socket.current?.close(); socket.current = null; };
  }, [room, reconnect]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (view?.legal) setAmount(betSizing(view.legal).min); }, [view?.revision]);
  function enter(code: string) {
    if (!name.trim()) throw new Error("表示名を入力してください。");
    identity.current = { name: name.trim(), token: tokenFor(code) };
    setError(""); setView(null); setRoom(code);
    history.replaceState(null, "", `${location.pathname}#room=${code}`);
  }
  async function createRoom() {
    const controller = new AbortController();
    creation.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      if (!name.trim()) throw new Error("表示名を入力してください。");
      setBusy(true); setError("");
      const response = await fetch(`${server}/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "部屋を作成できませんでした。");
      if (!controller.signal.aborted) enter(data.room);
    } catch (e) { setError(e instanceof Error ? e.message : "通信エラーです。"); }
    finally { clearTimeout(timer); creation.current = null; setBusy(false); }
  }
  function send(command: Command) {
    if (!connected || socket.current?.readyState !== WebSocket.OPEN || pendingRevision.current !== null) return;
    pendingRevision.current = command.revision;
    setBusy(true); setError("");
    socket.current.send(JSON.stringify(command));
  }
  function leave() {
    setRoom(""); setView(null); setConnected(false);
    history.replaceState(null, "", location.pathname);
    onExit();
  }
  const game = view?.game;
  const sizing = view?.legal ? betSizing(view.legal) : null;
  const unavailable = !connected || busy;
  return <main className="online-screen">
    <header className="online-header"><h1>POKER <small>WITH FRIENDS</small></h1><button onClick={leave}>タイトルへ</button></header>
    {!room ? <>
      <h2>友達とオンライン対戦</h2>
      <p>招待した友達と2〜6人でプレイ。全員が入室してからホストが開始します。</p>
      {!server && <p role="status">オンライン対戦は準備中です。CPU戦はタイトル画面から遊べます。</p>}
      <label>表示名<input maxLength={20} value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" /></label>
      <div className="online-entry-grid">
        <section><h3>部屋を作る</h3>
          <label>ゲーム<select value={options.mode} onChange={e => setOptions({ ...options, mode: e.target.value as Mode })}>
            {Object.entries(modeNames).map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
          </select></label>
          <label>初期チップ<input type="number" min={100} max={10000000} value={options.stack} onChange={e => setOptions({ ...options, stack: +e.target.value })} /></label>
          <label>{options.mode === "plo5" ? "アンティ" : "ビッグブラインド"}<input type="number" min={1} max={options.stack} value={options.ante} onChange={e => setOptions({ ...options, ante: +e.target.value })} /></label>
          <button className="primary" disabled={!server || busy} onClick={createRoom}>招待部屋を作成</button>
        </section>
        <section><h3>招待された部屋へ</h3>
          <label>招待URL・部屋コード<input value={joinCode} onChange={e => setJoinCode(e.target.value)} /></label>
          <button className="primary" disabled={!server || busy} onClick={() => { try { enter(roomCode(joinCode)); } catch (e) { setError((e as Error).message); } }}>入室する</button>
          <p>登録不要。同じブラウザのタブで再接続すると自分の席に戻れます。部屋は作成から24時間で終了します。</p>
        </section>
      </div>
    </> : <>
      {status === "接続できません" && <button onClick={() => setReconnect(n => n + 1)}>再接続する</button>}
      <div className="online-connection" role="status">{status}{game && <span> · {modeNames[view!.options.mode]} · HAND #{game.hand}</span>}</div>
      <label>友達への招待URL<input readOnly value={invite} onFocus={e => e.target.select()} /></label>
      <button onClick={async () => { try { await navigator.clipboard.writeText(invite); setCopied(true); } catch { setError("招待URLを選択してコピーしてください。"); } }}>{copied ? "コピーしました" : "招待URLをコピー"}</button>
      {view && <>
        <ul className="online-members">{view.members.map(m => <li key={m.seat}>{m.name}{m.seat === view.you ? "（あなた）" : ""}{m.seat === view.host ? " · ホスト" : ""}<span>{m.connected ? "接続中" : "切断中"}</span></li>)}</ul>
        {!game ? <section className="online-lobby"><h2>待合室 · {view.members.length}/6人</h2>
          <p>{modeNames[view.options.mode]} · 初期 {fmt(view.options.stack)} · {view.options.mode === "plo5" ? "アンティ" : "BB"} {fmt(view.options.ante)}</p>
          {view.host === view.you ? <button className="primary" disabled={unavailable || view.members.length < 2 || view.members.some(m => !m.connected)} onClick={() => send({ type: "start", revision: view.revision })}>全員で対戦開始</button> : <p>ホストの開始を待っています。</p>}
          <p>途中の新規入室はできません。切断した人は同じタブで復帰できます。参加者を変える場合は新しい部屋を作成してください。</p>
        </section> : <>
          <section className="online-table" aria-label="オンライン対戦テーブル">
            <div className="online-pot">{game.done ? "ハンド終了" : game.boards[0].length === 0 ? "PREFLOP" : ["FLOP", "TURN", "RIVER"][game.street]} · POT {fmt(game.players.reduce((sum, p) => sum + p.total, 0))}</div>
            {game.boards.map((board, i) => <div className="online-board" key={i}><b>BOARD {"AB"[i]}</b><div>{Array.from({ length: 5 }, (_, n) => <Card key={n} value={board[n] ?? null} />)}</div></div>)}
            <div className="online-seats">{game.players.map(p => <section key={p.id} className={`online-seat${p.id === view.you ? " online-you" : ""}${p.id === game.actor ? " online-actor" : ""}`} aria-label={`${p.name}の席`}>
              <h3>{p.name}{p.id === view.you ? "（あなた）" : ""}{p.id === game.dealer ? " · D" : ""}</h3>
              <strong>{fmt(p.stack)} CHIPS</strong><small>{p.folded ? "FOLD" : p.stack === 0 && !game.done ? "ALL-IN" : p.last}{!game.done && p.bet > 0 ? ` · BET ${fmt(p.bet)}` : ""}</small>
              <div className="online-hole">{p.hole.map((card, i) => <Card value={card} key={i} />)}</div>
              {game.done && game.payouts[p.id] > 0 && <p>獲得 +{fmt(game.payouts[p.id])}</p>}
            </section>)}</div>
          </section>
          <section className="online-actions">
            {game.done ? <>
              <h2>{game.players[view.you].stack === 0 ? "You lose..." : "ハンド結果"}</h2>
              {game.results.map((r, i) => <p key={i}>BOARD {"AB"[r.board]} · {r.winners.map(id => game.players[id].name).join(" / ")} · {r.label} · {fmt(r.amount)}</p>)}
              {!game.results.length && <p>全員フォールドにより決着しました。</p>}
              {game.players.filter(p => p.stack > 0).length < 2 ? <p>対戦終了です。新しい対戦はタイトルから部屋を作成してください。</p> : view.host === view.you ? <button className="primary" disabled={unavailable} onClick={() => send({ type: "next", revision: view.revision })}>次のハンドへ</button> : <p>ホストが次のハンドに進めます。</p>}
            </> : <>
              <h2>{game.actor === view.you ? "あなたの番" : `${game.players[game.actor].name} の番`}</h2>
              <p>残り {Math.max(0, Math.ceil(((view.deadline ?? now) - now) / 1000))} 秒 · 時間切れはチェック、またはフォールド</p>
              {view.legal && <div className="online-action-buttons">
                {view.legal.canFold && <button disabled={unavailable} onClick={() => send({ type: "action", revision: view.revision, action: { type: "fold" } })}>Fold</button>}
                <button disabled={unavailable} onClick={() => send({ type: "action", revision: view.revision, action: { type: view.legal!.canCheck ? "check" : "call" } })}>{view.legal.canCheck ? "Check" : `Call ${fmt(view.legal.call)}`}</button>
                {sizing?.canRaise && <>
                  <label>合計ベット額<input type="number" min={sizing.min} max={sizing.max} step={100} value={amount} onChange={e => setAmount(+e.target.value)} /></label>
                  <button className="primary" disabled={unavailable} onClick={() => send({ type: "action", revision: view.revision, action: { type: "raise", to: sizing.normalize(amount) } })}>Bet / Raise {fmt(sizing.normalize(amount))}</button>
                </>}
              </div>}
            </>}
          </section>
        </>}
      </>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    <footer>プレイチップ専用 · 対戦のチップ・記録はCPU戦と別管理です。</footer>
  </main>;
}
