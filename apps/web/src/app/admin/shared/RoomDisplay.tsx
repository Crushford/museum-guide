'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ErrorText } from '@/components/ui/error-text';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/report-error';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { Room } from '@/lib/types';

type RoomDisplayProps = {
  artifactId: number;
  currentRoomId: number | null;
  currentMuseumId: number | null;
  rooms: Room[];
  parentParentRoom?: Room | null; // Parent room's parent room (if exists)
  onRoomChange?: (roomId: number | null) => void;
};

export function RoomDisplay({
  artifactId,
  currentRoomId,
  currentMuseumId,
  rooms,
  parentParentRoom,
  onRoomChange,
}: RoomDisplayProps) {
  const router = useRouter();
  const authedApi = useAuthedApi();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(
    currentRoomId
  );

  // Filter rooms based on current museum
  const filteredRooms = currentMuseumId
    ? rooms.filter((r) => r.parentId === currentMuseumId)
    : rooms;

  const currentRoom = currentRoomId
    ? rooms.find((r) => r.id === currentRoomId)
    : null;

  const handleSave = useCallback(async () => {
    if (!selectedRoomId) {
      alert('Please select a room');
      return;
    }

    try {
      await authedApi.mutate(`/nodes/${artifactId}`, {
        method: 'PATCH',
        body: { parentId: selectedRoomId },
      });
      onRoomChange?.(selectedRoomId);
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error('Failed to update room:', error);
      reportError(error, {
        message: 'Update artifact room failed',
        tags: { feature: 'admin-artifact', action: 'update-room' },
        extra: { artifactId, selectedRoomId, currentMuseumId },
      });
      alert('Failed to update room. Please try again.');
    }
  }, [
    selectedRoomId,
    artifactId,
    router,
    onRoomChange,
    authedApi,
    currentMuseumId,
  ]);

  const handleCancel = useCallback(() => {
    setSelectedRoomId(currentRoomId);
    setIsEditing(false);
  }, [currentRoomId]);

  if (isEditing) {
    return (
      <div className="space-y-2">
        <Label>Room</Label>
        <div className="flex items-center gap-2">
          <select
            value={selectedRoomId ?? ''}
            onChange={(e) => {
              setSelectedRoomId(e.target.value ? Number(e.target.value) : null);
            }}
            disabled={!currentMuseumId}
            className="flex h-10 flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select a room</option>
            {filteredRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!currentMuseumId}
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
        {!currentMuseumId && (
          <ErrorText>Please select a museum first to choose a room.</ErrorText>
        )}
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div className="space-y-2">
        <Label>Room</Label>
        <div className="flex items-center gap-2">
          <ErrorText>
            There is no room attached and you should attach one.
          </ErrorText>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsEditing(true)}
            disabled={!currentMuseumId}
            className="h-8 px-2"
          >
            Edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Room</Label>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/rooms/${currentRoom.id}`}
            className="text-primary hover:underline font-medium"
          >
            {currentRoom.name}
          </Link>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="h-8 px-2"
          >
            Edit
          </Button>
        </div>
        {parentParentRoom && (
          <div className="text-sm text-muted-foreground">
            Parent Room:{' '}
            <Link
              href={`/admin/rooms/${parentParentRoom.id}`}
              className="text-primary hover:underline"
            >
              {parentParentRoom.name}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
