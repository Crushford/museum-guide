'use client';

import { useState, useTransition } from 'react';
import { JsonPasteBox } from '../../../../components/shared';
import { ImportPreviewTable } from '../../../../components/shared';
import { SaveBar } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';
import { createNode } from './actions';

type NodeData = {
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  parentId?: number;
  parentName?: string;
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
  data: NodeData | null;
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
  } else if (
    !['MUSEUM', 'ROOM', 'ARTIFACT'].includes(parsed.type.toUpperCase())
  ) {
    errors.push('Type must be MUSEUM, ROOM, or ARTIFACT');
    preview.status = 'error';
    preview.message = 'Invalid type';
  }

  if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
    errors.push('Missing or invalid field: name');
    preview.status = 'error';
    preview.message = 'Name is required';
  }

  // Validate parent requirements
  if (parsed.type === 'ROOM' || parsed.type === 'ARTIFACT') {
    if (!parsed.parentId && !parsed.parentName) {
      errors.push(`${parsed.type} requires either parentId or parentName`);
      preview.status = 'error';
      preview.message = 'Parent reference required';
    }
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
      type: parsed.type.toUpperCase() as 'MUSEUM' | 'ROOM' | 'ARTIFACT',
      name: parsed.name.trim(),
      parentId: parsed.parentId,
      parentName: parsed.parentName,
      knowledgeText: parsed.knowledgeText || undefined,
      furtherReading: parsed.furtherReading || [],
    },
    errors: [],
    preview,
  };
}

type JsonImportClientProps = {
  parentId?: number;
  nodeType?: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
};

export function JsonImportClient({
  parentId,
  nodeType,
}: JsonImportClientProps) {
  // Prefill JSON if parentId is provided
  const getInitialJson = () => {
    if (parentId && nodeType) {
      return JSON.stringify(
        {
          type: nodeType,
          name: '',
          parentId: parentId,
        },
        null,
        2
      );
    }
    return '';
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
        await createNode(validation.data!);
      } catch (error) {
        console.error('Failed to create node:', error);
        // TODO: Show error toast/notification
      }
    });
  };

  const handleDiscard = () => {
    setJsonString('');
  };

  return (
    <>
      <SectionCard title="JSON Import">
        <JsonPasteBox
          label="Node JSON"
          value={jsonString}
          onChange={setJsonString}
          errors={validation.errors}
          placeholder='{"type": "MUSEUM", "name": "British Museum", ...}'
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
