import { useEffect, useRef, useState, type RefObject } from "react";
import type { TableAudio } from "../audio/tableAudio";
export function useAllInCutIn(audio: RefObject<TableAudio | null>) {
  const [cutIn, setCutIn] = useState<{
    key: number;
    player: string;
    amount: number;
  } | null>(null);
  const active = useRef(false);
  const gate = useRef<Promise<void>>(Promise.resolve()),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    release = useRef<(() => void) | null>(null);
  function clear() {
    active.current = false;
    generation.current++;
    clearTimeout(timer.current);
    release.current?.();
    release.current = null;
    gate.current = Promise.resolve();
    setCutIn(null);
  }
  function show(
    player: string,
    amount: number,
    ready: Promise<unknown> = Promise.resolve(),
  ) {
    clear();
    const key = generation.current;
    active.current = true;
    setCutIn({ key, player, amount });
    const hold = new Promise<void>((resolve) => {
      release.current = resolve;
      timer.current = setTimeout(() => {
        release.current = null;
        resolve();
      }, 1600);
    });
    const speech = ready.then(() => {
      if (key !== generation.current) return;
      audio.current?.cue("allin");
      return audio.current?.announceAction("allin");
    });
    gate.current = Promise.all([hold, speech]).then(() => {
      if (key === generation.current) {
        active.current = false;
        setCutIn(null);
      }
    });
  }
  useEffect(
    () => () => {
      generation.current++;
      clearTimeout(timer.current);
      release.current?.();
    },
    [],
  );
  return { cutIn, gate, active, show, clear };
}
export function AllInCutIn({
  player,
  amount,
}: {
  player: string;
  amount: number;
}) {
  return (
    <div className="all-in-cutin" role="status" aria-live="polite">
      <div className="all-in-streak" />
      <div className="all-in-content">
        <small>{player}</small>
        <strong>
          ALL-IN<span>!</span>
        </strong>
        <b>オールイン</b>
        <span className="all-in-amount">
          ◉ {amount.toLocaleString("en-US")} CHIPS
        </span>
      </div>
    </div>
  );
}
