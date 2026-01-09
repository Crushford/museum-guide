'use client';

import { useState, useEffect, useRef } from 'react';
import { JsonPasteBox } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';

type RoomData = {
  name: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

type RoomJsonImportClientProps = {
  museumId: number;
  onValidJson?: (data: RoomData) => void;
};

function validateJson(jsonString: string): {
  isValid: boolean;
  data: RoomData | null;
  errors: string[];
} {
  if (!jsonString.trim()) {
    return {
      isValid: false,
      data: null,
      errors: [],
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
    };
  }

  const errors: string[] = [];

  // Validate required fields
  if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
    errors.push('Missing or invalid field: name');
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      data: null,
      errors,
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
  };
}

export function RoomJsonImportClient({
  museumId,
  onValidJson,
}: RoomJsonImportClientProps) {
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
          label="Room JSON"
          value={jsonString}
          onChange={setJsonString}
          errors={validation.errors}
          placeholder='{"name": "Room Name", "knowledgeText": "...", "furtherReading": ["url1", "url2"]}'
        />
      </SectionCard>
    </>
  );
}
