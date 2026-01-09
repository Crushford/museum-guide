'use client';

import { useState, useEffect, useRef } from 'react';
import { JsonPasteBox } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';

type MuseumData = {
  name: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

type ValidationResult = {
  type: string;
  name: string;
  status: 'ok' | 'warning' | 'error';
  message?: string;
};

function validateJson(jsonString: string): {
  isValid: boolean;
  data: MuseumData | null;
  errors: string[];
  preview: ValidationResult | null;
} {
  if (!jsonString.trim()) {
    return {
      isValid: false,
      data: null,
      errors: [],
      preview: null,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return {
      isValid: false,
      data: null,
      errors: ['Invalid JSON format'],
      preview: null,
    };
  }

  const errors: string[] = [];
  const preview: ValidationResult = {
    type: (parsed.type as string) || 'MUSEUM',
    name: (parsed.name as string) || 'Unnamed',
    status: 'ok',
    message: undefined,
  };

  // Validate required fields
  if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
    errors.push('Missing or invalid field: name');
    preview.status = 'error';
    preview.message = 'Name is required';
  }

  // Warnings
  if (!parsed.knowledgeText) {
    if (preview.status === 'ok') {
      preview.status = 'warning';
    }
    preview.message = 'No knowledge text provided';
  }

  const furtherReading = Array.isArray(parsed.furtherReading)
    ? parsed.furtherReading
    : [];
  if (furtherReading.length === 0) {
    if (preview.status === 'ok') {
      preview.status = 'warning';
    }
    if (preview.message) {
      preview.message += '; No further reading URLs';
    } else {
      preview.message = 'No further reading URLs';
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      data: null,
      errors,
      preview,
    };
  }

  return {
    isValid: true,
    data: {
      name: (parsed.name as string).trim(),
      knowledgeText: (parsed.knowledgeText as string) || undefined,
      furtherReading: Array.isArray(parsed.furtherReading)
        ? (parsed.furtherReading as string[])
        : [],
    },
    errors: [],
    preview,
  };
}

type MuseumJsonImportClientProps = {
  onValidJson?: (data: MuseumData) => void;
};

export function MuseumJsonImportClient({
  onValidJson,
}: MuseumJsonImportClientProps = {}) {
  const [jsonString, setJsonString] = useState('');

  const validation = validateJson(jsonString);

  // When valid JSON is detected, populate the form fields
  const lastValidDataRef = useRef<string>('');
  useEffect(() => {
    if (validation.isValid && validation.data && onValidJson) {
      // Create a stable key to prevent infinite loops
      const dataKey = JSON.stringify(validation.data);
      if (dataKey !== lastValidDataRef.current) {
        lastValidDataRef.current = dataKey;
        onValidJson(validation.data);
      }
    }
  }, [validation.isValid, validation.data, onValidJson]);

  return (
    <>
      <SectionCard title="JSON Import">
        <JsonPasteBox
          label="Museum JSON"
          value={jsonString}
          onChange={setJsonString}
          errors={validation.errors}
          placeholder='{"name": "Museum Name", "knowledgeText": "...", "furtherReading": ["url1", "url2"]}'
        />
      </SectionCard>
    </>
  );
}
