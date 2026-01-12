'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { InlineEditableField } from '@/components/shared/InlineEditableField';
import { InlineEditableUrlList } from '@/components/shared/InlineEditableUrlList';
import { updateNodeField } from './actions';

type EntityDetailsFormProps = {
  id: number;
  name: string;
  knowledgeText: string | null;
  furtherReading: string[];
  isEditing?: boolean;
  allowEdit?: boolean; // If false, never show edit buttons (read-only mode)
};

export function EntityDetailsForm({
  id,
  name,
  knowledgeText,
  furtherReading,
  isEditing = false,
  allowEdit = true,
}: EntityDetailsFormProps) {
  const router = useRouter();

  const handleSaveName = useCallback(
    async (value: string) => {
      await updateNodeField(id, 'name', value);
      router.refresh();
    },
    [id, router]
  );

  const handleSaveKnowledgeText = useCallback(
    async (value: string) => {
      await updateNodeField(id, 'knowledgeText', value || null);
      router.refresh();
    },
    [id, router]
  );

  const handleSaveFurtherReading = useCallback(
    async (value: string[]) => {
      await updateNodeField(id, 'furtherReading', value);
      router.refresh();
    },
    [id, router]
  );

  // If allowEdit is false, always set isEditing to false and don't pass onSave handlers
  const effectiveIsEditing = allowEdit ? isEditing : false;
  const noopSave = async () => {}; // No-op function for read-only mode

  return (
    <div className="space-y-6">
      <InlineEditableField
        label="Name"
        value={name}
        onSave={allowEdit ? handleSaveName : noopSave}
        type="text"
        isEditing={effectiveIsEditing}
      />

      <InlineEditableField
        label="Knowledge Text"
        value={knowledgeText || ''}
        onSave={allowEdit ? handleSaveKnowledgeText : noopSave}
        type="textarea"
        rows={8}
        placeholder="Enter knowledge text about this entity..."
        isEditing={effectiveIsEditing}
      />

      <InlineEditableUrlList
        label="Further Reading"
        value={furtherReading || []}
        onSave={allowEdit ? handleSaveFurtherReading : noopSave}
        isEditing={effectiveIsEditing}
      />
    </div>
  );
}
