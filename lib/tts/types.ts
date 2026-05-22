export interface TTSOptions {
  voice?: SpeechSynthesisVoice;
  voiceURI?: string;
  preferVoiceNames?: string[];
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
