'use client';

import { useCallback, useMemo, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/ui/error-text';
import { ExpandableText } from '@/components/ui/expandable-text';
import { BodyText } from '@/components/ui/body-text';
import { InfoBox } from '@/components/ui/info-box';
import { HowlerAudioPlayer, SectionCard } from '@/components/shared';
import { API_URL } from '@/lib/api';
import { useIntroductionGeneration } from '@/hooks/useIntroductionGeneration';
import type { HowlerAudioStatus } from '@/hooks/useHowlerAudio';
import type { ContentItem } from '@/lib/types';

interface ArtifactIntroductionProps {
  artifactId: number;
  initialContent: ContentItem | null;
  onContentGenerated?: (content: ContentItem) => void;
}

export function ArtifactIntroduction({
  artifactId,
  initialContent,
  onContentGenerated,
}: ArtifactIntroductionProps) {
  const [audioStatus, setAudioStatus] = useState<HowlerAudioStatus>('idle');
  const [audioReloadToken, setAudioReloadToken] = useState(0);

  const {
    content,
    isGenerating,
    isRetryingAudio,
    streamingText,
    statusMessage,
    error,
    generate,
    retryAudio,
  } = useIntroductionGeneration({
    artifactId,
    initialContent,
    onContentGenerated,
  });

  const audioSrc = useMemo(() => {
    if (!content?.audioUrl) return null;
    const base = `${API_URL}${content.audioUrl}`;
    const separator = content.audioUrl.includes('?') ? '&' : '?';
    return `${base}${separator}v=${audioReloadToken}`;
  }, [audioReloadToken, content?.audioUrl]);

  const handleRegenerateAudio = useCallback(async () => {
    const succeeded = await retryAudio();
    if (succeeded) {
      setAudioStatus('loading');
      setAudioReloadToken((current) => current + 1);
    }
  }, [retryAudio]);

  const shouldShowRegenerateAudio =
    !content?.audioUrl || audioStatus === 'invalid';

  // Show streaming UI when generating (before we have final content)
  if (isGenerating && !content) {
    return (
      <SectionCard title="Introduction">
        <div className="space-y-4">
          {error && <ErrorText>{error}</ErrorText>}

          {/* Status indicator */}
          <InfoBox>
            <Spinner size="md" className="text-primary shrink-0" />
            <div>
              <p className="text-primary font-medium">{statusMessage}</p>
            </div>
          </InfoBox>
          {streamingText && (
            <div className="relative">
              <BodyText wrap>
                {streamingText}
                <span className="inline-block w-2 h-5 bg-primary animate-pulse ml-1" />
              </BodyText>
            </div>
          )}
        </div>
      </SectionCard>
    );
  }

  // No content yet - show generate button
  if (!content) {
    return (
      <SectionCard title="Introduction">
        <div className="space-y-4">
          {error && <ErrorText>{error}</ErrorText>}
          <p className="text-muted-foreground">
            No introduction has been generated for this artifact yet.
          </p>
          <Button onClick={generate}>Generate Introduction</Button>
        </div>
      </SectionCard>
    );
  }

  // Content exists - show it with audio controls
  return (
    <SectionCard title="Introduction">
      <div className="space-y-4">
        {error && <ErrorText>{error}</ErrorText>}

        {/* Audio Player */}
        {content.audioUrl && !shouldShowRegenerateAudio && (
          <InfoBox>
            <Volume2 className="h-5 w-5 text-primary shrink-0" />
            <HowlerAudioPlayer
              src={audioSrc}
              onStatusChange={setAudioStatus}
              playLabel="Play audio"
              pauseLabel="Pause audio"
            />
          </InfoBox>
        )}
        {shouldShowRegenerateAudio && (
          <InfoBox>
            <p className="text-sm text-muted-foreground">
              Audio is unavailable for this introduction.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRegenerateAudio}
              disabled={isRetryingAudio}
            >
              {isRetryingAudio && <Spinner size="xs" />}
              {isRetryingAudio ? 'Regenerating audio...' : 'Regenerate audio'}
            </Button>
          </InfoBox>
        )}

        {/* Introduction Text */}
        <ExpandableText
          text={content.text}
          lines={3}
          className="text-primary"
        />
      </div>
    </SectionCard>
  );
}
