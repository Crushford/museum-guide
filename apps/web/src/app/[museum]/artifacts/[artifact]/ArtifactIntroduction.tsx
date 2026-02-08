'use client';

import { useState, useCallback, useRef } from 'react';
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

type GenerationStep = 'idle' | 'loading' | 'generating' | 'saving' | 'audio' | 'done';

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
  const [streamingText, setStreamingText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isGenerating = generationStep !== 'idle' && generationStep !== 'done';

  const handleGenerateIntroduction = useCallback(async () => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setGenerationStep('loading');
    setStreamingText('');
    setStatusMessage('Loading artifact data...');
    setError(null);

    try {
      const eventSource = new EventSource(
        `${API_URL}/generate-content/artefact/${artifactId}/stream`
      );
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('status', (event) => {
        const data = JSON.parse(event.data);
        setGenerationStep(data.step as GenerationStep);
        setStatusMessage(data.message);
      });

      eventSource.addEventListener('chunk', (event) => {
        const data = JSON.parse(event.data);
        setStreamingText((prev) => prev + data.text);
      });

      eventSource.addEventListener('complete', (event) => {
        const data = JSON.parse(event.data);
        setContent(data.content);
        setGenerationStep('done');
        setStreamingText('');
        eventSource.close();
        eventSourceRef.current = null;
      });

      eventSource.addEventListener('error', (event) => {
        // Check if it's a custom error event or connection error
        if (event instanceof MessageEvent) {
          const data = JSON.parse(event.data);
          setError(data.error);
        } else {
          setError('Connection error. Please try again.');
        }
        setGenerationStep('idle');
        eventSource.close();
        eventSourceRef.current = null;
      });

      // Handle connection errors
      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          // Normal close, ignore
          return;
        }
        setError('Connection error. Please try again.');
        setGenerationStep('idle');
        eventSource.close();
        eventSourceRef.current = null;
      };
    } catch (err) {
      console.error('Error setting up stream:', err);
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

  const getStepIcon = () => {
    switch (generationStep) {
      case 'loading':
      case 'saving':
        return '📋';
      case 'generating':
        return '🤖';
      case 'audio':
        return '🔊';
      default:
        return '⏳';
    }
  };

  // Show streaming UI when generating (before we have final content)
  if (isGenerating && !content) {
    return (
      <SectionCard title="Introduction">
        <div className="space-y-4">
          {error && (
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          )}

          {/* Status indicator */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
            <div>
              <p className="text-primary font-medium">
                {getStepIcon()} {statusMessage}
              </p>
            </div>
          </div>

          {/* Streaming text display */}
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
          {error && (
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          )}
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

        {/* Generation Progress (when regenerating) */}
        {isGenerating && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
              <div>
                <p className="text-primary font-medium">
                  {getStepIcon()} {statusMessage}
                </p>
              </div>
            </div>
            {streamingText && (
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                <p className="text-sm text-muted-foreground mb-2">New introduction:</p>
                <p className="text-primary leading-relaxed whitespace-pre-wrap">
                  {streamingText}
                  <span className="inline-block w-2 h-5 bg-primary animate-pulse ml-1" />
                </p>
              </div>
            )}
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
                Generating...
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
