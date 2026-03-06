'use client';

import { useEffect } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useHowlerAudio, type HowlerAudioStatus } from '@/hooks/useHowlerAudio';

type HowlerAudioPlayerProps = {
  src: string | null;
  className?: string;
  playLabel?: string;
  pauseLabel?: string;
  loadingLabel?: string;
  invalidLabel?: string;
  showDuration?: boolean;
  buttonSize?: 'sm' | 'default';
  onPauseProgress?: (seconds: number) => void;
  onPlaybackComplete?: (durationSeconds: number) => void;
  onStatusChange?: (status: HowlerAudioStatus) => void;
};

export function HowlerAudioPlayer({
  src,
  className,
  playLabel = 'Play audio',
  pauseLabel = 'Pause audio',
  loadingLabel = 'Loading audio...',
  invalidLabel = 'Audio unavailable.',
  showDuration = true,
  buttonSize = 'sm',
  onPauseProgress,
  onPlaybackComplete,
  onStatusChange,
}: HowlerAudioPlayerProps) {
  const { status, isPlaying, durationSeconds, togglePlayback } = useHowlerAudio(
    {
      src,
      onPauseProgress,
      onPlaybackComplete,
    }
  );

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  if (!src) return null;

  return (
    <div className={cn('flex w-full items-center gap-3', className)}>
      <Button
        size={buttonSize}
        variant="secondary"
        onClick={togglePlayback}
        disabled={status !== 'ready'}
      >
        {isPlaying ? <Pause /> : <Play />}
        {isPlaying ? pauseLabel : playLabel}
      </Button>

      {status === 'loading' && (
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          {loadingLabel}
        </span>
      )}

      {status === 'ready' && showDuration && durationSeconds !== null && (
        <span className="text-sm text-muted-foreground">
          {Math.round(durationSeconds)}s
        </span>
      )}

      {status === 'invalid' && (
        <span className="text-sm text-muted-foreground">{invalidLabel}</span>
      )}
    </div>
  );
}
