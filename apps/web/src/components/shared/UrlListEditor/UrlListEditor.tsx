'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type UrlListEditorProps = {
  value: string[];
  editable?: boolean;
  onChange?: (next: string[]) => void;
  placeholder?: string;
};

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function UrlListEditor({
  value,
  editable = false,
  onChange,
  placeholder = 'https://example.com/article',
}: UrlListEditorProps) {
  const [newUrl, setNewUrl] = useState('');

  const handleAdd = () => {
    if (newUrl.trim() && onChange) {
      onChange([...value, newUrl.trim()]);
      setNewUrl('');
    }
  };

  const handleRemove = (index: number) => {
    if (onChange) {
      onChange(value.filter((_, i) => i !== index));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      {value.map((url, index) => {
        const isValid = isValidUrl(url);
        return (
          <div
            key={index}
            className="flex items-center gap-2 p-2 bg-raised rounded-md border border-line"
          >
            <div className="flex-1 min-w-0">
              <span
                className={`text-sm ${isValid ? 'text-primary' : 'text-warning'}`}
              >
                {url}
              </span>
              {!isValid && (
                <span className="text-xs text-muted-foreground ml-2">
                  (not a valid URL)
                </span>
              )}
            </div>
            {editable && (
              <button
                onClick={() => handleRemove(index)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove URL"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {editable && (
        <div className="flex gap-2">
          <Input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1"
          />
          <Button onClick={handleAdd}>Add</Button>
        </div>
      )}
    </div>
  );
}
