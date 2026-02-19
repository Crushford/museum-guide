'use client';

import { useState } from 'react';
import { WikipediaSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';

type WikipediaSummaryDisplayProps = Pick<
  WikipediaSummary,
  'extract' | 'translated' | 'originalLanguage' | 'originalExtract'
>;

export function WikipediaSummaryDisplay({
  extract,
  translated,
  originalLanguage,
  originalExtract,
}: WikipediaSummaryDisplayProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  const displayText =
    showOriginal && originalExtract ? originalExtract : extract;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground leading-relaxed">{displayText}</p>

      {translated && originalExtract && (
        <p className="text-sm text-muted-foreground">
          <span className="italic">Translated from {originalLanguage}</span>
          {' · '}
          <Button
            variant="link"
            onClick={() => setShowOriginal(!showOriginal)}
            className="h-auto p-0 text-primary text-sm"
          >
            {showOriginal ? 'Show translation' : 'Show original'}
          </Button>
        </p>
      )}
    </div>
  );
}
