'use client';

import { useState, useCallback } from 'react';
import { API_URL } from '@/lib/api';
import { emitApiError, extractErrorBody } from '@/lib/api-errors';
import { reportError } from '@/lib/report-error';
import { usePreferredLLMProvider } from '@/hooks/usePreferredLLMProvider';
import { usePreferredTTSProvider } from '@/hooks/usePreferredTTSProvider';
import { useAuthedApi } from '@/lib/useAuthedApi';
import type { ContentItem } from '@/lib/types';

export type GenerationStep =
  | 'idle'
  | 'loading'
  | 'generating'
  | 'saving'
  | 'audio'
  | 'done';

type StreamCompletePayload = {
  content?: ContentItem;
  audioError?: string;
};

interface UseIntroductionGenerationProps {
  artifactId: number;
  initialContent: ContentItem | null;
  onContentGenerated?: (content: ContentItem) => void;
}

interface UseIntroductionGenerationResult {
  content: ContentItem | null;
  isGenerating: boolean;
  isRetryingAudio: boolean;
  generationStep: GenerationStep;
  streamingText: string;
  statusMessage: string;
  error: string | null;
  generate: () => void;
  retryAudio: () => Promise<boolean>;
}

export function useIntroductionGeneration({
  artifactId,
  initialContent,
  onContentGenerated,
}: UseIntroductionGenerationProps): UseIntroductionGenerationResult {
  const authedApi = useAuthedApi();
  const [content, setContent] = useState<ContentItem | null>(initialContent);
  const [isRetryingAudio, setIsRetryingAudio] = useState(false);
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const preferredProvider = usePreferredLLMProvider();
  const preferredTtsProvider = usePreferredTTSProvider();

  const isGenerating =
    (generationStep !== 'idle' && generationStep !== 'done') || isRetryingAudio;

  const handleGenerateIntroduction = useCallback(async () => {
    setGenerationStep('loading');
    setStreamingText('');
    setStatusMessage('Generating introduction...');
    setError(null);

    try {
      await authedApi.run(
        async (token) => {
          const response = await fetch(
            `${API_URL}/generate-content/artefact/${artifactId}/stream?provider=${preferredProvider}&ttsProvider=${preferredTtsProvider}`,
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
              const complete = data as StreamCompletePayload;
              if (complete.content) {
                const generated = complete.content;
                setContent(generated);
                onContentGenerated?.(generated);
                if (!generated.audioUrl) {
                  const audioErrorMessage =
                    typeof complete.audioError === 'string' &&
                    complete.audioError.trim()
                      ? `Introduction generated, but text-to-speech audio failed: ${complete.audioError}`
                      : 'Introduction generated, but text-to-speech audio failed. Please try again in a moment.';
                  console.error(
                    '[useIntroductionGeneration] Auto audio generation failed:',
                    {
                      artifactId,
                      contentId: generated.id,
                      provider: preferredProvider,
                      ttsProvider: preferredTtsProvider,
                    }
                  );
                  reportError(new Error('Auto audio generation failed'), {
                    message:
                      'Auto audio generation failed after content was saved',
                    level: 'warning',
                    tags: { feature: 'generation', action: 'auto-audio' },
                    extra: {
                      artifactId,
                      contentId: generated.id,
                      provider: preferredProvider,
                      ttsProvider: preferredTtsProvider,
                      audioError:
                        typeof complete.audioError === 'string'
                          ? complete.audioError
                          : undefined,
                    },
                  });
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
                    typeof data.message === 'string' ? data.message : undefined,
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
              const rawEvent = buffer
                .slice(0, separatorIndex)
                .replace(/\r/g, '');
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
        { requireCreator: true }
      );
    } catch (err) {
      console.error('Error generating introduction:', err);
      reportError(err, {
        message: 'Generate introduction failed',
        tags: { feature: 'generation', action: 'generate-introduction' },
        extra: {
          artifactId,
          provider: preferredProvider,
          ttsProvider: preferredTtsProvider,
        },
      });
      setError(
        err instanceof Error ? err.message : 'Failed to generate introduction'
      );
      setGenerationStep('idle');
    }
  }, [
    artifactId,
    preferredProvider,
    preferredTtsProvider,
    authedApi,
    onContentGenerated,
  ]);

  const handleRetryAudio = useCallback(async (): Promise<boolean> => {
    if (!content) return false;

    setIsRetryingAudio(true);
    setError(null);
    try {
      const updated = await authedApi.mutate<ContentItem>(
        `/generate-audio/content/${content.id}`,
        {
          method: 'POST',
          body: { ttsProvider: preferredTtsProvider },
        },
        { requireCreator: true }
      );

      setContent(updated);
      if (!updated.audioUrl) {
        setError(
          'Audio retry completed but no audio URL was returned. Check API logs.'
        );
        return false;
      }
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to regenerate audio'
      );
      return false;
    } finally {
      setIsRetryingAudio(false);
    }
  }, [authedApi, content, preferredTtsProvider]);

  return {
    content,
    isGenerating,
    isRetryingAudio,
    generationStep,
    streamingText,
    statusMessage,
    error,
    generate: handleGenerateIntroduction,
    retryAudio: handleRetryAudio,
  };
}
