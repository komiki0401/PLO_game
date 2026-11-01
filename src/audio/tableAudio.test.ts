import { readFileSync, statSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TableAudio, voicePath } from "./tableAudio";
class Player extends EventTarget {
  src = "";
  volume = 1;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
}
const contexts: Engine[] = [];
class Engine {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  createGain = vi.fn(() => ({
    gain: this.gain,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  createOscillator = vi.fn(() => ({
    type: "sine",
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  }));
  constructor() {
    contexts.push(this);
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  contexts.length = 0;
  vi.stubGlobal("window", { AudioContext: Engine });
  vi.stubGlobal("document", { hidden: false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  const player = new Player(),
    blocked = vi.fn(),
    audio = new TableAudio(player as unknown as HTMLAudioElement, blocked);
  return { player, blocked, audio };
}
describe("table audio playback and cleanup", () => {
  it("uses bundled board-specific role clips", () => {
    expect(voicePath(0, 5)).toMatch(/audio\/voice\/a-5.mp3$/);
    expect(voicePath(1, 6)).toMatch(/audio\/voice\/b-6.mp3$/);
  });
  it("does not autoplay before a user gesture", async () => {
    const { audio, player } = setup();
    await audio.announce(0, 5);
    audio.cue("deal");
    expect(player.play).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(0);
  });
  it("plays distinct SE patterns after unlock and honors mute", async () => {
    const { audio } = setup();
    await audio.unlock();
    audio.cue("deal");
    expect(contexts[0].createOscillator).toHaveBeenCalledTimes(5);
    audio.cue("check");
    expect(contexts[0].createOscillator).toHaveBeenCalledTimes(7);
    audio.configure({ sound: false, voice: true, volume: 0.4 });
    audio.cue("win");
    expect(contexts[0].createOscillator).toHaveBeenCalledTimes(7);
    expect(contexts[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
  });
  it("waits for actual speech end before resolving", async () => {
    const { audio, player } = setup();
    await audio.unlock();
    let ended = false;
    const done = audio.announce(0, 4).then(() => {
      ended = true;
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(ended).toBe(false);
    expect(player.src).toMatch(/a-4.mp3$/);
    player.dispatchEvent(new Event("ended"));
    await done;
    expect(ended).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops the prior announcement before the next and resolves when muted", async () => {
    const { audio, player } = setup();
    await audio.unlock();
    let firstEnded = false;
    const first = audio.announce(0, 1).then(() => {
      firstEnded = true;
    });
    const second = audio.announce(1, 6);
    await first;
    expect(firstEnded).toBe(true);
    expect(player.src).toMatch(/b-6.mp3$/);
    audio.configure({ sound: true, voice: false, volume: 0.6 });
    await second;
    expect(player.pause).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("recovers a failed autoplay unlock on another user gesture", async () => {
    const { audio, player, blocked } = setup();
    player.play.mockRejectedValueOnce(new Error("NotAllowedError"));
    expect(await audio.unlock()).toBe(false);
    expect(blocked).toHaveBeenCalledOnce();
    expect(await audio.unlock()).toBe(true);
  });
  it("continues game progress on a missing or stalled voice asset", async () => {
    const { audio, player, blocked } = setup();
    await audio.unlock();
    const first = audio.announce(0, 5);
    await Promise.resolve();
    player.dispatchEvent(new Event("error"));
    await first;
    expect(blocked).toHaveBeenCalledOnce();
    const second = audio.announce(1, 5);
    await vi.advanceTimersByTimeAsync(12000);
    await second;
    expect(blocked).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("volume zero, hidden tab and disposal stop announcements", async () => {
    const { audio, player } = setup();
    await audio.unlock();
    audio.configure({ sound: true, voice: true, volume: 0 });
    await audio.announce(0, 5);
    expect(player.play).toHaveBeenCalledTimes(1);
    audio.configure({ sound: true, voice: true, volume: 0.5 });
    vi.stubGlobal("document", { hidden: true });
    await audio.announce(0, 5);
    expect(player.play).toHaveBeenCalledTimes(1);
    vi.stubGlobal("document", { hidden: false });
    const done = audio.announce(0, 5);
    audio.dispose();
    await done;
    expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("shipped speech assets", () => {
  it("includes a real clip for both boards and every role", () => {
    const root = new URL("../../public/audio/voice/", import.meta.url);
    const manifest = JSON.parse(
      readFileSync(new URL("manifest.json", root), "utf8"),
    );
    expect(manifest.voice).toBe("jf_alpha");
    expect(manifest.clips).toHaveLength(21);
    const files = new Set(
      manifest.clips.map((clip: { file: string }) => clip.file),
    );
    for (const board of ["a", "b"])
      for (let rank = 0; rank < 9; rank++) {
        expect(files.has(`${board}-${rank}.mp3`)).toBe(true);
        expect(
          statSync(new URL(`${board}-${rank}.mp3`, root)).size,
        ).toBeGreaterThan(10000);
      }
    expect(
      manifest.clips
        .filter((c: { file: string }) => /^[ab]-/.test(c.file))
        .every(
          (c: { duration: number; text: string }) =>
            c.duration > 1 && c.duration < 8 && c.text.startsWith("ボード"),
        ),
    ).toBe(true);
  });
});

describe("action speech scheduling", () => {
  it("reads consecutive calls and raises in order without overlapping", async () => {
    const { audio, player } = setup();
    await audio.unlock();
    const first = audio.announceAction("call");
    const second = audio.announceAction("raise");
    await Promise.resolve();
    expect(player.src).toMatch(/call.mp3$/);
    player.dispatchEvent(new Event("ended"));
    await first;
    await Promise.resolve();
    expect(player.src).toMatch(/raise.mp3$/);
    player.dispatchEvent(new Event("ended"));
    await second;
    await audio.whenIdle();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not cut off the final call when showdown begins", async () => {
    const { audio, player } = setup();
    await audio.unlock();
    const call = audio.announceAction("call");
    const showdown = audio.announce(0, 4);
    await Promise.resolve();
    expect(player.src).toMatch(/call.mp3$/);
    player.dispatchEvent(new Event("ended"));
    await call;
    await Promise.resolve();
    expect(player.src).toMatch(/a-4.mp3$/);
    player.dispatchEvent(new Event("ended"));
    await showdown;
  });
  it("cancels queued voices on mute or session change", async () => {
    const { audio, player } = setup();
    await audio.unlock();
    const first = audio.announceAction("call");
    const queued = audio.announceAction("raise");
    await Promise.resolve();
    audio.stopVoice();
    await Promise.all([first, queued]);
    expect(player.src).not.toMatch(/raise.mp3$/);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ships all action clips", () => {
    const root = new URL("../../public/audio/voice/", import.meta.url);
    for (const action of ["call", "raise", "bet"])
      expect(statSync(new URL(`${action}.mp3`, root)).size).toBeGreaterThan(
        3000,
      );
  });
});
