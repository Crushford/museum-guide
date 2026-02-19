'use client';

import { Volume2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/ui/error-text';
import { ExpandableText } from '@/components/ui/expandable-text';
import { SectionCard } from '@/components/shared';
import { API_URL } from '@/lib/api';
import { useIntroductionGeneration } from '@/hooks/useIntroductionGeneration';
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

  // Show streaming UI when generating (before we have final content)
  if (isGenerating && !content) {
    return (
      <SectionCard title="Introduction">
        <div className="space-y-4">
          {error && <ErrorText>{error}</ErrorText>}

          {/* Status indicator */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Spinner size="md" className="text-primary shrink-0" />
            <div>
              <p className="text-primary font-medium">{statusMessage}</p>
            </div>
          </div>
          {streamingText && (
            <div className="relative">
              <p className="text-primary leading-relaxed whitespace-pre-wrap">
                {streamingText}
                <span className="inline-block w-2 h-5 bg-primary animate-pulse ml-1" />
              </p>
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
        {content.audioUrl && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Volume2 className="h-5 w-5 text-primary shrink-0" />
            <audio
              controls
              src={`${API_URL}${content.audioUrl}`}
              className="w-full h-10"
            >
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
        {!content.audioUrl && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground">
              Audio is unavailable for this introduction.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={retryAudio}
              disabled={isRetryingAudio}
            >
              {isRetryingAudio ? 'Retrying audio...' : 'Retry audio'}
            </Button>
          </div>
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
