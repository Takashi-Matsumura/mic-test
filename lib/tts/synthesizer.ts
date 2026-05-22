import type { TTSOptions, TTSState } from "./types";

export class SpeechSynthesizer {
  private state: TTSState = {
    speaking: false,
    paused: false,
    voices: [],
    voicesLoaded: false,
  };
  private listeners = new Set<(s: TTSState) => void>();
  private defaultOptions: TTSOptions;
  private voicesChangedHandler: (() => void) | null = null;

  constructor(defaultOptions: TTSOptions = {}) {
    this.defaultOptions = { ...defaultOptions };
    if (SpeechSynthesizer.isSupported()) {
      this.loadVoices();
      this.voicesChangedHandler = () => this.loadVoices();
      window.speechSynthesis.addEventListener("voiceschanged", this.voicesChangedHandler);
    }
  }

  static isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  speak(text: string, options: TTSOptions = {}): void {
    if (!SpeechSynthesizer.isSupported()) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const utterance = new SpeechSynthesisUtterance(trimmed);
    const opts: TTSOptions = { ...this.defaultOptions, ...options };
    const resolvedVoice = this.resolveVoice(opts);
    if (resolvedVoice) utterance.voice = resolvedVoice;
    if (opts.lang) utterance.lang = opts.lang;
    if (opts.rate !== undefined) utterance.rate = opts.rate;
    if (opts.pitch !== undefined) utterance.pitch = opts.pitch;
    if (opts.volume !== undefined) utterance.volume = opts.volume;

    utterance.onstart = () => this.updateState({ speaking: true, paused: false });
    utterance.onend = () => this.updateState({ speaking: false, paused: false });
    utterance.onerror = () => this.updateState({ speaking: false, paused: false });
    utterance.onpause = () => this.updateState({ paused: true });
    utterance.onresume = () => this.updateState({ paused: false });

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  pause(): void {
    if (!SpeechSynthesizer.isSupported()) return;
    window.speechSynthesis.pause();
    this.updateState({ paused: true });
  }

  resume(): void {
    if (!SpeechSynthesizer.isSupported()) return;
    window.speechSynthesis.resume();
    this.updateState({ paused: false });
  }

  cancel(): void {
    if (!SpeechSynthesizer.isSupported()) return;
    window.speechSynthesis.cancel();
    this.updateState({ speaking: false, paused: false });
  }

  setDefaults(options: TTSOptions): void {
    this.defaultOptions = { ...options };
  }

  getState(): TTSState {
    return this.state;
  }

  subscribe(listener: (s: TTSState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    this.cancel();
    if (this.voicesChangedHandler && SpeechSynthesizer.isSupported()) {
      window.speechSynthesis.removeEventListener("voiceschanged", this.voicesChangedHandler);
      this.voicesChangedHandler = null;
    }
    this.listeners.clear();
  }

  private loadVoices(): void {
    const voices = window.speechSynthesis.getVoices();
    this.updateState({ voices, voicesLoaded: voices.length > 0 });
  }

  private resolveVoice(opts: TTSOptions): SpeechSynthesisVoice | undefined {
    if (opts.voice) return opts.voice;
    const voices = this.state.voices;
    if (opts.voiceURI) {
      const matched = voices.find((v) => v.voiceURI === opts.voiceURI);
      if (matched) return matched;
    }
    if (opts.preferVoiceNames?.length) {
      const langPrefix = opts.lang?.slice(0, 2).toLowerCase();
      for (const name of opts.preferVoiceNames) {
        const needle = name.toLowerCase();
        const matched = voices.find(
          (v) =>
            (!langPrefix || v.lang.toLowerCase().startsWith(langPrefix)) &&
            v.name.toLowerCase().includes(needle),
        );
        if (matched) return matched;
      }
    }
    return undefined;
  }

  pickVoice(opts: TTSOptions): SpeechSynthesisVoice | undefined {
    return this.resolveVoice({ ...this.defaultOptions, ...opts });
  }

  private updateState(patch: Partial<TTSState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }
}
