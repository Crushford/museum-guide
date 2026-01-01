'use client';

import { useState, useTransition } from 'react';
import { JsonPasteBox } from '../../../../components/shared';
import { ImportPreviewTable } from '../../../../components/shared';
import { SaveBar } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';
import { createArtifactWithRoom } from './actions';

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

type ArtifactJsonImportClientProps = {
  museumId: number;
  roomId?: number;
};

export function ArtifactJsonImportClient({
  museumId,
  roomId,
}: ArtifactJsonImportClientProps) {
  // Prefill JSON if params are provided
  const getInitialJson = () => {
    if (roomId) {
      return JSON.stringify(
        {
          type: 'ARTIFACT',
          name: '',
          parentId: roomId,
        },
        null,
        2
      );
    }
    return JSON.stringify(
      {
        type: 'ARTIFACT',
        name: '',
        museumId: museumId,
      },
      null,
      2
    );
  };

  const [jsonString, setJsonString] = useState(() => getInitialJson());
  const [isPending, startTransition] = useTransition();

  const validation = validateJson(jsonString);
  const hasPreview = validation.preview !== null;
  const isDirty = jsonString.trim().length > 0;

  const handleSave = () => {
    if (!validation.isValid || !validation.data) {
      return;
    }

    startTransition(async () => {
      try {
        await createArtifactWithRoom(validation.data!, museumId);
      } catch (error) {
        console.error('Failed to create artifact:', error);
        alert(
          error instanceof Error
            ? error.message
            : 'Failed to create artifact. Please try again.'
        );
      }
    });
  };

  const handleDiscard = () => {
    setJsonString(getInitialJson());
  };

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

      {hasPreview && (
        <SectionCard title="Preview">
          <ImportPreviewTable rows={[validation.preview!]} />
        </SectionCard>
      )}

      <SaveBar
        isDirty={isDirty && validation.isValid}
        onSave={validation.isValid ? handleSave : undefined}
        onDiscard={handleDiscard}
      />
    </>
  );
}
