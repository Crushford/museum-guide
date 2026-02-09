'use client';

import { useState } from 'react';
import { SectionCard } from '../../../../components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type ContentItem = {
  id: number;
  text: string;
  type: string | null;
  llmProvider: string;
  model: string;
  promptVersion?: string;
  audioUrl: string | null;
  createdAt: string;
  updatedAt?: string;
};

type Props = {
  artifactId: number;
  initialContent: ContentItem[];
};

export function ArtifactContentInspector({
  artifactId,
  initialContent,
}: Props) {
  const [content, setContent] = useState<ContentItem[]>(initialContent);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (provider: 'google' | 'openai') => {
    setGenerating(provider);
    setError(null);

    try {
      const res = await fetch(
        `${API_URL}/admin/artifacts/${artifactId}/generate-introduction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to generate (${res.status})`);
      }

      const data = await res.json();
      // Replace or add the introduction content
      setContent((prev) => {
        const idx = prev.findIndex((c) => c.type === 'introduction');
        const newItem = data.content;
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = newItem;
          return updated;
        }
        return [...prev, newItem];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <SectionCard title="Generated Content">
      {content.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No content generated yet.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleGenerate('google')}
              disabled={generating !== null}
            >
              {generating === 'google' ? 'Generating...' : 'Generate (Google)'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleGenerate('openai')}
              disabled={generating !== null}
            >
              {generating === 'openai' ? 'Generating...' : 'Generate (OpenAI)'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {content.map((item) => (
            <div key={item.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {item.type && <Badge variant="default">{item.type}</Badge>}
                <Badge variant="secondary">{item.llmProvider}</Badge>
                <Badge variant="secondary">{item.model}</Badge>
                {item.promptVersion && (
                  <Badge variant="secondary">v{item.promptVersion}</Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(item.updatedAt || item.createdAt).toLocaleString()}
                </span>
              </div>

              <p className="text-sm whitespace-pre-wrap">{item.text}</p>

              {item.audioUrl && (
                <audio
                  controls
                  src={`${API_URL}${item.audioUrl}`}
                  className="w-full"
                />
              )}

              {item.type === 'introduction' && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleGenerate('google')}
                    disabled={generating !== null}
                  >
                    {generating === 'google'
                      ? 'Generating...'
                      : 'Regenerate (Google)'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleGenerate('openai')}
                    disabled={generating !== null}
                  >
                    {generating === 'openai'
                      ? 'Generating...'
                      : 'Regenerate (OpenAI)'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </SectionCard>
  );
}
