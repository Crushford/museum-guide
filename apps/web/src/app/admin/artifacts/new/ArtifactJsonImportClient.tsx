'use client';

import { useState, useEffect, useRef } from 'react';
import { JsonPasteBox } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';

type ArtifactData = {
  type: 'ARTIFACT';
  name: string;
  parentId?: number;
  parentName?: string;
  museumId?: number;
  museumName?: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

type ValidationResult = {
  type: string;
  name: string;
  parent?: string;
  status: 'ok' | 'warning' | 'error';
  message?: string;
};

function validateJson(jsonString: string): {
  isValid: boolean;
  data: ArtifactData | null;
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

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    return {
      isValid: false,
      data: null,
      errors: ['Invalid JSON format'],
      preview: null,
    };
  }

  const errors: string[] = [];
  const preview: ValidationResult = {
    type: parsed.type || 'UNKNOWN',
    name: parsed.name || 'Unnamed',
    parent: parsed.parentId
      ? `ID: ${parsed.parentId}`
      : parsed.parentName || undefined,
    status: 'ok',
    message: undefined,
  };

  // Validate required fields
  if (!parsed.type) {
    errors.push('Missing required field: type');
    preview.status = 'error';
    preview.message = 'Type is required';
  } else if (parsed.type.toUpperCase() !== 'ARTIFACT') {
    errors.push('Type must be ARTIFACT');
    preview.status = 'error';
    preview.message = 'Invalid type';
  }

  if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
    errors.push('Missing or invalid field: name');
    preview.status = 'error';
    preview.message = 'Name is required';
  }

  // Validate parent requirements - need either parentId or (parentName + museumId/museumName)
  if (!parsed.parentId && !parsed.parentName) {
    errors.push('ARTIFACT requires either parentId or parentName');
    preview.status = 'error';
    preview.message = 'Parent reference required';
  }

  if (parsed.parentName && !parsed.museumId && !parsed.museumName) {
    errors.push(
      'When using parentName, museumId or museumName must be provided for automatic room creation'
    );
    preview.status = 'error';
    preview.message = 'Museum reference required for room creation';
  }

  // Warnings
  if (!parsed.knowledgeText) {
    if (preview.status === 'ok') {
      preview.status = 'warning';
    }
    preview.message = 'No knowledge text provided';
  }

  if (!parsed.furtherReading || parsed.furtherReading.length === 0) {
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
      type: 'ARTIFACT',
      name: parsed.name.trim(),
      parentId: parsed.parentId,
      parentName: parsed.parentName,
      museumId: parsed.museumId,
      museumName: parsed.museumName,
      knowledgeText: parsed.knowledgeText || undefined,
      furtherReading: parsed.furtherReading || [],
    },
    errors: [],
    preview,
  };
}

type ImportedArtifactData = {
  name: string;
  parentId?: number;
  parentName?: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

type ArtifactJsonImportClientProps = {
  museumId: number;
  roomId?: number;
  onValidJson?: (data: ImportedArtifactData) => void;
};

export function ArtifactJsonImportClient({
  museumId,
  roomId,
  onValidJson,
}: ArtifactJsonImportClientProps) {
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
        onValidJson({
          name: validation.data.name,
          parentId: validation.data.parentId,
          parentName: validation.data.parentName,
          knowledgeText: validation.data.knowledgeText,
          furtherReading: validation.data.furtherReading,
        });
      }
    }
  }, [validation.isValid, validation.data, onValidJson]);

  return (
    <>
      <SectionCard title="JSON Import">
        <JsonPasteBox
          label="Artifact JSON"
          value={jsonString}
          onChange={setJsonString}
          errors={validation.errors}
          placeholder='{"type": "ARTIFACT", "name": "Artifact Name", "parentName": "Room Name", ...}'
        />
      </SectionCard>
    </>
  );
}
