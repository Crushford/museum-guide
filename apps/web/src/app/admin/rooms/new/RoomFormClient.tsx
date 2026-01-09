'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/SectionCard';
import { SaveBar } from '@/components/shared/SaveBar';
import { createRoom } from './actions';

type RoomData = {
  name: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

type Room = {
  id: number;
  name: string;
};

type RoomFormClientProps = {
  museumId: number;
  rooms: Room[];
  importedData?: RoomData | null;
};

export function RoomFormClient({
  museumId,
  rooms,
  importedData,
}: RoomFormClientProps) {
  const [name, setName] = useState('');
  const [knowledgeText, setKnowledgeText] = useState('');
  const [furtherReading, setFurtherReading] = useState('');
  const [parentType, setParentType] = useState<'museum' | 'room'>('museum');
  const [parentRoomId, setParentRoomId] = useState<number | undefined>(
    undefined
  );
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

  const hasFormData =
    name.trim().length > 0 &&
    (parentType === 'museum' ||
      (parentType === 'room' && parentRoomId !== undefined));

  const handleSave = () => {
    if (!name.trim()) {
      setErrorMessage('Name is required');
      return;
    }

    if (parentType === 'room' && !parentRoomId) {
      setErrorMessage('Parent room is required');
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      try {
        const furtherReadingArray = furtherReading
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        await createRoom({
          ...(parentType === 'museum'
            ? { museumId }
            : { parentRoomId: parentRoomId! }),
          name: name.trim(),
          knowledgeText: knowledgeText.trim() || undefined,
          furtherReading:
            furtherReadingArray.length > 0 ? furtherReadingArray : undefined,
        });
      } catch (error) {
        console.error('Failed to create room:', error);
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Failed to create room. Please try again.';
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
    setParentType('museum');
    setParentRoomId(undefined);
    setErrorMessage(null);
  };

  return (
    <>
      <SectionCard title="Room Details">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter room name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parentType">Parent Type *</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={parentType === 'museum' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setParentType('museum');
                  setParentRoomId(undefined);
                }}
              >
                Museum
              </Button>
              <Button
                type="button"
                variant={parentType === 'room' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setParentType('room');
                  setParentRoomId(undefined);
                }}
              >
                Room
              </Button>
            </div>
            {parentType === 'room' && (
              <div className="mt-2">
                <Label htmlFor="parentRoom">Parent Room *</Label>
                <select
                  id="parentRoom"
                  value={parentRoomId || ''}
                  onChange={(e) =>
                    setParentRoomId(
                      e.target.value ? parseInt(e.target.value, 10) : undefined
                    )
                  }
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select a parent room</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="knowledgeText">Knowledge Text</Label>
            <Textarea
              id="knowledgeText"
              value={knowledgeText}
              onChange={(e) => setKnowledgeText(e.target.value)}
              rows={8}
              placeholder="Enter knowledge text about this room..."
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
