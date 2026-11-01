import type { CSSProperties } from "react";
export const CHIP_VALUES = [
  { value: 1000, label: "1K", color: "#d5ad57", ink: "#342713" },
  { value: 100, label: "100", color: "#8b73b9", ink: "#fff9ff" },
  { value: 25, label: "25", color: "#409b7c", ink: "#f5fff9" },
  { value: 5, label: "5", color: "#bd6063", ink: "#fff8f6" },
  { value: 1, label: "1", color: "#dce0d4", ink: "#29413c" },
] as const;
export function chipBreakdown(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new RangeError("Invalid chip amount");
  let remaining = amount;
  return CHIP_VALUES.map((chip) => {
    const count = Math.floor(remaining / chip.value);
    remaining %= chip.value;
    return { ...chip, count };
  }).filter((chip) => chip.count > 0);
}
export function ChipStacks({
  amount,
  owner,
}: {
  amount: number;
  owner: string;
}) {
  const piles = chipBreakdown(amount);
  const label = piles
    .map((p) => `${p.value.toLocaleString()} × ${p.count.toLocaleString()}`)
    .join("、");
  return (
    <div
      className={`chip-rack ${amount === 0 ? "empty-rack" : ""}`}
      role="img"
      aria-label={`${owner}の残りスタック ${amount.toLocaleString()}チップ${label ? `（${label}）` : ""}`}
      data-amount={amount}
      title={label || "残りスタックなし"}
    >
      {piles.map((pile) => {
        const height = Math.min(pile.count, 8);
        return (
          <div
            className="chip-column"
            key={pile.value}
            data-value={pile.value}
            data-count={pile.count}
            style={
              {
                "--chip-color": pile.color,
                "--chip-ink": pile.ink,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <div className="chip-pile">
              {Array.from({ length: height }, (_, i) => (
                <span
                  className={`chip-disc ${i === height - 1 ? "chip-top" : ""}`}
                  key={i}
                  style={{ bottom: `${i * 3}px` }}
                >
                  {i === height - 1 ? pile.label : ""}
                </span>
              ))}
            </div>
            <span className="chip-count">×{pile.count.toLocaleString()}</span>
          </div>
        );
      })}
      {amount === 0 && (
        <span className="no-chips" aria-hidden="true">
          NO CHIPS
        </span>
      )}
    </div>
  );
}
export function ChipLegend() {
  return (
    <div className="chip-legend" aria-label="チップの額面">
      <span>CHIP VALUES</span>
      {CHIP_VALUES.map((chip) => (
        <span key={chip.value}>
          <i style={{ background: chip.color }} />
          {chip.value.toLocaleString()}
        </span>
      ))}
      <small>山の下の × 数が保有枚数</small>
    </div>
  );
}
