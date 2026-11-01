import type { Legal } from "./betting";

export const BET_STEP = 100;

// Keep integer-chip accounting and legal short all-ins intact. Normal bets and
// raises offered to players/CPUs use round hundreds as the street's total wager.
export function betSizing(legal: Legal) {
  const roundedMin = Math.ceil(legal.min / BET_STEP) * BET_STEP;
  const roundedMax = Math.floor(legal.max / BET_STEP) * BET_STEP;
  const hasRegular = roundedMin <= roundedMax;
  return {
    canRaise: legal.canRaise && (hasRegular || legal.allIn),
    min: hasRegular ? roundedMin : legal.max,
    max: hasRegular ? roundedMax : legal.max,
    hasRegular,
    normalize(value: number): number {
      if (!Number.isFinite(value)) return hasRegular ? roundedMin : legal.max;
      if (legal.allIn && value >= legal.max) return legal.max;
      return hasRegular
        ? Math.max(roundedMin, Math.min(roundedMax, Math.floor(value / BET_STEP) * BET_STEP))
        : legal.max;
    },
  };
}
