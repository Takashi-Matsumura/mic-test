import type {
  OpenFitAction,
  OpenFitControllerOptions,
  OpenFitHandlers,
  OpenFitMetadata,
  OpenFitState,
} from "./types";

function createSilentWavUrl(durationSec = 1): string {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

const ALL_ACTIONS: MediaSessionAction[] = [
  "play",
  "pause",
  "stop",
  "nexttrack",
  "previoustrack",
];

export class OpenFitController {
  private audio: HTMLAudioElement | null = null;
  private silentUrl: string | null = null;
  private handlers: OpenFitHandlers;
  private metadata: OpenFitMetadata;
  private state: OpenFitState = {
    enabled: false,
    audioElapsed: 0,
    lastAction: null,
    lastActionAt: null,
  };
  private listeners = new Set<(s: OpenFitState) => void>();
  private elapsedTimer: number | null = null;

  constructor(options: OpenFitControllerOptions = {}) {
    const { metadata, onPlayPause, onNext, onPrevious, onStop } = options;
    this.handlers = { onPlayPause, onNext, onPrevious, onStop };
    this.metadata = metadata ?? {};
  }

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "mediaSession" in navigator;
  }

  async enable(): Promise<void> {
    if (!OpenFitController.isSupported()) {
      throw new Error("Media Session API is not supported in this environment.");
    }
    if (this.state.enabled) return;

    if (!this.silentUrl) {
      this.silentUrl = createSilentWavUrl(1);
    }
    if (!this.audio) {
      const audio = new Audio(this.silentUrl);
      audio.loop = true;
      audio.volume = 0;
      this.audio = audio;
    }
    await this.audio.play();

    this.applyMetadata();
    navigator.mediaSession.playbackState = "playing";
    this.registerHandlers();
    this.startElapsedTimer();

    this.updateState({ enabled: true });
  }

  disable(): void {
    if (!this.state.enabled) return;
    this.audio?.pause();
    this.unregisterHandlers();
    if (OpenFitController.isSupported()) {
      navigator.mediaSession.playbackState = "none";
    }
    this.stopElapsedTimer();
    this.updateState({
      enabled: false,
      audioElapsed: 0,
      lastAction: null,
      lastActionAt: null,
    });
  }

  setHandlers(handlers: OpenFitHandlers): void {
    this.handlers = { ...handlers };
  }

  setMetadata(metadata: OpenFitMetadata): void {
    this.metadata = { ...metadata };
    if (this.state.enabled) {
      this.applyMetadata();
    }
  }

  getState(): OpenFitState {
    return this.state;
  }

  subscribe(listener: (s: OpenFitState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    this.disable();
    if (this.silentUrl) {
      URL.revokeObjectURL(this.silentUrl);
      this.silentUrl = null;
    }
    this.audio = null;
    this.listeners.clear();
  }

  private applyMetadata(): void {
    if (!OpenFitController.isSupported()) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: this.metadata.title ?? "OpenFit Controls",
      artist: this.metadata.artist ?? "",
      album: this.metadata.album ?? "",
    });
  }

  private dispatch(action: OpenFitAction): void {
    this.updateState({ lastAction: action, lastActionAt: Date.now() });
    switch (action) {
      case "playpause":
        this.handlers.onPlayPause?.();
        break;
      case "next":
        this.handlers.onNext?.();
        break;
      case "previous":
        this.handlers.onPrevious?.();
        break;
      case "stop":
        this.handlers.onStop?.();
        break;
    }
  }

  private registerHandlers(): void {
    if (!OpenFitController.isSupported()) return;
    const ms = navigator.mediaSession;

    const playPauseHandler = () => {
      this.dispatch("playpause");
      ms.playbackState = ms.playbackState === "playing" ? "paused" : "playing";
    };
    ms.setActionHandler("play", playPauseHandler);
    ms.setActionHandler("pause", playPauseHandler);

    const safeSet = (action: MediaSessionAction, h: () => void) => {
      try { ms.setActionHandler(action, h); } catch {}
    };
    safeSet("stop", () => this.dispatch("stop"));
    safeSet("nexttrack", () => this.dispatch("next"));
    safeSet("previoustrack", () => this.dispatch("previous"));
  }

  private unregisterHandlers(): void {
    if (!OpenFitController.isSupported()) return;
    for (const a of ALL_ACTIONS) {
      try { navigator.mediaSession.setActionHandler(a, null); } catch {}
    }
  }

  private startElapsedTimer(): void {
    this.stopElapsedTimer();
    if (typeof window === "undefined") return;
    this.elapsedTimer = window.setInterval(() => {
      if (this.audio && !this.audio.paused) {
        this.updateState({ audioElapsed: Math.floor(this.audio.currentTime) });
      }
    }, 1000);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedTimer !== null && typeof window !== "undefined") {
      window.clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  private updateState(patch: Partial<OpenFitState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }
}
