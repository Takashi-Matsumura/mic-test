import { MicTranscriber } from "./mic-transcriber";

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-slate-950 dark:via-zinc-950 dark:to-indigo-950">
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-indigo-300/30 blur-3xl dark:bg-indigo-600/20" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-fuchsia-300/30 blur-3xl dark:bg-fuchsia-600/20" />
      <div className="pointer-events-none absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-600/10" />

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 sm:py-14">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/40">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </span>
            <div>
              <h1 className="bg-gradient-to-r from-zinc-900 to-zinc-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent dark:from-zinc-50 dark:to-zinc-400">
                マイク入力テスト
              </h1>
              <p className="mt-0.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Shokz OpenFit 2+ × Web Speech API
              </p>
            </div>
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            ブラウザのマイクから音声を取得し、リアルタイムで文字起こしします。
            Bluetooth デバイスの物理ボタンを使えば、完全ハンズフリーで録音の ON/OFF を操作できます。
          </p>
        </header>

        <MicTranscriber />

        <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-200/60 pt-5 text-xs text-zinc-500 dark:border-zinc-800/60 dark:text-zinc-500">
          <span>Web Speech API</span>
          <span aria-hidden>•</span>
          <span>Media Session API</span>
          <span aria-hidden>•</span>
          <span>Chrome / Edge / Safari</span>
        </footer>
      </main>
    </div>
  );
}
