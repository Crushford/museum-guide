'use client';

import { useState, useCallback } from 'react';
import { Volume2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/ui/error-text';
import { SectionCard } from '@/components/shared';
import { API_URL } from '@/lib/api';
import { emitApiError, extractErrorBody } from '@/lib/api-errors';
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
  const [streamingText, setStreamingText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const preferredProvider = usePreferredLLMProvider();

  const isGenerating = generationStep !== 'idle' && generationStep !== 'done';

  const handleGenerateIntroduction = useCallback(async () => {
    setGenerationStep('loading');
    setStreamingText('');
    setStatusMessage('Generating introduction...');
    setError(null);

    try {
      await authedApi.run(
        async (token) => {
          const response = await fetch(
            `${API_URL}/generate-content/artefact/${artifactId}/stream?provider=${preferredProvider}`,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'text/event-stream',
              },
              cache: 'no-store',
            }
          );

          if (!response.ok) {
            let message = `Failed to generate introduction (${response.status})`;
            try {
              const payload = await response.json();
              const parsedError = extractErrorBody(payload);
              if (parsedError?.code) {
                emitApiError(parsedError);
              }
              if (parsedError?.message) {
                message = parsedError.message;
              }
            } catch {
              // Ignore parse errors
            }
            throw new Error(message);
          }

          if (!response.body) {
            throw new Error('No stream body returned by server.');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let completed = false;

          const processEvent = (rawEvent: string) => {
            const lines = rawEvent.split('\n');
            let eventName = 'message';
            const dataLines: string[] = [];

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventName = line.slice('event:'.length).trim();
                continue;
              }
              if (line.startsWith('data:')) {
                dataLines.push(line.slice('data:'.length).trim());
              }
            }

            const dataRaw = dataLines.join('\n');
            if (!dataRaw) return;

            const data = JSON.parse(dataRaw);

            if (eventName === 'status') {
              if (typeof data.step === 'string') {
                setGenerationStep(data.step as GenerationStep);
              }
              if (typeof data.message === 'string') {
                setStatusMessage(data.message);
              }
              return;
            }

            if (eventName === 'chunk') {
              if (typeof data.text === 'string') {
                setStreamingText((prev) => prev + data.text);
              }
              return;
            }

            if (eventName === 'complete') {
              if (data.content) {
                const generated = data.content as ContentItem;
                setContent(generated);
                if (!generated.audioUrl) {
                  const audioErrorMessage =
                    'Introduction generated, but text-to-speech audio failed. Please try again in a moment.';
                  console.error(
                    '[ArtifactIntroduction] Auto audio generation failed:',
                    {
                      artifactId,
                      contentId: generated.id,
                      provider: preferredProvider,
                    }
                  );
                  setError(audioErrorMessage);
                }
              }
              setStreamingText('');
              setGenerationStep('done');
              completed = true;
              return;
            }

            if (eventName === 'error') {
              if (data?.code && typeof data.code === 'string') {
                emitApiError({
                  code: data.code,
                  message:
                    typeof data.message === 'string'
                      ? data.message
                      : undefined,
                });
              }
              throw new Error(
                typeof data.error === 'string'
                  ? data.error
                  : typeof data.message === 'string'
                    ? data.message
                    : 'Failed to generate introduction'
              );
            }
          };

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            let separatorIndex = buffer.indexOf('\n\n');

            while (separatorIndex !== -1) {
              const rawEvent = buffer.slice(0, separatorIndex).replace(/\r/g, '');
              buffer = buffer.slice(separatorIndex + 2);
              if (rawEvent.trim()) {
                processEvent(rawEvent);
              }
              separatorIndex = buffer.indexOf('\n\n');
            }
          }

          if (buffer.trim()) {
            processEvent(buffer.replace(/\r/g, ''));
          }

          if (!completed) {
            throw new Error('Generation stream ended before completion.');
          }
        },
        { requireAdmin: true }
      );
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
