import { useState } from 'react';

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
        <h3 className="text-sm font-medium text-fg">{title}</h3>
        <button
          onClick={handleCopy}
          className="px-3 py-1 text-xs bg-accent text-white rounded-md hover:bg-accent-2 transition-colors"
        >
          {copied ? 'Copied!' : copyLabel}
        </button>
      </div>
      <div className="bg-bg-2 border border-border rounded-md p-4">
        <pre className="text-sm text-fg font-mono whitespace-pre-wrap break-words">
          {template}
        </pre>
      </div>
      {helperText && <p className="text-xs text-muted">{helperText}</p>}
    </div>
  );
}
