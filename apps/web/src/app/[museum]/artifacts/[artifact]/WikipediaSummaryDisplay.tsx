'use client';

import { useState } from 'react';

interface WikipediaSummaryDisplayProps {
  extract: string;
  translated?: boolean;
  originalLanguage?: string;
  originalExtract?: string;
}

export function WikipediaSummaryDisplay({
  extract,
  translated,
  originalLanguage,
  originalExtract,
}: WikipediaSummaryDisplayProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  const displayText = showOriginal && originalExtract ? originalExtract : extract;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground leading-relaxed">{displayText}</p>

      {translated && originalExtract && (
        <p className="text-sm text-muted-foreground">
          <span className="italic">Translated from {originalLanguage}</span>
          {' · '}
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className="text-primary hover:underline"
          >
            {showOriginal ? 'Show translation' : 'Show original'}
          </button>
        </p>
      )}
    </div>
  );
}
