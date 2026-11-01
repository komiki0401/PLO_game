import { useEffect, useMemo, useRef, useState } from "react";
import {
  create,
  act,
  nextHand,
  legal,
  defaults,
  type State,
  type Settings,
} from "./game/engine";
import { cpu } from "./game/cpu";
import { cardText, suit, type Card } from "./game/cards";
import { names } from "./game/evaluate";
import type { Action } from "./game/betting";
import { TableAudio } from "./audio/tableAudio";
import { ChipStacks, ChipLegend } from "./components/ChipStacks";
import { HomeScreen } from "./components/HomeScreen";
import { AllInCutIn, useAllInCutIn } from "./components/AllInCutIn";
import { ScoopCelebration } from "./components/ScoopCelebration";
import { actionAnnouncement } from "./audio/actionAnnouncement";
import {
  newScore,
  recordCompletedHand,
  readScores,
  writeScores,
  upsertScore,
  type ScoreRecord,
} from "./records/scores";
const fmt = (n: number) => n.toLocaleString("en-US");
const positions: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 5],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};
const loadSettings = (): Settings => {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("plo-settings") || "{}"),
    };
  } catch {
    return defaults;
  }
};
function PlayingCard({
  card,
  back = false,
  lit = false,
  small = false,
}: {
  card?: Card;
  back?: boolean;
  lit?: boolean;
  small?: boolean;
}) {
  if (card === undefined && !back)
    return <div className={`card empty ${small ? "small" : ""}`} />;
  return (
    <div
      className={`card ${small ? "small" : ""} ${back ? "back" : `suit${suit(card!)}`} ${lit ? "lit" : ""}`}
      aria-label={back ? "伏せカード" : cardText(card!)}
    >
      {!back && (
        <>
          <b>{cardText(card!)[0]}</b>
          <span>{"♠♥♣♦"[suit(card!)]}</span>
        </>
      )}
    </div>
  );
}
function readStats() {
  try {
    const value = JSON.parse(localStorage.getItem("plo-stats") || "null");
    if (
      value &&
      Number.isSafeInteger(value.hands) &&
      value.hands >= 0 &&
      Number.isSafeInteger(value.scoops) &&
      value.scoops >= 0 &&
      value.scoops <= value.hands &&
      Number.isSafeInteger(value.net)
    )
      return value;
  } catch {}
  return { hands: 0, scoops: 0, net: 0 };
}
export default function App() {
  const [screen, setScreen] = useState<"home" | "table">("home");
  const [scores, setScores] = useState(readScores),
    [storageError, setStorageError] = useState(false);
  const scoreList = useRef(scores),
    activeScore = useRef<ScoreRecord | null>(null);
  const [lastResult, setLastResult] = useState<ScoreRecord | null>(
    () => scores[0] ?? null,
  );
  const [settings, setSettings] = useState(loadSettings),
    [game, setGame] = useState(() => create(settings));
  const [config, setConfig] = useState(false),
    [rules, setRules] = useState(false),
    [draft, setDraft] = useState(settings),
    [amount, setAmount] = useState(settings.ante),
    [boardFocus, setBoardFocus] = useState(0);
  const [history, setHistory] = useState<State[]>([]),
    [replay, setReplay] = useState<State | null>(null),
    [replaySequence, setReplaySequence] = useState<State[]>([]),
    [replayStep, setReplayStep] = useState(0),
    [stats, setStats] = useState(readStats),
    [error, setError] = useState("");
  const timeline = useRef<State[]>([]),
    replays = useRef(new WeakMap<State, State[]>());
  const recorded = useRef<State | null>(null),
    before = useRef(settings.stack);
  const voicePlayer = useRef<HTMLAudioElement | null>(null),
    tableAudio = useRef<TableAudio | null>(null),
    previousAudioGame = useRef<State | null>(null);
  const allIn = useAllInCutIn(tableAudio);
  function showAnteAllIns(
    players: { name: string; stack: number }[],
    ante: number,
    ready: Promise<unknown> = Promise.resolve(),
  ) {
    const active = players.filter((p) => p.stack > 0),
      forced = active.filter((p) => p.stack <= ante);
    if (forced.length)
      allIn.show(
        forced.length === active.length
          ? "全員"
          : forced.map((p) => p.name).join(" / "),
        forced.reduce((sum, p) => sum + p.stack, 0),
        ready,
      );
  }
  const [audioReady, setAudioReady] = useState(false),
    [audioError, setAudioError] = useState("");
  useEffect(() => {
    if (!voicePlayer.current) return;
    const controller = new TableAudio(voicePlayer.current, () => {
      setAudioReady(false);
      setAudioError(
        "音声を再生できません。音声ボタンを押して再開してください。",
      );
    });
    tableAudio.current = controller;
    const hide = () => {
      if (document.hidden) controller.stopVoice();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      controller.dispose();
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  useEffect(() => {
    tableAudio.current?.configure(settings);
  }, [settings.sound, settings.voice, settings.volume]);
  function unlockAudio(force = false) {
    if (!force && !settings.sound && !settings.voice) return;
    void tableAudio.current?.unlock().then((ok) => {
      if (ok) {
        setAudioReady(true);
        setAudioError("");
      }
    });
  }
  function enableAudio() {
    const updated = {
      ...settings,
      sound: true,
      voice: true,
      volume: settings.volume || 0.65,
    };
    setSettings(updated);
    try {
      localStorage.setItem("plo-settings", JSON.stringify(updated));
    } catch {}
    tableAudio.current?.configure(updated);
    void tableAudio.current?.unlock().then((ok) => {
      if (ok) {
        setAudioReady(true);
        setAudioError("");
        tableAudio.current?.cue("check");
      }
    });
  }
  function muteAudio() {
    const updated = { ...settings, sound: false, voice: false };
    setSettings(updated);
    tableAudio.current?.configure(updated);
    try {
      localStorage.setItem("plo-settings", JSON.stringify(updated));
    } catch {}
  }
  function commitAction(state: State, a: Action) {
    const next = act(state, a);
    const announcement = actionAnnouncement(state, a);
    if (announcement === "allin")
      allIn.show(
        state.players[state.actor].name,
        state.players[state.actor].stack,
      );
    else if (announcement)
      void tableAudio.current?.announceAction(announcement);
    setGame(next);
  }
  function dispatch(a: Action) {
    try {
      if (game.done || game.actor !== 0 || allIn.cutIn) return;
      commitAction(game, a);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (screen !== "table" || game.done || game.actor === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void Promise.all([
        tableAudio.current?.whenIdle() ?? Promise.resolve(),
        allIn.gate.current,
      ]).then(() => {
        if (cancelled) return;
        try {
          commitAction(game, cpu(game));
        } catch (e) {
          setError(`CPU: ${(e as Error).message}`);
        }
      });
    }, 650 / settings.speed);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [game, settings.speed, screen]);
  useEffect(() => {
    if (screen !== "table") return;
    if (timeline.current.at(-1) !== game) {
      if (timeline.current.at(-1)?.hand !== game.hand) timeline.current = [];
      timeline.current.push(game);
    }
    if (!game.done || recorded.current === game) return;
    replays.current.set(game, [...timeline.current]);
    recorded.current = game;
    if (activeScore.current) {
      activeScore.current = recordCompletedHand(activeScore.current, game);
      persistScore(activeScore.current);
    }
    setHistory((h) => [game, ...h].slice(0, 30));
    const scoop =
      game.awards.length > 0 &&
      game.awards.every((a) => a.winners.length === 1 && a.winners[0] === 0);
    setStats((s: { hands: number; scoops: number; net: number }) => {
      const n = {
        hands: s.hands + 1,
        scoops: s.scoops + (scoop ? 1 : 0),
        net: s.net + game.players[0].stack - before.current,
      };
      try {
        localStorage.setItem("plo-stats", JSON.stringify(n));
      } catch {
        /* Session scores report their own save status. */
      }
      return n;
    });
  }, [game, screen]);
  useEffect(() => {
    if (screen !== "table") {
      previousAudioGame.current = null;
      return;
    }
    const previous = previousAudioGame.current;
    previousAudioGame.current = game;
    if (
      !previous ||
      game.players.length !== previous.players.length ||
      game.initialTotal !== previous.initialTotal ||
      game.hand !== previous.hand ||
      (previous.done && !game.done)
    ) {
      tableAudio.current?.cue("deal");
      return;
    }
    if (previous === game) return;
    if (game.boards[0].length !== previous.boards[0].length)
      tableAudio.current?.cue("board");
    else if (previous.actor >= 0) {
      const p = game.players[previous.actor],
        before = previous.players[previous.actor];
      tableAudio.current?.cue(
        p.folded && !before.folded
          ? "fold"
          : p.total > before.total
            ? "chips"
            : "check",
      );
    }
    if (game.done && !game.awards.length) tableAudio.current?.cue("win");
  }, [game, screen]);
  const view = replay ?? game,
    pot = view.players.reduce((n, p) => n + p.total, 0),
    humanTurn = screen === "table" && !replay && !game.done && game.actor === 0;
  const l = legal(game, 0),
    raiseAmount = Math.max(l.min, Math.min(l.max, amount));
  const sole = view.awards[0]?.winners[0],
    scoop =
      view.awards.length > 0 &&
      view.awards.every((a) => a.winners.length === 1 && a.winners[0] === sole);
  const steps = useMemo(
    () =>
      view.done
        ? [...view.awards]
            .sort((a, b) => a.board - b.board || a.pot - b.pot)
            .flatMap((award) =>
              award.winners.map((winner) => ({
                award,
                winner,
                hand: award.hands[winner],
              })),
            )
        : [],
    [view],
  );
  const [presentation, setPresentation] = useState<{
    view: State | null;
    index: number;
    complete: boolean;
  }>({ view: null, index: 0, complete: false });
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const spokenBoards = useRef(new WeakMap<State, Set<number>>());
  const celebrated = useRef(new WeakSet<State>());
  const [celebration, setCelebration] = useState<State | null>(null);
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 2800);
    return () => clearTimeout(timer);
  }, [celebration]);
  useEffect(() => {
    setSelectedStep(null);
    if (screen !== "table" || !steps.length) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function show(index: number) {
      setPresentation({ view, index, complete: false });
      tableAudio.current?.cue("reveal");
      const board = steps[index].award.board;
      const spoken = spokenBoards.current.get(view) ?? new Set<number>();
      spokenBoards.current.set(view, spoken);
      const shouldSpeak = !replay && !spoken.has(board);
      if (shouldSpeak) spoken.add(board);
      const voice = shouldSpeak
        ? (tableAudio.current?.announce(board, steps[index].hand.category) ??
          Promise.resolve())
        : Promise.resolve();
      const pause = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(1600, 2600 / settings.speed));
      });
      void Promise.all([voice, pause]).then(() => {
        if (cancelled) return;
        if (index + 1 < steps.length) show(index + 1);
        else {
          setPresentation({ view, index, complete: true });
          tableAudio.current?.cue(scoop ? "scoop" : "win");
          if (scoop && !replay && !celebrated.current.has(view)) {
            celebrated.current.add(view);
            setCelebration(view);
          }
        }
      });
    }
    void allIn.gate.current.then(() => {
      if (!cancelled) show(0);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (!allIn.active.current) tableAudio.current?.stopVoice();
    };
  }, [view, steps, settings.speed, screen]);
  const presentationIndex = presentation.view === view ? presentation.index : 0;
  const showdownComplete =
    !steps.length || (presentation.view === view && presentation.complete);
  const activeStep =
    steps[
      showdownComplete ? (selectedStep ?? presentationIndex) : presentationIndex
    ];
  const activeBoard = activeStep?.award.board ?? boardFocus;
  const highlighted = new Set(activeStep?.hand.cards ?? []);
  const sessionOver = game.players.filter((p) => p.stack > 0).length < 2;
  const gameOver = game.done && (game.players[0].stack === 0 || sessionOver);
  useEffect(() => {
    if (screen !== "table" || replay || !gameOver || !showdownComplete) return;
    const timer = setTimeout(returnHome, 3000);
    return () => clearTimeout(timer);
  }, [screen, game, replay, gameOver, showdownComplete]);
  function persistScore(record: ScoreRecord) {
    const updated = upsertScore(scoreList.current, record);
    scoreList.current = updated;
    setScores(updated);
    setStorageError(!writeScores(updated));
  }
  function finishSession() {
    if (!activeScore.current) return;
    const record = {
      ...activeScore.current,
      updatedAt: new Date().toISOString(),
      status:
        activeScore.current.status === "playing"
          ? ("interrupted" as const)
          : activeScore.current.status,
    };
    persistScore(record);
    setLastResult(record);
    activeScore.current = null;
  }
  function returnHome() {
    finishSession();
    allIn.clear();
    tableAudio.current?.stopVoice();
    setScreen("home");
    setConfig(false);
    setRules(false);
    setReplay(null);
    setError("");
    window.scrollTo(0, 0);
  }
  function startSession(selected: Settings) {
    try {
      const fresh = create(selected);
      finishSession();
      activeScore.current = newScore(selected);
      previousAudioGame.current = null;
      recorded.current = null;
      allIn.clear();
      tableAudio.current?.stopVoice();
      tableAudio.current?.configure(selected);
      setSettings(selected);
      setDraft(selected);
      setGame(fresh);
      before.current = selected.stack;
      try {
        localStorage.setItem("plo-settings", JSON.stringify(selected));
      } catch {}
      setConfig(false);
      setRules(false);
      setReplay(null);
      timeline.current = [];
      setHistory([]);
      setLastResult(null);
      setError("");
      setScreen("table");
      window.scrollTo(0, 0);
      const ready =
        selected.sound || selected.voice
          ? (tableAudio.current?.unlock() ?? Promise.resolve(false))
          : Promise.resolve(false);
      void ready.then((ok) => {
        if (ok) {
          setAudioReady(true);
          setAudioError("");
          tableAudio.current?.cue("deal");
        }
      });
      showAnteAllIns(
        fresh.players.map((p) => ({ name: p.name, stack: selected.stack })),
        selected.ante,
        ready,
      );
    } catch {
      setError("人数・スタック・アンティを確認してください。");
    }
  }
  function next() {
    try {
      const fresh = nextHand(game);
      before.current = game.players[0].stack;
      allIn.clear();
      tableAudio.current?.stopVoice();
      showAnteAllIns(game.players, game.settings.ante);
      setGame(fresh);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function save() {
    startSession(draft);
  }
  return (
    <>
      <audio
        className="voice-player"
        ref={voicePlayer}
        preload="auto"
        hidden
        aria-label="女性ボイス読み上げ"
      />
      {screen === "home" ? (
        <HomeScreen
          settings={settings}
          records={scores}
          lastResult={lastResult}
          onStart={startSession}
          error={error}
          storageError={storageError}
          totalHands={stats.hands}
        />
      ) : (
        <main
          className={
            [
              "table-screen",
              view.done && activeStep ? "showdown" : "",
              humanTurn ? "human-turn" : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onPointerDownCapture={() => unlockAudio()}
          onKeyDownCapture={() => unlockAudio()}
          style={
            { "--motion": `${0.5 / settings.speed}s` } as React.CSSProperties
          }
        >
          <div className="game-viewport">
            <header>
              <a
                className="brand"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  returnHome();
                }}
                aria-label="DOUBLE BOARD PLO5 ホーム"
              >
                <img
                  className="brand-logo"
                  src={`${import.meta.env.BASE_URL}branding/double-board-plo5-logo.webp`}
                  alt="DOUBLE BOARD PLO5"
                  width="1983"
                  height="793"
                  fetchPriority="high"
                />
              </a>
              <nav>
                <button aria-label="トップへ" onClick={returnHome}>
                  ⌂ <span>トップ</span>
                </button>
                <span className="play-money">
                  <i />
                  PLAY CHIPS ONLY
                </span>
                <button onClick={() => setRules(true)} aria-label="ルール">
                  ? <span>ルール</span>
                </button>
                <button
                  aria-label="設定"
                  onClick={() => {
                    setDraft(settings);
                    setConfig(true);
                  }}
                >
                  ⚙ <span>設定</span>
                </button>
              </nav>
            </header>
            <div className="table-toolbar">
              <div className="audio-bar">
                <span>TABLE AUDIO · SE ＆ 日本語女性ボイス</span>
                {!audioReady || (!settings.sound && !settings.voice) ? (
                  <button onClick={enableAudio}>🔊 音声を有効にする</button>
                ) : (
                  <button onClick={muteAudio}>🔇 ミュート</button>
                )}
                {audioError && <small role="status">{audioError}</small>}
              </div>
              <div className="session-bar">
                <div>
                  <span className="eyebrow">YOUR PRIVATE TABLE</span>
                  <h1>
                    Two boards. <em>Twice the possibility.</em>
                  </h1>
                </div>
                <div className="session-info">
                  <span>
                    HAND <b>#{view.hand.toString().padStart(3, "0")}</b>
                  </span>
                  <span>
                    ANTE <b>{fmt(view.settings.ante)}</b>
                  </span>
                  <span>
                    CPU <b>{view.settings.difficulty}</b>
                  </span>
                </div>
              </div>
            </div>
            <section className="arena" aria-label="ポーカーテーブル">
              <div className="table">
                <div className="rail-line" />
                <div className="felt-label">
                  DOUBLE BOARD <span>♠</span> PLO5
                </div>
                <div className="table-meta">
                  BOMB POT · POT LIMIT · {view.players.length} PLAYERS
                </div>
                <div className="center-game">
                  <div className="pot">
                    <small>{view.done ? "TOTAL POT" : "IN THE MIDDLE"}</small>
                    <strong>
                      <span className="chip-icon">◉</span> {fmt(pot)}
                    </strong>
                    <span className="street">
                      {view.done
                        ? "HAND COMPLETE"
                        : ["FLOP", "TURN", "RIVER"][view.street]}
                    </span>
                  </div>
                  {view.boards.map((board, b) => (
                    <div
                      className={`board-row ${activeBoard === b ? "focused" : ""}`}
                      key={b}
                    >
                      <button
                        className="board-label"
                        disabled={view.done && !showdownComplete}
                        onClick={() => {
                          setBoardFocus(b);
                          const i = steps.findIndex(
                            (step) => step.award.board === b,
                          );
                          if (i >= 0) {
                            setSelectedStep(i);
                          }
                        }}
                        aria-pressed={activeBoard === b}
                      >
                        <span>BOARD</span>
                        <b>{"AB"[b]}</b>
                        <small>
                          {fmt(
                            b === 0 ? Math.ceil(pot / 2) : Math.floor(pot / 2),
                          )}
                        </small>
                      </button>
                      <div className="board-cards">
                        {Array.from({ length: 5 }, (_, i) => (
                          <PlayingCard
                            key={`${view.hand}-${b}-${i}-${board[i] ?? "empty"}`}
                            card={board[i]}
                            lit={
                              view.done &&
                              activeBoard === b &&
                              highlighted.has(board[i])
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {view.players.map((p, i) => {
                const shown = i === 0 || (view.done && !p.folded),
                  winning = showdownComplete && (view.payouts[p.id] ?? 0) > 0,
                  visibleStack =
                    p.stack -
                    (view.done && !showdownComplete
                      ? (view.payouts[p.id] ?? 0)
                      : 0);
                return (
                  <div
                    key={p.id}
                    className={`seat seat-${positions[view.players.length][i]} ${view.actor === i ? "active" : ""} ${p.folded ? "folded" : ""} ${i === 0 ? "human" : ""} ${winning ? "winner" : ""} ${!view.done && !p.folded && p.stack === 0 && p.hole.length ? "is-all-in" : ""} ${fmt(visibleStack).length > 7 ? "long-stack" : ""}`}
                  >
                    {i === 0 && humanTurn && (
                      <span className="your-turn-flag" role="status">
                        YOUR TURN · あなたの番
                      </span>
                    )}
                    <div className="seat-top">
                      <span className="seat-identity">
                        <span
                          className="character-portrait"
                          role="img"
                          aria-label={`${p.name} のキャラクターアイコン`}
                          data-character={p.id}
                          style={{
                            backgroundImage: `url(${import.meta.env.BASE_URL}characters/portraits.webp)`,
                            backgroundPosition: `${(p.id % 3) * 50}% ${Math.floor(p.id / 3) * 100}%`,
                          }}
                        />
                        <span className="avatar" aria-hidden="true">
                          {i === 0 ? "♠" : p.name[0]}
                        </span>
                      </span>
                      <div>
                        <b>
                          {p.name}
                          {i === 0 && <small> YOU</small>}
                        </b>
                        <strong>
                          {fmt(visibleStack)} <span>CHIPS</span>
                        </strong>
                      </div>
                      {view.dealer === i && (
                        <span className="dealer" title="ディーラー">
                          D
                        </span>
                      )}
                    </div>
                    <ChipStacks amount={visibleStack} owner={p.name} />
                    <div className="hole-cards">
                      {p.hole.length ? (
                        p.hole.map((c, n) => (
                          <PlayingCard
                            key={`${view.hand}-${n}`}
                            card={c}
                            back={!shown}
                            small={i !== 0}
                            lit={
                              shown &&
                              view.done &&
                              !p.folded &&
                              highlighted.has(c)
                            }
                          />
                        ))
                      ) : (
                        <span className="out">SITTING OUT</span>
                      )}
                    </div>
                    <div className="seat-status">
                      {!view.done &&
                      !p.folded &&
                      p.stack === 0 &&
                      p.hole.length ? (
                        <span className="all-in-label">ALL-IN</span>
                      ) : winning ? (
                        <span className="payout">
                          +{fmt(view.payouts[p.id])}
                        </span>
                      ) : view.actor === i ? (
                        <span className="thinking">
                          {i === 0 ? "あなたのアクション" : "THINKING"}{" "}
                          <i>•••</i>
                        </span>
                      ) : (
                        p.last || "READY"
                      )}
                      {!view.done && p.bet > 0 && (
                        <span className="bet-chip">◉ {fmt(p.bet)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>

            {view.done && activeStep && (
              <section
                className="showdown-verdict"
                aria-live="polite"
                data-board={activeBoard}
              >
                <span className="verdict-board">BOARD {"AB"[activeBoard]}</span>
                <div>
                  <small>
                    {activeStep.award.pot === 0
                      ? "MAIN POT"
                      : `SIDE POT ${activeStep.award.pot}`}{" "}
                    ·{" "}
                    {activeStep.award.winners.length > 1
                      ? "同点勝利"
                      : "WINNER"}
                  </small>
                  <strong>
                    {view.players[activeStep.winner].name}{" "}
                    <span>— {names[activeStep.hand.category]}</span>
                  </strong>
                </div>
                <span className="verdict-note">ホール2枚 ＋ ボード3枚</span>
              </section>
            )}
            <section className="action-panel" aria-live="polite">
              {replay ? (
                <div className="end-actions">
                  <div className="replay-timeline">
                    <span>REPLAY · HAND #{replay.hand}</span>
                    <label>
                      アクション {replayStep + 1} / {replaySequence.length}
                      <input
                        aria-label="リプレイのアクション"
                        type="range"
                        min="0"
                        max={replaySequence.length - 1}
                        value={replayStep}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setReplayStep(n);
                          setReplay(replaySequence[n]);
                        }}
                      />
                    </label>
                    <small>{replay.log.at(-1)}</small>
                  </div>
                  <button
                    className="primary"
                    onClick={() => {
                      setReplay(null);
                      window.scrollTo(0, 0);
                    }}
                  >
                    ライブテーブルに戻る →
                  </button>
                </div>
              ) : game.done && !showdownComplete ? (
                <div className="end-actions">
                  <div>
                    <span className="eyebrow">
                      SHOWDOWN · BOARD {"AB"[activeBoard]}
                    </span>
                    <h2>
                      {names[activeStep.hand.category]}
                      <small>
                        {view.players[activeStep.winner].name} の最強ハンド
                      </small>
                    </h2>
                  </div>
                  <span className="showdown-wait">
                    {steps[presentationIndex + 1]?.award.board !==
                      activeBoard && presentationIndex + 1 < steps.length
                      ? "続いて BOARD B を判定します…"
                      : "勝利ハンドを表示しています…"}
                  </span>
                </div>
              ) : game.done ? (
                <div className="end-actions">
                  <div>
                    <span className="eyebrow">
                      {scoop
                        ? "ONE PLAYER. BOTH BOARDS."
                        : "THE CHIPS HAVE FOUND THEIR HOME."}
                    </span>
                    <h2>
                      {gameOver
                        ? game.players[0].stack === 0
                          ? "GAME OVER"
                          : "TABLE WIN"
                        : game.awards.length
                          ? scoop
                            ? "SCOOP!"
                            : "CHOP!"
                          : "HAND COMPLETE"}{" "}
                      <small>
                        {gameOver
                          ? game.players[0].stack === 0
                            ? "スタックが0になりました。3秒後にトップへ戻ります。"
                            : "全チップを獲得！3秒後にトップへ戻ります。"
                          : scoop
                            ? `${game.players[sole].name} が両ボードを獲得`
                            : sessionOver
                              ? "セッション終了"
                              : "次の一手は、新しいボードで。"}
                      </small>
                    </h2>
                  </div>
                  {gameOver ? (
                    <button className="primary" onClick={returnHome}>
                      トップへ戻る
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={!!allIn.cutIn}
                      onClick={next}
                    >
                      次のハンド <span>→</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="turn-copy">
                    <span className="eyebrow">
                      {humanTurn
                        ? "YOUR MOVE"
                        : game.players[0].folded
                          ? "YOU FOLDED"
                          : "AT THE TABLE"}
                    </span>
                    <strong>
                      {humanTurn
                        ? l.canCheck
                          ? "チェック、またはベット"
                          : `${fmt(l.call)} でコール`
                        : game.players[game.actor]?.name +
                          " のアクションを待っています"}
                    </strong>
                    <small>
                      {humanTurn
                        ? "ホールカード2枚 ＋ ボード3枚で役を作ります"
                        : "2つのボード、それぞれの勝負。"}
                    </small>
                  </div>
                  {humanTurn && (
                    <div className="controls">
                      <div className="basic-actions">
                        {l.canFold && (
                          <button
                            className="fold"
                            disabled={!!allIn.cutIn}
                            onClick={() => dispatch({ type: "fold" })}
                          >
                            Fold
                          </button>
                        )}
                        <button
                          className={`call ${!l.canCheck && l.call === game.players[0].stack ? "all-in-button" : ""}`}
                          disabled={!!allIn.cutIn}
                          onClick={() =>
                            dispatch({ type: l.canCheck ? "check" : "call" })
                          }
                        >
                          {l.canCheck ? "Check" : `Call ${fmt(l.call)}`}
                          {!l.canCheck && l.call === game.players[0].stack && (
                            <small>ALL-IN</small>
                          )}
                        </button>
                      </div>
                      {l.canRaise && (
                        <div className="raise-controls">
                          <div className="sizing">
                            <label>
                              合計ベット額
                              <input
                                aria-label="合計ベット額"
                                type="number"
                                min={l.min}
                                max={l.max}
                                step="1"
                                value={raiseAmount}
                                onChange={(e) =>
                                  setAmount(Math.floor(Number(e.target.value)))
                                }
                              />
                            </label>
                            <div className="presets">
                              {[0.5, 0.75, 1].map((f) => (
                                <button
                                  key={f}
                                  onClick={() =>
                                    setAmount(
                                      Math.max(
                                        l.min,
                                        Math.min(
                                          l.max,
                                          game.high +
                                            Math.floor((pot + l.call) * f),
                                        ),
                                      ),
                                    )
                                  }
                                >
                                  {f === 1
                                    ? "Pot"
                                    : f === 0.5
                                      ? "½ Pot"
                                      : "¾ Pot"}
                                </button>
                              ))}
                              {l.allIn && (
                                <button
                                  className="all-in-shortcut"
                                  aria-label="All-in"
                                  onClick={() => setAmount(l.max)}
                                >
                                  All-in
                                </button>
                              )}
                            </div>
                            <input
                              aria-label="ベット額スライダー"
                              type="range"
                              min={l.min}
                              max={l.max}
                              value={raiseAmount}
                              onChange={(e) =>
                                setAmount(Number(e.target.value))
                              }
                            />
                          </div>
                          <button
                            className={`primary raise ${raiseAmount === game.players[0].bet + game.players[0].stack ? "all-in-button" : ""}`}
                            disabled={!!allIn.cutIn}
                            onClick={() =>
                              dispatch({ type: "raise", to: raiseAmount })
                            }
                          >
                            {raiseAmount ===
                            game.players[0].bet + game.players[0].stack
                              ? "All-in"
                              : game.high
                                ? "Raise to"
                                : "Bet"}
                            <b>{fmt(raiseAmount)}</b>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
            {celebration === view && !replay && scoop && (
              <ScoopCelebration
                winner={view.players[sole].name}
                amount={view.payouts[sole] ?? 0}
                hero={sole === 0}
              />
            )}
            {allIn.cutIn && (
              <AllInCutIn
                key={allIn.cutIn.key}
                player={allIn.cutIn.player}
                amount={allIn.cutIn.amount}
              />
            )}
          </div>
          <ChipLegend />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {view.done && view.awards.length > 0 && (
            <section className="results">
              {steps
                .slice(
                  0,
                  showdownComplete ? steps.length : presentationIndex + 1,
                )
                .map((step, i) => (
                  <button
                    key={i}
                    disabled={!showdownComplete}
                    onClick={() => {
                      setSelectedStep(i);
                    }}
                    className={activeStep === step ? "selected" : ""}
                    data-board={step.award.board}
                  >
                    <small>
                      {step.award.pot === 0
                        ? "MAIN POT"
                        : `SIDE POT ${step.award.pot}`}{" "}
                      · BOARD {"AB"[step.award.board]} ·{" "}
                      {fmt(step.award.amount)}
                    </small>
                    <b>{view.players[step.winner].name}</b>
                    <span>
                      {names[step.hand.category]}
                      {step.award.winners.length > 1 ? " · TIE" : ""}
                    </span>
                  </button>
                ))}
            </section>
          )}
          <div className="lower-grid">
            <section className="history">
              <div className="section-title">
                <h3>
                  Table journal <small>ハンド履歴</small>
                </h3>
                <span>LAST {history.length} HANDS</span>
              </div>
              {history.length === 0 ? (
                <p className="muted">
                  最初の物語は、まだこれから。ハンド終了後に履歴が残ります。
                </p>
              ) : (
                history.slice(0, 8).map((h, i) => (
                  <button
                    key={i}
                    className="history-item"
                    onClick={() => {
                      const sequence = replays.current.get(h) ?? [h];
                      setReplaySequence(sequence);
                      setReplayStep(sequence.length - 1);
                      setReplay(h);
                    }}
                  >
                    <span>#{h.hand.toString().padStart(3, "0")}</span>
                    <b>{fmt(h.players.reduce((n, p) => n + p.total, 0))} pot</b>
                    <span className={(h.payouts[0] ?? 0) > 0 ? "positive" : ""}>
                      YOU +{fmt(h.payouts[0] ?? 0)}
                    </span>
                    <small>リプレイ ↗</small>
                  </button>
                ))
              )}
              <details>
                <summary>現在のアクションログ</summary>
                <ol>
                  {view.log.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              </details>
            </section>
            <aside>
              <h3>
                Your session <small>プレイ統計</small>
              </h3>
              <div className="stat">
                <span>HANDS PLAYED</span>
                <b>{stats.hands}</b>
              </div>
              <div className="stat">
                <span>SCOOPS</span>
                <b>{stats.scoops}</b>
              </div>
              <div className="stat">
                <span>NET CHIPS</span>
                <b className={stats.net >= 0 ? "positive" : ""}>
                  {stats.net >= 0 ? "+" : ""}
                  {fmt(stats.net)}
                </b>
              </div>
              <p>統計はこのブラウザに保存されます。</p>
            </aside>
          </div>
          <footer>
            <span>♠ DOUBLE BOARD PLO5</span>
            <span>プレイチップ専用 · 換金・入出金・賞金なし</span>
            <span>EXACTLY TWO. ALWAYS.</span>
          </footer>
          {config && (
            <div className="modal-backdrop">
              <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-title"
              >
                <button
                  className="close"
                  aria-label="閉じる"
                  onClick={() => setConfig(false)}
                >
                  ×
                </button>
                <span className="eyebrow">MAKE IT YOUR TABLE</span>
                <h2 id="settings-title">テーブル設定</h2>
                <p>
                  適用すると現在のハンドを終了し、新しいセッションを開始します。
                </p>
                <div className="settings-grid">
                  <label>
                    プレイヤー人数
                    <select
                      value={draft.count}
                      onChange={(e) =>
                        setDraft({ ...draft, count: +e.target.value })
                      }
                    >
                      {[2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n} 人（CPU {n - 1} 人）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    初期スタック
                    <input
                      type="number"
                      min="1"
                      max="10000000"
                      value={draft.stack}
                      onChange={(e) =>
                        setDraft({ ...draft, stack: +e.target.value })
                      }
                    />
                  </label>
                  <label>
                    ボムポットアンティ
                    <input
                      type="number"
                      min="1"
                      max="1000000"
                      value={draft.ante}
                      onChange={(e) =>
                        setDraft({ ...draft, ante: +e.target.value })
                      }
                    />
                  </label>
                  <label>
                    CPU難易度
                    <select
                      value={draft.difficulty}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          difficulty: e.target.value as Settings["difficulty"],
                        })
                      }
                    >
                      {["EASY", "NORMAL", "HARD"].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    アニメーション速度
                    <select
                      value={draft.speed}
                      onChange={(e) =>
                        setDraft({ ...draft, speed: +e.target.value })
                      }
                    >
                      <option value="0.5">ゆっくり</option>
                      <option value="1">標準</option>
                      <option value="2">高速</option>
                      <option value="4">最速</option>
                    </select>
                  </label>
                  <label>
                    サウンド（SE）
                    <select
                      value={String(draft.sound)}
                      onChange={(e) =>
                        setDraft({ ...draft, sound: e.target.value === "true" })
                      }
                    >
                      <option value="false">OFF</option>
                      <option value="true">ON</option>
                    </select>
                  </label>
                  <label>
                    女性ボイス（役の読み上げ）
                    <select
                      value={String(draft.voice)}
                      onChange={(e) =>
                        setDraft({ ...draft, voice: e.target.value === "true" })
                      }
                    >
                      <option value="true">ON</option>
                      <option value="false">OFF</option>
                    </select>
                  </label>
                  <label>
                    音量 {Math.round(draft.volume * 100)}%
                    <input
                      aria-label="音量"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={draft.volume}
                      onChange={(e) =>
                        setDraft({ ...draft, volume: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                <button className="primary" onClick={save}>
                  設定を適用して開始 →
                </button>
              </section>
            </div>
          )}
          {rules && (
            <div className="modal-backdrop">
              <section
                className="modal rules"
                role="dialog"
                aria-modal="true"
                aria-labelledby="rules-title"
              >
                <button
                  className="close"
                  aria-label="閉じる"
                  onClick={() => setRules(false)}
                >
                  ×
                </button>
                <span className="eyebrow">A DIFFERENT KIND OF POKER</span>
                <h2 id="rules-title">5 cards. 2 boards. 1 pot.</h2>
                <p>
                  全員がアンティを払い、5枚のホールカードと2つのフロップからスタート。プリフロップのベットはありません。
                </p>
                <h3>必ず、2枚 ＋ 3枚。</h3>
                <p>
                  各ボードでホールカードを必ず2枚、対象ボードから必ず3枚使います。A・Bは独立判定。ハイハンドのみです。
                </p>
                <h3>ポットリミット</h3>
                <p>
                  コール後のポット額までレイズできます。最低ベットはアンティ額、最低レイズ幅は直前のフルベット／レイズ幅。ショートオールインでの増額が累積してフルレイズ幅に達すると、レイズ権が再開します。金額欄はそのラウンドの合計ベット額です。
                </p>
                <h3>分配とオールイン</h3>
                <p>
                  各メイン・サイドポットを半分ずつ両ボードに分配。奇数の1チップはAへ。同点の余りはボタン左から時計回り。未コール分は返却し、フォールドした人は受け取れません。
                </p>
                <p>
                  CPUは公開情報からの簡易シミュレーションを使用します。GTOソルバーではありません。CPUの破産した席は休止します。自分のスタックが0になった場合は、結果表示後にスコアを記録してトップ画面へ戻ります。
                </p>
                <button className="primary" onClick={() => setRules(false)}>
                  テーブルに戻る
                </button>
              </section>
            </div>
          )}
        </main>
      )}
    </>
  );
}
