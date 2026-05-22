"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SpeechSynthesizer } from "./synthesizer";
import type { TTSOptions, TTSState } from "./types";

const INITIAL_STATE: TTSState = {
  speaking: false,
  paused: false,
  voices: [],
  voicesLoaded: false,
};

export function useSpeechSynthesis(defaults: TTSOptions = {}) {
  const { voice, voiceURI, preferVoiceNames, lang, rate, pitch, volume } = defaults;
  const preferKey = preferVoiceNames?.join("|") ?? "";
  const [state, setState] = useState<TTSState>(INITIAL_STATE);
  const synthesizerRef = useRef<SpeechSynthesizer | null>(null);

  const isSupported = useSyncExternalStore(
    () => () => {},
    () => SpeechSynthesizer.isSupported(),
    () => false,
  );

  useEffect(() => {
    if (!SpeechSynthesizer.isSupported()) return;
    const s = new SpeechSynthesizer();
    synthesizerRef.current = s;
    const unsub = s.subscribe(setState);
    return () => {
      unsub();
      s.destroy();
      synthesizerRef.current = null;
    };
  }, []);

  useEffect(() => {
    synthesizerRef.current?.setDefaults({
      voice,
      voiceURI,
      preferVoiceNames,
      lang,
      rate,
      pitch,
      volume,
    });
    // preferVoiceNames は配列参照ではなく内容で比較
  }, [voice, voiceURI, preferKey, lang, rate, pitch, volume, preferVoiceNames]);

  const pickVoice = useCallback((opts: TTSOptions = {}) => {
    return synthesizerRef.current?.pickVoice(opts);
  }, []);

  const speak = useCallback((text: string, opts?: TTSOptions) => {
    synthesizerRef.current?.speak(text, opts);
  }, []);

  const pause = useCallback(() => {
    synthesizerRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    synthesizerRef.current?.resume();
  }, []);

  const cancel = useCallback(() => {
    synthesizerRef.current?.cancel();
  }, []);

  return {
    isSupported,
    speaking: state.speaking,
    paused: state.paused,
    voices: state.voices,
    voicesLoaded: state.voicesLoaded,
    speak,
    pause,
    resume,
    cancel,
    pickVoice,
  };
}
