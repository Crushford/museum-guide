'use client';

import { useState } from 'react';

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
            className="flex items-center gap-2 p-2 bg-bg-2 rounded-md border border-border"
          >
            <div className="flex-1 min-w-0">
              <span
                className={`text-sm ${isValid ? 'text-fg' : 'text-warning'}`}
              >
                {url}
              </span>
              {!isValid && (
                <span className="text-xs text-muted ml-2">
                  (not a valid URL)
                </span>
              )}
            </div>
            {editable && (
              <button
                onClick={() => handleRemove(index)}
                className="text-muted hover:text-danger transition-colors"
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
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 px-3 py-2 bg-bg-2 border border-border rounded-md text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-2 transition-colors"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
