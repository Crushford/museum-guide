'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { updateNodeField } from './actions';

type Museum = {
  id: number;
  name: string;
};

type Room = {
  id: number;
  name: string;
  parentId: number | null;
};

type MuseumDisplayProps = {
  artifactId: number;
  currentMuseum: Museum | null;
  currentRoomId: number | null;
  museums: Museum[];
  rooms: Room[];
  allowEdit?: boolean; // Whether editing is allowed (default: true)
  onMuseumChange?: (museumId: number | null) => void;
};

export function MuseumDisplay({
  artifactId,
  currentMuseum,
  currentRoomId,
  museums,
  rooms,
  allowEdit = true,
  onMuseumChange,
}: MuseumDisplayProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMuseumId, setSelectedMuseumId] = useState<number | null>(
    currentMuseum?.id ?? null
  );

  const handleSave = useCallback(async () => {
    if (!selectedMuseumId) {
      alert('Please select a museum');
      return;
    }

    try {
      // Find a room in the selected museum
      const roomsInMuseum = rooms.filter(
        (r) => r.parentId === selectedMuseumId
      );

      if (roomsInMuseum.length === 0) {
        alert(
          `No rooms found in the selected museum. Please create a room first.`
        );
        return;
      }

      // Use the first room in the museum, or try to keep the current room if it's in the new museum
      const newRoomId =
        currentRoomId && roomsInMuseum.some((r) => r.id === currentRoomId)
          ? currentRoomId
          : roomsInMuseum[0].id;

      // Update the artifact's roomId (which is stored as parentId)
      await updateNodeField(artifactId, 'parentId', newRoomId);
      onMuseumChange?.(selectedMuseumId);
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error('Failed to update museum:', error);
      alert('Failed to update museum. Please try again.');
    }
  }, [
    selectedMuseumId,
    artifactId,
    currentRoomId,
    rooms,
    router,
    onMuseumChange,
  ]);

  const handleCancel = useCallback(() => {
    setSelectedMuseumId(currentMuseum?.id ?? null);
    setIsEditing(false);
  }, [currentMuseum]);

  if (isEditing) {
    return (
      <div className="space-y-2">
        <Label>Museum</Label>
        <div className="flex items-center gap-2">
          <select
            value={selectedMuseumId ?? ''}
            onChange={(e) => {
              setSelectedMuseumId(
                e.target.value ? Number(e.target.value) : null
              );
            }}
            className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select a museum</option>
            {museums.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            className="h-10"
          >
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCancel}
            className="h-10"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (!currentMuseum) {
    return (
      <div className="space-y-2">
        <Label>Museum</Label>
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive">
            There is no museum attached and you should attach one.
          </p>
          {allowEdit && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-8 px-2"
            >
              Edit
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Museum</Label>
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/museums/${currentMuseum.id}`}
          className="text-primary hover:underline font-medium"
        >
          {currentMuseum.name}
        </Link>
        {allowEdit && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="h-8 px-2"
          >
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}
