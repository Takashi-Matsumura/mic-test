# mic-test

Bluetooth デバイスの物理ボタンで操作できる、ハンズフリー音声文字起こしテストアプリ。
**Shokz OpenFit 2+** での動作確認済み。

工場ライン作業者がイヤホンマイクを装着したまま、両手を作業に使いながら音声入力できることを目指しています。

## 主な機能

- **リアルタイム文字起こし** — Web Speech API による日本語 / 英語の音声認識
- **4 つの入力モード** — シーンに応じて切替可能
  - **手動** — 画面のボタンをクリック
  - **Push-to-talk** — `Space` キーを押している間だけ録音
  - **ウェイクワード** — 「記録開始 / 以上」などの発話で ON/OFF
  - **メディアキー（BT デバイス）** — Bluetooth イヤホンの物理ボタンで ON/OFF ★
- **完全ハンズフリー** — メディアキーモードでは BT デバイスのシングル / ダブル / トリプルクリックで操作
- **読み上げ (TTS)** — 文字起こし結果を Web Speech Synthesis で読み上げ。音声・速度をカスタマイズ可能

## アーキテクチャ

```
lib/
├── openfit/                 ← BT メディアキー連携ライブラリ
│   ├── index.ts             公開エントリ
│   ├── types.ts             型定義
│   ├── controller.ts        フレームワーク非依存コア (OpenFitController class)
│   └── react.ts             React hook (useOpenFit)
└── tts/                     ← テキスト読み上げライブラリ
    ├── index.ts             公開エントリ
    ├── types.ts             型定義
    ├── synthesizer.ts       フレームワーク非依存コア (SpeechSynthesizer class)
    └── react.ts             React hook (useSpeechSynthesis)

app/
├── page.tsx                 トップページ
└── mic-transcriber.tsx      ライブラリを利用するデモアプリ
```

各ライブラリは他の Web アプリにも組み込めるように、フレームワーク非依存のコアと React 用 hook を分離しています。

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開く。

## 他の Next.js プロジェクトで使う

npm publish せずに、GitHub から直接インストールして使えます。

### 1. 利用側プロジェクトでインストール

```bash
npm install github:Takashi-Matsumura/mic-test
```

特定のコミット / タグを指定する場合:

```bash
npm install github:Takashi-Matsumura/mic-test#main
npm install github:Takashi-Matsumura/mic-test#v0.1.0
```

### 2. `next.config.ts` で transpile を有効化

TypeScript のソースを直接配布しているので、Next.js 側で transpile が必要です。

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["mic-test"],
};

export default nextConfig;
```

### 3. インポートして使う

```tsx
"use client";

import { useOpenFit } from "mic-test/openfit";

export function MyComponent() {
  const openfit = useOpenFit({
    metadata: { title: "My App" },
    onPlayPause: () => console.log("シングルクリック"),
    onNext: () => console.log("ダブルクリック"),
    onPrevious: () => console.log("トリプルクリック"),
  });

  return (
    <button onClick={openfit.enabled ? openfit.disable : openfit.enable}>
      {openfit.enabled ? "解除" : "メディアキー連携を有効化"}
    </button>
  );
}
```

利用可能なエントリポイント:

OpenFit (BT メディアキー連携):
- `mic-test/openfit` — 全部入り（推奨）
- `mic-test/openfit/react` — React hook のみ
- `mic-test/openfit/controller` — フレームワーク非依存コアのみ
- `mic-test/openfit/types` — 型定義のみ

TTS (テキスト読み上げ):
- `mic-test/tts` — 全部入り（推奨）
- `mic-test/tts/react` — React hook のみ
- `mic-test/tts/synthesizer` — フレームワーク非依存コアのみ
- `mic-test/tts/types` — 型定義のみ

### TTS の使用例

```tsx
"use client";
import { useSpeechSynthesis } from "mic-test/tts";

export function SpeakerButton({ text }: { text: string }) {
  const tts = useSpeechSynthesis({
    lang: "ja-JP",
    preferVoiceNames: ["Google", "Kyoko"],  // 優先順位順に voice 名を指定
    rate: 1.0,
  });

  if (!tts.isSupported) return null;

  return (
    <>
      <button onClick={() => tts.speak(text)} disabled={tts.speaking}>
        🔊 読み上げ
      </button>
      {tts.speaking && (
        <button onClick={tts.cancel}>⏹ 停止</button>
      )}
    </>
  );
}
```

`preferVoiceNames` に voice 名（部分一致、大文字小文字無視）を優先順位順で渡せば、`speak()` で voice を明示しなくても自動選択されます。Chrome で「Google 日本語」を、Safari なら「Kyoko」をフォールバック、といった指定が可能。

#### voice を明示したいとき

```tsx
// SpeechSynthesisVoice インスタンスを直接指定
tts.speak("こんにちは", { voice: myVoice });

// または voiceURI（state に保存しやすい文字列）で指定
tts.speak("こんにちは", { voiceURI: "Google 日本語" });

// 利用可能な voices 一覧
tts.voices;          // SpeechSynthesisVoice[]
tts.voicesLoaded;    // 読み込み完了したか

// hook の defaults でどの voice が選ばれるかを事前に確認
const resolved = tts.pickVoice();                                  // defaults ベース
const ja = tts.pickVoice({ lang: "ja", preferVoiceNames: ["Google"] });  // ad-hoc
```

### 更新の取り込み方

最新版に追従するには:

```bash
npm install github:Takashi-Matsumura/mic-test
```

を再実行。package-lock.json の sha が更新されます。

## ライブラリの使い方（このリポジトリ内で）

このリポジトリ内のコードから利用する場合:

```tsx
import { useOpenFit } from "@/lib/openfit";

function App() {
  const openfit = useOpenFit({
    metadata: { title: "My App" },
    onPlayPause: () => console.log("シングルクリック"),
    onNext:      () => console.log("ダブルクリック"),
    onPrevious:  () => console.log("トリプルクリック"),
  });

  return (
    <button onClick={openfit.enabled ? openfit.disable : openfit.enable}>
      {openfit.enabled ? "解除" : "メディアキー連携を有効化"}
    </button>
  );
}
```

React 以外（Vue / Svelte / Vanilla JS）からは `OpenFitController` クラスを直接利用可能:

```ts
import { OpenFitController } from "@/lib/openfit";

const c = new OpenFitController({
  onPlayPause: () => { /* ... */ },
});
const unsub = c.subscribe((state) => console.log(state));
await c.enable();
// ...
c.destroy();
```

### 仕組み

1. `enable()` で**無音 WAV をループ再生**し、ブラウザのタブをメディアセッションのオーナーにする
2. `navigator.mediaSession.setActionHandler()` で `play / pause / nexttrack / previoustrack / stop` を購読
3. Bluetooth デバイスのボタン操作が AVRCP コマンドとしてブラウザに届く

Shokz OpenFit 2+ のデフォルト設定:

| 操作 | AVRCP | ハンドラ |
|---|---|---|
| シングルクリック | play / pause | `onPlayPause` |
| ダブルクリック | nexttrack | `onNext` |
| トリプルクリック | previoustrack | `onPrevious` |

音量ボタンは OS が消費するため Web からは受信できません。

## 動作環境

- **Chrome / Edge / Safari** — Web Speech API + Media Session API が利用可能
- **Firefox** — Web Speech API 非対応のため未サポート

## 技術スタック

- [Next.js 16](https://nextjs.org/) (App Router)
- [React 19](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- TypeScript

## ライセンス

[MIT License](./LICENSE) © Takashi Matsumura

依存ライブラリ（Next.js / React / Tailwind CSS など）はすべて MIT または MIT 互換ライセンスです。
