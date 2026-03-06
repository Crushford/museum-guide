'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';

export type HowlerAudioStatus = 'idle' | 'loading' | 'ready' | 'invalid';

type HowlerAudioOptions = {
  src: string | null;
  onPauseProgress?: (seconds: number) => void;
  onPlaybackComplete?: (durationSeconds: number) => void;
  onInvalid?: () => void;
};

type UseHowlerAudioResult = {
  status: HowlerAudioStatus;
  isPlaying: boolean;
  durationSeconds: number | null;
  togglePlayback: () => void;
  stop: () => void;
};

export function useHowlerAudio({
  src,
  onPauseProgress,
  onPlaybackComplete,
  onInvalid,
}: HowlerAudioOptions): UseHowlerAudioResult {
  const howlRef = useRef<Howl | null>(null);
  const onPauseProgressRef = useRef(onPauseProgress);
  const onPlaybackCompleteRef = useRef(onPlaybackComplete);
  const onInvalidRef = useRef(onInvalid);

  const [status, setStatus] = useState<HowlerAudioStatus>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);

  useEffect(() => {
    onPauseProgressRef.current = onPauseProgress;
  }, [onPauseProgress]);

  useEffect(() => {
    onPlaybackCompleteRef.current = onPlaybackComplete;
  }, [onPlaybackComplete]);

  useEffect(() => {
    onInvalidRef.current = onInvalid;
  }, [onInvalid]);

  useEffect(() => {
    const previousHowl = howlRef.current;
    if (previousHowl) {
      previousHowl.stop();
      previousHowl.unload();
      howlRef.current = null;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(false);
    setDurationSeconds(null);
    setStatus(src ? 'loading' : 'idle');

    if (!src) {
      return;
    }

    const nextHowl = new Howl({
      src: [src],
      html5: true,
      preload: true,
      onload: () => {
        const duration = nextHowl.duration();
        if (Number.isFinite(duration) && duration > 0) {
          setDurationSeconds(duration);
          setStatus('ready');
          return;
        }
        setStatus('invalid');
        onInvalidRef.current?.();
      },
      onloaderror: () => {
        setStatus('invalid');
        onInvalidRef.current?.();
      },
      onplay: () => setIsPlaying(true),
      onpause: (soundId) => {
        setIsPlaying(false);
        const seekPosition = nextHowl.seek(soundId);
        const positionSeconds =
          typeof seekPosition === 'number' ? seekPosition : 0;
        onPauseProgressRef.current?.(positionSeconds);
      },
      onstop: () => setIsPlaying(false),
      onend: () => {
        setIsPlaying(false);
        onPlaybackCompleteRef.current?.(nextHowl.duration() || 0);
      },
      onplayerror: () => setIsPlaying(false),
    });

    howlRef.current = nextHowl;

    return () => {
      nextHowl.stop();
      nextHowl.unload();
      if (howlRef.current === nextHowl) {
        howlRef.current = null;
      }
    };
  }, [src]);

  const togglePlayback = useCallback(() => {
    const currentHowl = howlRef.current;
    if (!currentHowl || status !== 'ready') return;

    if (currentHowl.playing()) {
      currentHowl.pause();
      return;
    }

    void currentHowl.play();
  }, [status]);

  const stop = useCallback(() => {
    howlRef.current?.stop();
  }, []);

  return {
    status,
    isPlaying,
    durationSeconds,
    togglePlayback,
    stop,
  };
}
