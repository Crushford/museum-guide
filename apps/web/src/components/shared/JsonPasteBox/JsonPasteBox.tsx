'use client';

import { useState, useEffect } from 'react';
import { JsonEditor } from 'json-edit-react';

type JsonPasteBoxProps = {
  label: string;
  value: string;
  onChange?: (next: string) => void;
  errors?: string[];
  placeholder?: string;
};

function parseJsonSafely(str: string): { data: any; isValid: boolean } {
  if (!str.trim()) {
    return { data: null, isValid: true };
  }
  try {
    return { data: JSON.parse(str), isValid: true };
  } catch {
    return { data: null, isValid: false };
  }
}

export function JsonPasteBox({
  label,
  value,
  onChange,
  errors = [],
  placeholder = 'Paste JSON here...',
}: JsonPasteBoxProps) {
  const [jsonString, setJsonString] = useState(value);
  const { data, isValid } = parseJsonSafely(jsonString);

  useEffect(() => {
    setJsonString(value);
  }, [value]);

  const handleDataChange = (newData: any) => {
    const newJsonString = JSON.stringify(newData, null, 2);
    setJsonString(newJsonString);
    if (onChange) {
      onChange(newJsonString);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setJsonString(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  const hasErrors = errors.length > 0;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-fg">{label}</label>
      {isValid && data !== null ? (
        <div className="border border-border rounded-md overflow-hidden bg-bg-2">
          <JsonEditor
            data={data}
            setData={handleDataChange}
            theme="dark"
            restrictAdd={false}
            restrictDelete={false}
            restrictEdit={false}
          />
        </div>
      ) : (
        <textarea
          value={jsonString}
          onChange={handleTextChange}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-bg-2 border border-border rounded-md text-fg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-y min-h-[200px]"
        />
      )}
      <div className="space-y-1">
        {!hasErrors && isValid && jsonString.trim() && (
          <p className="text-xs text-success">Valid JSON</p>
        )}
        {hasErrors && (
          <div className="space-y-1">
            {errors.map((error, index) => (
              <p key={index} className="text-xs text-danger">
                {error}
              </p>
            ))}
          </div>
        )}
        {!hasErrors && !isValid && jsonString.trim() && (
          <p className="text-xs text-danger">
            Invalid JSON - fix errors to use visual editor
          </p>
        )}
      </div>
    </div>
  );
}
