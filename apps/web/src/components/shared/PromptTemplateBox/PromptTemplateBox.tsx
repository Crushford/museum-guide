'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type PromptTemplateBoxProps = {
  title: string;
  template: string;
  helperText?: string;
  copyLabel?: string;
  instructions?: string;
};

export function PromptTemplateBox({
  title,
  template,
  helperText,
  copyLabel = 'Copy',
  instructions,
}: PromptTemplateBoxProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      let textToCopy = template;
      if (instructions) {
        // Replace {{JSON}} placeholder with the actual template
        textToCopy = instructions.replace('{{JSON}}', template);
      }
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const displayContent = instructions
    ? instructions.replace('{{JSON}}', template)
    : template;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-primary">{title}</h3>
        <Button onClick={handleCopy} size="sm">
          {copied ? 'Copied!' : copyLabel}
        </Button>
      </div>
      <div className="bg-raised border border-line rounded-md p-4">
        <pre className="text-sm text-primary font-mono whitespace-pre-wrap break-words">
          {displayContent}
        </pre>
      </div>
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
