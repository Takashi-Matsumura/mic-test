"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OpenFitController } from "./controller";
import type { OpenFitControllerOptions, OpenFitState } from "./types";

const INITIAL_STATE: OpenFitState = {
  enabled: false,
  audioElapsed: 0,
  lastAction: null,
  lastActionAt: null,
};

export function useOpenFit(options: OpenFitControllerOptions) {
  const { onPlayPause, onNext, onPrevious, onStop } = options;
  const title = options.metadata?.title;
  const artist = options.metadata?.artist;
  const album = options.metadata?.album;

  const [state, setState] = useState<OpenFitState>(INITIAL_STATE);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<OpenFitController | null>(null);

  const isSupported = useSyncExternalStore(
    () => () => {},
    () => OpenFitController.isSupported(),
    () => false,
  );

  useEffect(() => {
    if (!OpenFitController.isSupported()) return;
    const controller = new OpenFitController();
    controllerRef.current = controller;
    const unsub = controller.subscribe(setState);
    return () => {
      unsub();
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setHandlers({ onPlayPause, onNext, onPrevious, onStop });
  }, [onPlayPause, onNext, onPrevious, onStop]);

  useEffect(() => {
    controllerRef.current?.setMetadata({ title, artist, album });
  }, [title, artist, album]);

  const enable = useCallback(async () => {
    setError(null);
    try {
      await controllerRef.current?.enable();
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  const disable = useCallback(() => {
    controllerRef.current?.disable();
  }, []);

  return {
    isSupported,
    enabled: state.enabled,
    audioElapsed: state.audioElapsed,
    lastAction: state.lastAction,
    lastActionAt: state.lastActionAt,
    enable,
    disable,
    error,
  };
}
