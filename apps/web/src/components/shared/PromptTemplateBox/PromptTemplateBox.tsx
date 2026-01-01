'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type PromptTemplateBoxProps = {
  title: string;
  template: string;
  helperText?: string;
  copyLabel?: string;
};

export function PromptTemplateBox({
  title,
  template,
  helperText,
  copyLabel = 'Copy',
}: PromptTemplateBoxProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <Button onClick={handleCopy} size="sm" >
          {copied ? 'Copied!' : copyLabel}
        </Button>
      </div>
      <div className="bg-muted border border-border rounded-md p-4">
        <pre className="text-sm text-foreground font-mono whitespace-pre-wrap break-words">
          {template}
        </pre>
      </div>
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
