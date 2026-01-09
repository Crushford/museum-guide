'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/shared/SectionCard';
import { InlineEditableField } from '@/components/shared/InlineEditableField';
import { InlineEditableUrlList } from '@/components/shared/InlineEditableUrlList';
import { updateNodeField } from './actions';

type EntityDetailsFormProps = {
  id: number;
  name: string;
  knowledgeText: string | null;
  furtherReading: string[];
};

export function EntityDetailsForm({
  id,
  name,
  knowledgeText,
  furtherReading,
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

  return (
    <SectionCard title="Details">
      <div className="space-y-6">
        <InlineEditableField
          label="Name"
          value={name}
          onSave={handleSaveName}
          type="text"
        />

        <InlineEditableField
          label="Knowledge Text"
          value={knowledgeText || ''}
          onSave={handleSaveKnowledgeText}
          type="textarea"
          rows={8}
          placeholder="Enter knowledge text about this entity..."
        />

        <InlineEditableUrlList
          label="Further Reading"
          value={furtherReading || []}
          onSave={handleSaveFurtherReading}
        />
      </div>
    </SectionCard>
  );
}
