export type OpenFitAction = "playpause" | "next" | "previous" | "stop";

export interface OpenFitHandlers {
  onPlayPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onStop?: () => void;
}

export interface OpenFitMetadata {
  title?: string;
  artist?: string;
  album?: string;
}

export interface OpenFitControllerOptions extends OpenFitHandlers {
  metadata?: OpenFitMetadata;
}

export interface OpenFitState {
  enabled: boolean;
  audioElapsed: number;
  lastAction: OpenFitAction | null;
  lastActionAt: number | null;
}
