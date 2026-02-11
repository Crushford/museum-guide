'use client';

import { useState, useEffect, useRef } from 'react';
import { JsonPasteBox } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';
import { ArtifactCreateInput, ArtifactImportData } from '@/lib/types';

type ValidationResult = {
  type: string;
  name: string;
  parent?: string;
  status: 'ok' | 'warning' | 'error';
  message?: string;
};

function validateJson(jsonString: string): {
  isValid: boolean;
  data: ArtifactCreateInput | null;
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
    parsed = JSON.parse(jsonString) as Record<string, unknown>;
  } catch {
    return {
      isValid: false,
      data: null,
      errors: ['Invalid JSON format'],
      preview: null,
    };
  }

  const parsedType = typeof parsed.type === 'string' ? parsed.type : '';
  const parsedName = typeof parsed.name === 'string' ? parsed.name : '';
  const parsedParentId =
    typeof parsed.parentId === 'number' ? parsed.parentId : undefined;
  const parsedParentName =
    typeof parsed.parentName === 'string' ? parsed.parentName : undefined;
  const parsedMuseumId =
    typeof parsed.museumId === 'number' ? parsed.museumId : undefined;
  const parsedMuseumName =
    typeof parsed.museumName === 'string' ? parsed.museumName : undefined;
  const parsedKnowledgeText =
    typeof parsed.knowledgeText === 'string' ? parsed.knowledgeText : undefined;
  const parsedFurtherReading =
    Array.isArray(parsed.furtherReading) &&
    parsed.furtherReading.every((item) => typeof item === 'string')
      ? (parsed.furtherReading as string[])
      : [];

  const errors: string[] = [];
  const preview: ValidationResult = {
    type: parsedType || 'UNKNOWN',
    name: parsedName || 'Unnamed',
    parent: parsedParentId ? `ID: ${parsedParentId}` : parsedParentName,
    status: 'ok',
    message: undefined,
  };

  // Validate required fields
  if (!parsedType) {
    errors.push('Missing required field: type');
    preview.status = 'error';
    preview.message = 'Type is required';
  } else if (parsedType.toUpperCase() !== 'ARTIFACT') {
    errors.push('Type must be ARTIFACT');
    preview.status = 'error';
    preview.message = 'Invalid type';
  }

  if (!parsedName.trim()) {
    errors.push('Missing or invalid field: name');
    preview.status = 'error';
    preview.message = 'Name is required';
  }

  // Validate parent requirements - need either parentId or (parentName + museumId/museumName)
  if (!parsedParentId && !parsedParentName) {
    errors.push('ARTIFACT requires either parentId or parentName');
    preview.status = 'error';
    preview.message = 'Parent reference required';
  }

  if (parsedParentName && !parsedMuseumId && !parsedMuseumName) {
    errors.push(
      'When using parentName, museumId or museumName must be provided for automatic room creation'
    );
    preview.status = 'error';
    preview.message = 'Museum reference required for room creation';
  }

  // Warnings
  if (!parsedKnowledgeText) {
    if (preview.status === 'ok') {
      preview.status = 'warning';
    }
    preview.message = 'No knowledge text provided';
  }

  if (parsedFurtherReading.length === 0) {
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
      name: parsedName.trim(),
      parentId: parsedParentId,
      parentName: parsedParentName,
      museumId: parsedMuseumId,
      museumName: parsedMuseumName,
      knowledgeText: parsedKnowledgeText,
      furtherReading: parsedFurtherReading,
    },
    errors: [],
    preview,
  };
}

type ArtifactJsonImportClientProps = {
  onValidJson?: (data: ArtifactImportData) => void;
};

export function ArtifactJsonImportClient({
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
