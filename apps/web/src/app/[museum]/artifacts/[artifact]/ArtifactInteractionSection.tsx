'use client';

import { useState, useCallback } from 'react';
import { ArtifactIntroduction } from './ArtifactIntroduction';
import { ArtifactQuestionsPanel } from './ArtifactQuestionsPanel';
import type { ContentItem, ArtifactQuestion } from '@/lib/types';

interface ArtifactInteractionSectionProps {
  artifactId: number;
  initialContent: ContentItem | null;
  initialQuestions: ArtifactQuestion[];
  initialSuggestedQuestions: string[];
}

export function ArtifactInteractionSection({
  artifactId,
  initialContent,
  initialQuestions,
  initialSuggestedQuestions,
}: ArtifactInteractionSectionProps) {
  const [suggestedQuestions, setSuggestedQuestions] = useState(
    initialSuggestedQuestions
  );

  const handleContentGenerated = useCallback((content: ContentItem) => {
    if (content.suggestedQuestions.length) {
      setSuggestedQuestions(content.suggestedQuestions);
    }
  }, []);

  return (
    <div className="space-y-6">
      <ArtifactIntroduction
        artifactId={artifactId}
        initialContent={initialContent}
        onContentGenerated={handleContentGenerated}
      />
      <ArtifactQuestionsPanel
        artifactId={artifactId}
        initialQuestions={initialQuestions}
        suggestedQuestions={suggestedQuestions}
      />
    </div>
  );
}
