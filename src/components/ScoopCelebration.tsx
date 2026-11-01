import type { CSSProperties } from "react";

export function ScoopCelebration({ winner, amount, hero }: { winner: string; amount: number; hero: boolean }) {
  return (
    <div className={`scoop-celebration${hero ? " hero-scoop" : ""}`} role="status" aria-live="polite">
      <div className="scoop-rays" aria-hidden="true" />
      <div className="scoop-ring" aria-hidden="true" />
      <div className="scoop-particles" aria-hidden="true">
        {Array.from({ length: 32 }, (_, i) => (
          <i key={i} className={i % 4 === 0 ? "scoop-chip" : "scoop-spark"} style={{
            "--x": `${Math.cos(i * 2.39996) * (110 + i % 5 * 28)}px`,
            "--y": `${Math.sin(i * 2.39996) * (90 + i % 7 * 22)}px`,
            "--spin": `${180 + i * 37}deg`,
            "--delay": `${i % 8 * 35}ms`,
          } as CSSProperties} />
        ))}
      </div>
      <div className="scoop-message">
        <small>✦ BOTH BOARDS. ALL YOURS. ✦</small>
        <strong>SCOOP!</strong>
        <b>{hero ? "YOU WIN BOTH BOARDS!" : `${winner} WINS BOTH BOARDS!`}</b>
        <span>{hero ? "両ボードを独り占め！" : `${winner} が両ボードを獲得！`}</span>
        <em>+{amount.toLocaleString("en-US")} <small>CHIPS</small></em>
      </div>
    </div>
  );
}
