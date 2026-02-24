'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/components/shared/SectionCard';
import { SaveBar } from '@/components/shared/SaveBar';
import { reportError } from '@/lib/report-error';
import { MuseumInput } from '@/lib/types';
import { useAuthedApi } from '@/lib/useAuthedApi';

type MuseumFormClientProps = {
  importedData?: MuseumInput | null;
};

export function MuseumFormClient({ importedData }: MuseumFormClientProps = {}) {
  const authedApi = useAuthedApi();
  const router = useRouter();
  const [name, setName] = useState('');
  const [knowledgeText, setKnowledgeText] = useState('');
  const [furtherReading, setFurtherReading] = useState('');
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastImportedRef = useRef<string>('');

  // Update form fields when JSON data is imported
  useEffect(() => {
    if (importedData) {
      // Create a stable key from the imported data to prevent infinite loops
      const dataKey = JSON.stringify({
        name: importedData.name,
        knowledgeText: importedData.knowledgeText,
        furtherReading: importedData.furtherReading,
      });

      // Only update if this is new data
      if (dataKey !== lastImportedRef.current) {
        lastImportedRef.current = dataKey;
        // Use queueMicrotask to defer state updates and avoid synchronous setState warning
        queueMicrotask(() => {
          setName(importedData.name);
          setKnowledgeText(importedData.knowledgeText || '');
          setFurtherReading(
            Array.isArray(importedData.furtherReading)
              ? importedData.furtherReading.join('\n')
              : ''
          );
        });
      }
    }
  }, [importedData]);

  const hasFormData = name.trim().length > 0;

  const handleSave = () => {
    if (!name.trim()) {
      setErrorMessage('Name is required');
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      try {
        const furtherReadingArray = furtherReading
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        const museum = await authedApi.mutate<{ id: number }>('/museums', {
          method: 'POST',
          body: {
            name: name.trim(),
            knowledgeText: knowledgeText.trim() || null,
            furtherReading:
              furtherReadingArray.length > 0 ? furtherReadingArray : [],
          },
        });
        router.push(`/admin/museums/${museum.id}`);
      } catch (error) {
        console.error('Failed to create museum:', error);
        reportError(error, {
          message: 'Create museum failed',
          tags: { feature: 'admin-museums', action: 'create-museum' },
        });
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Failed to create museum. Please try again.';
        setErrorMessage(errorMsg);
        // Ensure error state is visible even if transition completes
        setTimeout(() => {
          setErrorMessage(errorMsg);
        }, 0);
      }
    });
  };

  const handleDiscard = () => {
    setName('');
    setKnowledgeText('');
    setFurtherReading('');
    setErrorMessage(null);
  };

  return (
    <>
      <SectionCard title="Museum Details">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter museum name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="knowledgeText">Knowledge Text</Label>
            <Textarea
              id="knowledgeText"
              value={knowledgeText}
              onChange={(e) => setKnowledgeText(e.target.value)}
              rows={8}
              placeholder="Enter knowledge text about this museum..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="furtherReading">Further Reading URLs</Label>
            <Textarea
              id="furtherReading"
              value={furtherReading}
              onChange={(e) => setFurtherReading(e.target.value)}
              rows={4}
              placeholder="Enter URLs, one per line"
            />
            <p className="text-sm text-muted-foreground">
              Enter one URL per line
            </p>
          </div>
        </div>
      </SectionCard>

      <SaveBar
        isDirty={hasFormData}
        onSave={handleSave}
        onDiscard={handleDiscard}
        saveStatus={isPending ? 'loading' : errorMessage ? 'error' : 'idle'}
        errorMessage={errorMessage || undefined}
      />
    </>
  );
}
