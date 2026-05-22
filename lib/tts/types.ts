export interface TTSOptions {
  voice?: SpeechSynthesisVoice;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface TTSState {
  speaking: boolean;
  paused: boolean;
  voices: SpeechSynthesisVoice[];
  voicesLoaded: boolean;
}
