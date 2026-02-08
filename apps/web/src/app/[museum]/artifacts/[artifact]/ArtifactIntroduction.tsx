'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2, Volume2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/shared';
import { apiPost, API_URL } from '@/lib/api';

type ContentItem = {
  id: number;
  text: string;
  type: string | null;
  audioUrl: string | null;
};

type GenerationStep = 'idle' | 'sending-to-llm' | 'generating-audio' | 'done';

interface ArtifactIntroductionProps {
  artifactId: number;
  initialContent: ContentItem | null;
}

export function ArtifactIntroduction({
  artifactId,
  initialContent,
}: ArtifactIntroductionProps) {
  const [content, setContent] = useState<ContentItem | null>(initialContent);
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGenerating = generationStep !== 'idle' && generationStep !== 'done';

  // Simulate step progression (the API does both in one call)
  useEffect(() => {
    if (generationStep === 'sending-to-llm') {
      const timer = setTimeout(() => {
        setGenerationStep('generating-audio');
      }, 3000); // After 3 seconds, assume LLM is done and TTS is starting
      return () => clearTimeout(timer);
    }
  }, [generationStep]);

  const handleGenerateIntroduction = useCallback(async () => {
    setGenerationStep('sending-to-llm');
    setError(null);

    try {
      const response = await apiPost<ContentItem>(
        `/generate-content/artefact/${artifactId}`
      );
      setContent(response);
      setGenerationStep('done');
    } catch (err) {
      console.error('Error generating introduction:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to generate introduction'
      );
      setGenerationStep('idle');
    }
  }, [artifactId]);

  const handleGenerateAudio = useCallback(async () => {
    if (!content) return;

    setIsGeneratingAudio(true);
    setError(null);

    try {
      const response = await apiPost<ContentItem>(
        `/generate-audio/content/${content.id}`
      );
      setContent(response);
    } catch (err) {
      console.error('Error generating audio:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to generate audio'
      );
    } finally {
      setIsGeneratingAudio(false);
    }
  }, [content]);

  const getGenerationStepText = () => {
    switch (generationStep) {
      case 'sending-to-llm':
        return 'Sending prompt to LLM...';
      case 'generating-audio':
        return 'Generating audio with text-to-speech...';
      default:
        return 'Generating...';
    }
  };

  // No content yet - show generate button
  if (!content) {
    return (
      <SectionCard title="Introduction">
        <div className="space-y-4">
          {error && (
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          )}
          {isGenerating ? (
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="text-primary font-medium">{getGenerationStepText()}</p>
                <p className="text-sm text-muted-foreground">
                  {generationStep === 'sending-to-llm'
                    ? 'Creating an introduction based on artifact information...'
                    : 'Converting the introduction to audio...'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground">
                No introduction has been generated for this artifact yet.
              </p>
              <Button onClick={handleGenerateIntroduction}>
                Generate Introduction
              </Button>
            </>
          )}
        </div>
      </SectionCard>
    );
  }

  // Content exists - show it with audio controls
  return (
    <SectionCard title="Introduction">
      <div className="space-y-4">
        {error && (
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        )}

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
        <p className="text-primary leading-relaxed">{content.text}</p>

        {/* Generation Progress */}
        {isGenerating && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
            <div>
              <p className="text-primary font-medium">{getGenerationStepText()}</p>
              <p className="text-sm text-muted-foreground">
                {generationStep === 'sending-to-llm'
                  ? 'Creating an introduction based on artifact information...'
                  : 'Converting the introduction to audio...'}
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerateIntroduction}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {getGenerationStepText()}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate Introduction
              </>
            )}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerateAudio}
            disabled={isGeneratingAudio || isGenerating}
          >
            {isGeneratingAudio ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating Audio...
              </>
            ) : content.audioUrl ? (
              <>
                <Volume2 className="h-4 w-4 mr-2" />
                Regenerate Audio
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4 mr-2" />
                Generate Audio
              </>
            )}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
