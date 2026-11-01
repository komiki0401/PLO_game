export type SpokenAction = "call" | "raise" | "bet" | "allin";
export const actionVoicePath = (action: SpokenAction) =>
  `${import.meta.env.BASE_URL}audio/voice/${action}.mp3`;
export type AudioPrefs = { sound: boolean; voice: boolean; volume: number };
export type SoundCue =
  | "deal"
  | "check"
  | "chips"
  | "fold"
  | "board"
  | "reveal"
  | "win"
  | "scoop"
  | "allin";
const base = import.meta.env.BASE_URL;
export const voicePath = (board: number, category: number) =>
  `${base}audio/voice/${board === 0 ? "a" : "b"}-${category}.mp3`;
// SE is synthesized locally. Voice clips are bundled, so no OS voice or remote
// speech service is needed during gameplay. One player prevents overlapping calls.
export class TableAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private prefs: AudioPrefs = { sound: true, voice: true, volume: 0.65 };
  private unlocked = false;
  private unlocking: Promise<boolean> | null = null;
  private finishVoice: (() => void) | null = null;
  private actionTail: Promise<void> = Promise.resolve();
  private generation = 0;
  constructor(
    private player: HTMLAudioElement,
    private onBlocked: () => void,
  ) {}
  configure(prefs: AudioPrefs) {
    this.prefs = {
      ...prefs,
      volume: Number.isFinite(prefs.volume)
        ? Math.max(0, Math.min(1, prefs.volume))
        : 0.65,
    };
    if (this.master && this.context)
      this.master.gain.setValueAtTime(
        prefs.sound ? this.prefs.volume : 0,
        this.context.currentTime,
      );
    this.player.volume = this.prefs.volume;
    if (!prefs.voice || !this.prefs.volume) this.stopVoice();
  }
  unlock(): Promise<boolean> {
    if (this.unlocked) {
      void this.context?.resume().catch(() => {});
      return Promise.resolve(true);
    }
    if (this.unlocking) return this.unlocking;
    try {
      const AudioEngine =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioEngine && !this.context) {
        this.context = new AudioEngine();
        this.master = this.context.createGain();
        this.master.gain.value = this.prefs.sound ? this.prefs.volume : 0;
        this.master.connect(this.context.destination);
      }
      void this.context?.resume().catch(() => {});
      this.player.src = `${base}audio/silence.mp3`;
      this.unlocking = this.player
        .play()
        .then(() => {
          this.unlocked = true;
          return true;
        })
        .catch(() => {
          this.onBlocked();
          return false;
        })
        .finally(() => {
          this.unlocking = null;
        });
      return this.unlocking;
    } catch {
      this.onBlocked();
      return Promise.resolve(false);
    }
  }
  private interruptVoice() {
    this.player.pause();
    this.finishVoice?.();
    this.finishVoice = null;
  }
  stopVoice() {
    this.generation++;
    this.actionTail = Promise.resolve();
    this.interruptVoice();
  }
  whenIdle(): Promise<void> {
    return this.actionTail;
  }
  announceAction(action: SpokenAction): Promise<void> {
    const generation = this.generation;
    const queued = this.actionTail.then(() =>
      generation === this.generation
        ? this.playVoice(actionVoicePath(action))
        : undefined,
    );
    this.actionTail = queued;
    return queued;
  }
  announce(board: number, category: number): Promise<void> {
    const generation = this.generation;
    return this.actionTail.then(() =>
      generation === this.generation
        ? this.playVoice(voicePath(board, category))
        : undefined,
    );
  }
  private playVoice(source: string): Promise<void> {
    this.interruptVoice();
    if (
      document.hidden ||
      !this.prefs.voice ||
      !this.prefs.volume ||
      !this.unlocked
    )
      return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.player.removeEventListener("ended", cleanup);
        this.player.removeEventListener("error", failed);
        if (this.finishVoice === cleanup) this.finishVoice = null;
        resolve();
      };
      const failed = () => {
        if (settled) return;
        this.onBlocked();
        cleanup();
      };
      // A stalled/missing asset must never prevent the next hand.
      const timeout = setTimeout(() => {
        this.player.pause();
        failed();
      }, 12000);
      this.finishVoice = cleanup;
      this.player.addEventListener("ended", cleanup, { once: true });
      this.player.addEventListener("error", failed, { once: true });
      this.player.src = source;
      this.player.play().catch(failed);
    });
  }
  cue(kind: SoundCue) {
    const ctx = this.context,
      master = this.master;
    if (
      document.hidden ||
      !ctx ||
      !master ||
      !this.unlocked ||
      !this.prefs.sound ||
      !this.prefs.volume ||
      ctx.state !== "running"
    )
      return;
    const note = (
      frequency: number,
      start: number,
      duration: number,
      volume: number,
      type: OscillatorType = "sine",
      end = frequency,
    ) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain(),
        time = ctx.currentTime + start;
      o.type = type;
      o.frequency.setValueAtTime(frequency, time);
      o.frequency.exponentialRampToValueAtTime(
        Math.max(1, end),
        time + duration,
      );
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(volume, time + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      o.connect(g);
      g.connect(master);
      o.start(time);
      o.stop(time + duration + 0.02);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    };
    switch (kind) {
      case "deal":
        for (let i = 0; i < 5; i++)
          note(1000 + i * 130, i * 0.065, 0.07, 0.09, "triangle", 280);
        break;
      case "board":
        for (let i = 0; i < 3; i++)
          note(850 + i * 200, i * 0.09, 0.12, 0.09, "triangle", 430);
        break;
      case "check":
        note(190, 0, 0.085, 0.15, "sine", 110);
        note(170, 0.085, 0.07, 0.11, "sine", 100);
        break;
      case "chips":
        for (let i = 0; i < 3; i++)
          note(1800 + i * 350, i * 0.045, 0.12, 0.055, "triangle", 900);
        break;
      case "fold":
        note(420, 0, 0.14, 0.055, "triangle", 130);
        break;
      case "reveal":
        [523.25, 659.25, 783.99].forEach((f, i) =>
          note(f, i * 0.06, 0.24, 0.05),
        );
        break;
      case "win":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          note(f, i * 0.09, 0.34, 0.06),
        );
        break;
      case "allin":
        note(110, 0, 0.48, 0.09, "triangle", 55);
        [330, 440, 660, 880].forEach((f, i) =>
          note(f, i * 0.075, 0.32, 0.055, "triangle"),
        );
        break;
      case "scoop":
        [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) =>
          note(f, i * 0.085, 0.5, 0.055),
        );
        [523.25, 659.25, 783.99, 1046.5].forEach((f) =>
          note(f, 0.58, 0.9, 0.035, "triangle"),
        );
        break;
    }
  }
  dispose() {
    this.stopVoice();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.master = null;
  }
}
