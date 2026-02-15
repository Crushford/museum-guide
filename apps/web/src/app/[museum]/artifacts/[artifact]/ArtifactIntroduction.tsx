'use client';

import { useState, useCallback } from 'react';
import { Volume2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/ui/error-text';
import { SectionCard } from '@/components/shared';
import { API_URL } from '@/lib/api';
import { usePreferredLLMProvider } from '@/hooks/usePreferredLLMProvider';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { ContentItem } from '@/lib/types';

type GenerationStep =
  | 'idle'
  | 'loading'
  | 'generating'
  | 'saving'
  | 'audio'
  | 'done';

interface ArtifactIntroductionProps {
  artifactId: number;
  initialContent: ContentItem | null;
}

export function ArtifactIntroduction({
  artifactId,
  initialContent,
}: ArtifactIntroductionProps) {
  const authedApi = useAuthedApi();
  const [content, setContent] = useState<ContentItem | null>(initialContent);
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const preferredProvider = usePreferredLLMProvider();

  const isGenerating = generationStep !== 'idle' && generationStep !== 'done';

  const handleGenerateIntroduction = useCallback(async () => {
    setGenerationStep('loading');
    setStatusMessage('Generating introduction...');
    setError(null);

    try {
      const generated = await authedApi.post<ContentItem>(
        `/generate-content/artefact/${artifactId}?provider=${preferredProvider}`,
        { requireAdmin: true }
      );
      setContent(generated);
      setGenerationStep('done');
    } catch (err) {
      console.error('Error generating introduction:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to generate introduction'
      );
      setGenerationStep('idle');
    }
  }, [artifactId, preferredProvider, authedApi]);

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
          <Button onClick={handleGenerateIntroduction}>
            Generate Introduction
          </Button>
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

        {/* Introduction Text */}
        <p className="text-primary leading-relaxed whitespace-pre-wrap">
          {content.text}
        </p>
      </div>
    </SectionCard>
  );
}
