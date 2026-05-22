"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useOpenFit } from "@/lib/openfit";
import { useSpeechSynthesis } from "@/lib/tts";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
  message?: string;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Mode = "manual" | "ptt" | "wakeword" | "mediakey";

const START_PHRASES = [
  "記録開始",
  "録音開始",
  "きろくかいし",
  "ろくおんかいし",
  "スタート",
  "開始",
];

const END_PHRASES = [
  "記録終了",
  "録音終了",
  "きろくしゅうりょう",
  "ろくおんしゅうりょう",
  "以上",
  "いじょう",
  "終わり",
  "おわり",
  "終了",
  "しゅうりょう",
  "ストップ",
];

function normalize(text: string): string {
  return text.replace(/[\s、。!?！？・,.\-]/g, "").toLowerCase();
}

function findPhrase(text: string, phrases: string[]): string | null {
  const n = normalize(text);
  for (const p of phrases) {
    if (n.includes(normalize(p))) return p;
  }
  return null;
}

export function MicTranscriber() {
  const [mode, setMode] = useState<Mode>("manual");
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState("ja-JP");
  const [pttPressed, setPttPressed] = useState(false);
  const [lastWakeEvent, setLastWakeEvent] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const modeRef = useRef<Mode>("manual");
  const listeningRef = useRef(false);
  const recordingRef = useRef(false);
  const langRef = useRef(lang);
  const wantsRunningRef = useRef(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);
  useEffect(() => { langRef.current = lang; }, [lang]);

  const stopRecognition = useCallback(() => {
    wantsRunningRef.current = false;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    recognitionRef.current?.stop();
  }, []);

  const startRecognition = useCallback(() => {
    setError(null);
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("このブラウザは Web Speech API に対応していません。Chrome / Edge / Safari をお試しください。");
      return;
    }
    if (listeningRef.current) return;

    const spawn = () => {
      const recognition = new Ctor();
      recognition.lang = langRef.current;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setListening(true);
        if (modeRef.current !== "wakeword") setRecording(true);
      };

      recognition.onresult = (event) => {
        let interim = "";
        let appended = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;

          if (modeRef.current === "wakeword") {
            if (result.isFinal) {
              if (!recordingRef.current) {
                const matched = findPhrase(transcript, START_PHRASES);
                if (matched) {
                  setRecording(true);
                  setLastWakeEvent(`▶︎ 開始ワード検出: 「${matched}」`);
                }
              } else {
                const matched = findPhrase(transcript, END_PHRASES);
                if (matched) {
                  setRecording(false);
                  setLastWakeEvent(`■ 終了ワード検出: 「${matched}」`);
                } else {
                  appended += transcript;
                }
              }
            } else {
              if (recordingRef.current) interim += transcript;
            }
          } else {
            if (result.isFinal) appended += transcript;
            else interim += transcript;
          }
        }

        if (appended) setFinalText((prev) => prev + appended);
        setInterimText(interim);
      };

      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        setError(`エラー: ${event.error}${event.message ? ` (${event.message})` : ""}`);
      };

      recognition.onend = () => {
        setListening(false);
        setInterimText("");
        if (modeRef.current !== "wakeword") setRecording(false);

        if (wantsRunningRef.current) {
          restartTimerRef.current = window.setTimeout(() => {
            restartTimerRef.current = null;
            if (wantsRunningRef.current) spawn();
          }, 250);
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (e) {
        setError(`開始に失敗しました: ${(e as Error).message}`);
      }
    };

    wantsRunningRef.current = true;
    spawn();
  }, []);

  useEffect(() => {
    return () => {
      wantsRunningRef.current = false;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      recognitionRef.current?.abort();
    };
  }, []);

  const toggleRecording = useCallback(() => {
    if (recordingRef.current) {
      stopRecognition();
      setRecording(false);
    } else {
      startRecognition();
    }
  }, [startRecognition, stopRecognition]);

  const stopAndReset = useCallback(() => {
    stopRecognition();
    setRecording(false);
  }, [stopRecognition]);

  const clearText = useCallback(() => {
    setFinalText("");
    setInterimText("");
  }, []);

  const openfit = useOpenFit({
    metadata: { title: "マイク入力テスト", artist: "BT デバイス連携中", album: "Mic Test" },
    onPlayPause: toggleRecording,
    onNext: clearText,
    onPrevious: stopAndReset,
  });

  useEffect(() => {
    if (mode !== "ptt") return;

    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      setPttPressed(true);
      if (!listeningRef.current) startRecognition();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      setPttPressed(false);
      if (listeningRef.current) stopRecognition();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [mode, startRecognition, stopRecognition]);

  const onMainButton = () => {
    if (mode === "wakeword") {
      setRecording((prev) => {
        setLastWakeEvent(prev ? "■ 手動で停止" : "▶︎ 手動で開始");
        return !prev;
      });
      return;
    }
    if (listening) stopRecognition();
    else startRecognition();
  };

  const clear = () => {
    setFinalText("");
    setInterimText("");
    setError(null);
  };

  const [userSelectedVoiceURI, setUserSelectedVoiceURI] = useState<string | null>(null);
  const [rate, setRate] = useState(1.0);
  const tts = useSpeechSynthesis({
    lang: "ja-JP",
    preferVoiceNames: ["Google"],
    rate,
  });

  const japaneseVoices = useMemo(
    () => tts.voices.filter((v) => v.lang.startsWith("ja")),
    [tts.voices],
  );
  const selectableVoices = japaneseVoices.length > 0 ? japaneseVoices : tts.voices;
  const autoVoice = tts.pickVoice();
  const selectedVoiceURI =
    userSelectedVoiceURI ?? autoVoice?.voiceURI ?? selectableVoices[0]?.voiceURI ?? "";

  const speakFinalText = () => {
    if (!finalText.trim()) return;
    if (userSelectedVoiceURI) {
      tts.speak(finalText, { voiceURI: userSelectedVoiceURI });
    } else {
      tts.speak(finalText);
    }
  };

  const effectiveError = error ?? openfit.error?.message ?? null;

  const mainButtonLabel = () => {
    if (mode === "wakeword") return recording ? "■ 停止（手動）" : "● 開始（手動）";
    return listening ? "■ 停止" : "● 録音開始";
  };

  const statusLabel = () => {
    if (mode === "wakeword") {
      if (!listening) return "起動準備中…";
      if (recording) return "● 記録中…マイクに向かって話してください";
      return "待機中…「記録開始」と発話してください";
    }
    if (mode === "mediakey") {
      if (recording) return "● 録音中…マイクに向かって話してください";
      return openfit.enabled
        ? "待機中…BT デバイスのボタンをクリックで開始"
        : "待機中（「メディアキー連携を有効化」を押してください）";
    }
    return listening ? "録音中…マイクに向かって話してください" : "待機中";
  };

  const onModeChange = (m: Mode) => {
    stopRecognition();
    openfit.disable();
    setMode(m);
    setRecording(false);
    setLastWakeEvent(null);
    setInterimText("");
    (document.activeElement as HTMLElement | null)?.blur();
    if (m === "wakeword") startRecognition();
  };

  const mainButtonDisabled = mode === "ptt";
  const hasText = Boolean(finalText || interimText);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="rounded-2xl border border-zinc-200/60 bg-white/70 p-1.5 shadow-sm backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-900/70">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {MODES.map((m) => {
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => onModeChange(m.value)}
                className={`group flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center transition-all ${
                  active
                    ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30"
                    : "text-zinc-600 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:bg-zinc-800/80"
                }`}
              >
                <m.icon className="h-4 w-4" />
                <span className="text-[10px] font-medium leading-tight sm:text-xs">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-zinc-200/60 bg-white/80 px-6 py-10 shadow-xl shadow-zinc-900/5 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-900/70 dark:shadow-black/30">
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-1 transition-colors ${
            recording
              ? "bg-gradient-to-r from-red-500 via-rose-500 to-pink-500"
              : listening
              ? "bg-gradient-to-r from-amber-400 to-orange-500"
              : "bg-gradient-to-r from-indigo-400 to-purple-500"
          }`}
        />

        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            {recording && (
              <>
                <span className="pointer-events-none absolute inset-0 -m-3 animate-ping rounded-full bg-red-500/30" />
                <span
                  className="pointer-events-none absolute inset-0 -m-6 animate-ping rounded-full bg-red-500/15"
                  style={{ animationDelay: "0.4s" }}
                />
              </>
            )}
            <button
              onClick={onMainButton}
              disabled={mainButtonDisabled}
              aria-label={mainButtonLabel()}
              className={`relative flex h-36 w-36 items-center justify-center rounded-full text-white shadow-2xl transition-all hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
                recording
                  ? "bg-gradient-to-br from-red-500 via-rose-500 to-pink-600 shadow-red-500/40"
                  : "bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 shadow-emerald-500/40"
              }`}
            >
              {recording ? <StopIcon /> : <MicLargeIcon />}
            </button>
          </div>

          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {statusLabel()}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              {MODES.find((m) => m.value === mode)?.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={clear}
              disabled={listening || recording || (!hasText && !error)}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              クリア
            </button>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <GlobeIcon className="h-3.5 w-3.5" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                disabled={listening}
                className="bg-transparent text-xs font-medium outline-none disabled:opacity-50"
              >
                <option value="ja-JP">日本語</option>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {mode === "ptt" && (
        <SectionCard tone="emerald" icon={<KeyboardIcon className="h-4 w-4" />} title="Push-to-talk">
          <div className="flex items-center gap-3">
            <kbd
              className={`rounded-lg border px-4 py-1.5 font-mono text-sm font-medium transition-all ${
                pttPressed
                  ? "border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
                  : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              Space
            </kbd>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {pttPressed ? "押下中" : "押している間だけ録音します"}
            </span>
          </div>
        </SectionCard>
      )}

      {mode === "wakeword" && (
        <SectionCard tone="amber" icon={<SparklesIcon className="h-4 w-4" />} title="ウェイクワード">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                開始ワード
              </div>
              <div className="flex flex-wrap gap-1">
                {START_PHRASES.map((p) => (
                  <span key={p} className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[11px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                終了ワード
              </div>
              <div className="flex flex-wrap gap-1">
                {END_PHRASES.map((p) => (
                  <span key={p} className="rounded-full bg-rose-100 px-2 py-0.5 font-mono text-[11px] text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-zinc-200/60 pt-2 text-xs text-zinc-500 dark:border-zinc-800/60 dark:text-zinc-500">
            最後のイベント: <span className="font-mono">{lastWakeEvent ?? "（まだ無し）"}</span>
          </div>
        </SectionCard>
      )}

      {mode === "mediakey" && (
        <SectionCard tone="indigo" icon={<BluetoothIcon className="h-4 w-4" />} title="メディアキー連携">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={openfit.enabled ? openfit.disable : openfit.enable}
              disabled={!openfit.isSupported}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium shadow-sm transition-all disabled:opacity-50 ${
                openfit.enabled
                  ? "bg-zinc-800 text-white hover:bg-zinc-900 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-100"
                  : "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-indigo-500/30 hover:from-indigo-600 hover:to-purple-700"
              }`}
            >
              {openfit.enabled ? (
                <>
                  <PowerIcon className="h-3.5 w-3.5" /> 連携を解除
                </>
              ) : (
                <>
                  <BluetoothIcon className="h-3.5 w-3.5" /> メディアキー連携を有効化
                </>
              )}
            </button>
            {openfit.enabled && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
                無音再生中 {openfit.audioElapsed}s
              </span>
            )}
            {!openfit.isSupported && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Media Session API 非対応
              </span>
            )}
          </div>

          <div className="mt-3 grid gap-1.5 text-xs sm:grid-cols-3">
            <ActionRow
              icon={<MouseClickIcon className="h-3.5 w-3.5" />}
              gesture="シングルクリック"
              action="録音 ON / OFF"
            />
            <ActionRow
              icon={<MouseClickIcon className="h-3.5 w-3.5" />}
              gesture="ダブルクリック"
              action="テキストをクリア"
            />
            <ActionRow
              icon={<MouseClickIcon className="h-3.5 w-3.5" />}
              gesture="トリプルクリック"
              action="強制停止"
            />
          </div>

          <div className="mt-3 border-t border-zinc-200/60 pt-2 text-xs text-zinc-500 dark:border-zinc-800/60 dark:text-zinc-500">
            最後のイベント:{" "}
            <span className="font-mono">
              {openfit.lastAction
                ? `${openfit.lastAction}${openfit.lastActionAt ? ` @ ${new Date(openfit.lastActionAt).toLocaleTimeString()}` : ""}`
                : "（まだ無し）"}
            </span>
          </div>

          {openfit.enabled && (
            <details className="mt-3 group">
              <summary className="cursor-pointer text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-400">
                動かない場合のチェックリスト
              </summary>
              <ul className="mt-2 ml-5 list-disc space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                <li>macOS のコントロールセンター「再生中」にこのタブが表示されているか</li>
                <li>他のメディアアプリ (Spotify / YouTube 等) は停止されているか</li>
                <li>OpenFit 2+ が他端末と同時接続されていないか（マルチポイント）</li>
                <li>Shokz アプリでシングルクリックが「再生/一時停止」のままか</li>
              </ul>
            </details>
          )}
        </SectionCard>
      )}

      {effectiveError && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-800 shadow-sm backdrop-blur-sm dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{effectiveError}</span>
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl border border-zinc-200/60 bg-white/80 shadow-xl shadow-zinc-900/5 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-900/70 dark:shadow-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/60 px-5 py-3 dark:border-zinc-800/60">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            <DocumentIcon className="h-3.5 w-3.5" />
            文字起こし結果
          </div>

          <div className="flex items-center gap-2">
            {tts.isSupported && (
              <>
                {!tts.speaking && (
                  <button
                    onClick={speakFinalText}
                    disabled={!finalText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 px-3 py-1 text-xs font-medium text-white shadow-sm shadow-indigo-500/30 transition-all hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 disabled:shadow-none"
                  >
                    <SpeakerIcon className="h-3.5 w-3.5" />
                    読み上げ
                  </button>
                )}
                {tts.speaking && !tts.paused && (
                  <button
                    onClick={tts.pause}
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white shadow-sm transition-all hover:bg-amber-600"
                  >
                    <PauseIcon className="h-3.5 w-3.5" />
                    一時停止
                  </button>
                )}
                {tts.paused && (
                  <button
                    onClick={tts.resume}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-600"
                  >
                    <PlayIcon className="h-3.5 w-3.5" />
                    再開
                  </button>
                )}
                {tts.speaking && (
                  <button
                    onClick={tts.cancel}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    <StopSmallIcon className="h-3.5 w-3.5" />
                    停止
                  </button>
                )}
              </>
            )}

            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  recording ? "animate-pulse bg-red-500" : listening ? "bg-amber-400" : "bg-zinc-400"
                }`}
              />
              <span className="text-zinc-500">
                {recording ? "Recording" : listening ? "Listening" : "Idle"}
              </span>
            </div>
          </div>
        </div>

        {tts.isSupported && (
          <details className="border-b border-zinc-200/60 px-5 dark:border-zinc-800/60">
            <summary className="cursor-pointer py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
              読み上げ設定
            </summary>
            <div className="grid gap-3 pb-3 pt-1 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">音声</span>
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => setUserSelectedVoiceURI(e.target.value)}
                  disabled={!tts.voicesLoaded}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {!tts.voicesLoaded && <option>読み込み中…</option>}
                  {selectableVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="flex items-center justify-between font-medium text-zinc-600 dark:text-zinc-400">
                  <span>速度</span>
                  <span className="font-mono text-zinc-500">{rate.toFixed(1)}x</span>
                </span>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={rate}
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  className="accent-indigo-500"
                />
              </label>
            </div>
          </details>
        )}

        <div className="min-h-[220px] p-6">
          {hasText ? (
            <p className="whitespace-pre-wrap text-lg leading-relaxed">
              <span className="text-zinc-900 dark:text-zinc-100">{finalText}</span>
              <span className="text-zinc-400 italic dark:text-zinc-500">{interimText}</span>
            </p>
          ) : (
            <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center">
              <WaveformIcon className="h-10 w-10 text-zinc-300 dark:text-zinc-700" />
              <p className="text-sm text-zinc-400 dark:text-zinc-600">
                ここに文字起こし結果が表示されます
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- アイコン ---

function MicLargeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-14 w-14">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-12 w-12">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function KeyboardIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  );
}

function SparklesIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  );
}

function BluetoothIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m7 7 10 10-5 5V2l5 5L7 17" />
    </svg>
  );
}

function HandIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 1 0-4 0v6M10 10.5V6a2 2 0 1 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

function GlobeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" x2="22" y1="12" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PowerIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2v10M18.36 6.64a9 9 0 1 1-12.72 0" />
    </svg>
  );
}

function MouseClickIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 9h.01M15 9h.01M12 3v3M12 18v3M3 12h3M18 12h3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function AlertIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

function DocumentIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function SpeakerIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function PauseIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}

function StopSmallIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function WaveformIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="2" y1="12" x2="2" y2="12" />
      <line x1="6" y1="8" x2="6" y2="16" />
      <line x1="10" y1="4" x2="10" y2="20" />
      <line x1="14" y1="6" x2="14" y2="18" />
      <line x1="18" y1="10" x2="18" y2="14" />
      <line x1="22" y1="9" x2="22" y2="15" />
    </svg>
  );
}

// --- 補助コンポーネント ---

const MODES = [
  { value: "manual" as const, label: "手動", description: "ボタンをクリックで録音 ON/OFF", icon: HandIcon },
  { value: "ptt" as const, label: "Push-to-talk", description: "Space キーを押している間だけ録音", icon: KeyboardIcon },
  { value: "wakeword" as const, label: "ウェイクワード", description: "「記録開始 / 以上」で ON/OFF", icon: SparklesIcon },
  { value: "mediakey" as const, label: "メディアキー", description: "BT デバイスの物理ボタンで操作", icon: BluetoothIcon },
] satisfies ReadonlyArray<{
  value: Mode;
  label: string;
  description: string;
  icon: (props: { className?: string }) => ReactNode;
}>;

function SectionCard({
  tone,
  icon,
  title,
  children,
}: {
  tone: "emerald" | "amber" | "indigo";
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const accent = {
    emerald: "from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/40 dark:to-teal-950/40 border-emerald-200/60 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300",
    amber: "from-amber-50/80 to-orange-50/80 dark:from-amber-950/40 dark:to-orange-950/40 border-amber-200/60 dark:border-amber-900/60 text-amber-800 dark:text-amber-300",
    indigo: "from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/40 dark:to-purple-950/40 border-indigo-200/60 dark:border-indigo-900/60 text-indigo-800 dark:text-indigo-300",
  }[tone];

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 shadow-sm backdrop-blur-sm ${accent}`}>
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
        {icon}
        <span>{title}</span>
      </div>
      <div className="text-zinc-700 dark:text-zinc-300">{children}</div>
    </div>
  );
}

function ActionRow({
  icon,
  gesture,
  action,
}: {
  icon: ReactNode;
  gesture: string;
  action: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/60 px-2.5 py-1.5 dark:bg-zinc-900/60">
      <span className="text-zinc-500">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
          {gesture}
        </div>
        <div className="truncate text-xs text-zinc-700 dark:text-zinc-300">{action}</div>
      </div>
    </div>
  );
}
