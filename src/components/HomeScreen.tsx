import { useState } from "react";
import type { Settings } from "../game/engine";
import type { ScoreRecord } from "../records/scores";
const fmt = (n: number) => n.toLocaleString("en-US");
const labels = {
  playing: "プレイ中",
  bust: "GAME OVER",
  winner: "TABLE WIN",
  interrupted: "中断",
};
const date = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export function HomeScreen({
  settings,
  records,
  lastResult,
  onStart,
  error,
  storageError,
  totalHands,
}: {
  settings: Settings;
  records: ScoreRecord[];
  lastResult: ScoreRecord | null;
  onStart: (settings: Settings) => void;
  error: string;
  storageError: boolean;
  totalHands: number;
}) {
  const [draft, setDraft] = useState(settings);
  const best = Math.max(0, ...records.map((r) => r.peakStack)),
    profit = Math.max(0, ...records.map((r) => r.net));
  return (
    <main className="home-screen">
      <header className="home-header">
        <span className="eyebrow">THE BOMB POT CLUB</span>
        <a href="#score-records">スコア記録を見る ↓</a>
        <span className="play-money">
          <i />
          PLAY CHIPS ONLY
        </span>
      </header>
      <section className="home-intro">
        <div className="home-hero">
          <span className="eyebrow">5 CARDS · 2 BOARDS · YOUR NEXT MOVE</span>
          <img
            className="home-logo"
            src={`${import.meta.env.BASE_URL}branding/double-board-plo5-logo.webp`}
            alt="DOUBLE BOARD PLO5"
            width="1983"
            height="793"
            fetchPriority="high"
          />
          <h1>
            ふたつのボードに、
            <br />
            <em>ひとつの勝負を。</em>
          </h1>
          <p>
            5枚の手札と、2つのボード。
            <br />
            CPUとのボムポットを、プレイチップで何度でも。
          </p>
          <div className="home-quick-start">
            <button
              className="primary"
              type="submit"
              form="home-table-form"
              aria-label="今すぐプレイ"
            >
              今すぐプレイ <span>→</span>
            </button>
            <small>
              {draft.count}人卓 · 初期 {fmt(draft.stack)} · アンティ{" "}
              {fmt(draft.ante)}
            </small>
            <a href="#home-table-settings">設定を変更する ↓</a>
          </div>
          <div className="home-rules">
            <span>♠ ホール2枚 ＋ ボード3枚</span>
            <span>◉ ポットリミット</span>
            <span>✦ 最大6人卓</span>
          </div>
        </div>
        <section className="home-setup" id="home-table-settings">
          <span className="eyebrow">TAKE YOUR SEAT</span>
          <h2>テーブルへようこそ</h2>
          <p>設定を選んでゲームを始めましょう。</p>
          <form
            id="home-table-form"
            onSubmit={(e) => {
              e.preventDefault();
              onStart(draft);
            }}
          >
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
                  {["EASY", "NORMAL", "HARD"].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label>
                初期スタック
                <input
                  type="number"
                  required
                  min="1"
                  max="10000000"
                  step="1"
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
                  required
                  min="1"
                  max="1000000"
                  step="1"
                  value={draft.ante}
                  onChange={(e) =>
                    setDraft({ ...draft, ante: +e.target.value })
                  }
                />
              </label>
            </div>
            <details className="home-advanced">
              <summary>サウンド・表示設定</summary>
              <div className="settings-grid">
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
                    <option value="true">ON</option>
                    <option value="false">OFF</option>
                  </select>
                </label>
                <label>
                  女性ボイス
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
                  音量
                  <input
                    aria-label="音量"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={draft.volume}
                    onChange={(e) =>
                      setDraft({ ...draft, volume: +e.target.value })
                    }
                  />
                </label>
              </div>
            </details>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary home-play"
              type="submit"
              aria-label="ゲームを始める"
            >
              ゲームを始める <span>→</span>
            </button>
            <small className="home-play-note">
              換金・入出金・賞金なしのプレイチップ専用ゲーム
            </small>
          </form>
        </section>
      </section>
      {lastResult && (
        <section
          className={`home-result ${lastResult.status === "bust" ? "busted" : ""}`}
          aria-label="前回の結果"
        >
          <div>
            <span className="eyebrow">{labels[lastResult.status]}</span>
            <h2>
              {lastResult.status === "bust"
                ? "スタックが0になりました"
                : lastResult.status === "winner"
                  ? "テーブル制覇！"
                  : "前回のプレイ記録"}
            </h2>
            <p>
              {lastResult.status === "interrupted"
                ? "最後に確定したハンドまでのスコアを記録しました。"
                : "スコアを記録しました。新しいテーブルで、もう一度。"}
            </p>
          </div>
          <div>
            <small>最終スコア</small>
            <strong>{fmt(lastResult.finalStack)}</strong>
            <span>
              最高 {fmt(lastResult.peakStack)} · {lastResult.hands} HANDS
            </span>
          </div>
        </section>
      )}
      <section className="home-stats" aria-label="累計スコア">
        <div>
          <small>BEST STACK · 最高到達</small>
          <strong>{fmt(best)}</strong>
        </div>
        <div>
          <small>BEST PROFIT · 最高収支</small>
          <strong>+{fmt(profit)}</strong>
        </div>
        <div>
          <small>HANDS PLAYED</small>
          <strong>
            {fmt(
              Math.max(
                totalHands,
                records.reduce((sum, r) => sum + r.hands, 0),
              ),
            )}
          </strong>
        </div>
      </section>
      <section className="score-history" id="score-records">
        <div className="section-title">
          <h2>
            Score records <small>スコア記録</small>
          </h2>
          <span>最新50セッション · このブラウザに保存</span>
        </div>
        {storageError && (
          <p className="error" role="alert">
            記録をブラウザに保存できませんでした。現在の画面には表示しています。
          </p>
        )}
        {records.length === 0 ? (
          <div className="score-empty">
            まだ記録はありません。最初の一手から、あなたの記録が始まります。
          </div>
        ) : (
          <div className="score-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日時（日本時間） / 結果</th>
                  <th>最終スコア</th>
                  <th>最高スタック</th>
                  <th>収支</th>
                  <th>ハンド</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} data-score-id={r.id}>
                    <td>
                      <b>
                        {date(r.updatedAt)} · {labels[r.status]}
                      </b>
                      <small>
                        {r.players}人 / {r.difficulty} / 初期{" "}
                        {fmt(r.initialStack)}
                      </small>
                    </td>
                    <td>{fmt(r.finalStack)}</td>
                    <td>{fmt(r.peakStack)}</td>
                    <td className={r.net >= 0 ? "positive" : ""}>
                      {r.net >= 0 ? "+" : ""}
                      {fmt(r.net)}
                    </td>
                    <td>
                      {r.hands}
                      <small>SCOOP {r.scoops}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="score-note">
          スコアはハンド終了ごとに保存します。途中で戻った場合は、最後に確定したハンドまでを記録します。
        </p>
      </section>
      <footer>
        <span>♠ DOUBLE BOARD PLO5</span>
        <span>プレイチップ専用 · 換金・入出金・賞金なし</span>
      </footer>
    </main>
  );
}
