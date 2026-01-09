'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { InlineEditableMuseumRoom } from '@/components/shared/InlineEditableMuseumRoom';
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

type ParentSelectorProps =
  | {
      type: 'museum';
      // Museums don't have parents
    }
  | {
      type: 'room';
      entityId: number;
      currentMuseumId: number | null;
      museums: Museum[];
      onMuseumChange?: (museumId: number | null) => void;
    }
  | {
      type: 'artifact';
      entityId: number;
      currentRoomId: number | null;
      currentMuseumId: number | null;
      museums: Museum[];
      rooms: Room[];
      onRoomChange?: (roomId: number | null) => void;
      onMuseumChange?: (museumId: number | null) => void;
    };

export function ParentSelector(props: ParentSelectorProps) {
  const router = useRouter();

  if (props.type === 'museum') {
    return null; // Museums don't have parents
  }

  if (props.type === 'room') {
    const handleMuseumChange = useCallback(
      async (museumId: number | null) => {
        try {
          await updateNodeField(props.entityId, 'parentId', museumId);
          props.onMuseumChange?.(museumId);
          router.refresh();
        } catch (error) {
          console.error('Failed to update museum:', error);
          alert('Failed to update museum. Please try again.');
        }
      },
      [props.entityId, router, props.onMuseumChange]
    );

    return (
      <div className="space-y-2">
        <Label htmlFor="parentId">Museum</Label>
        <select
          id="parentId"
          value={props.currentMuseumId || ''}
          onChange={(e) => {
            const museumId = e.target.value ? Number(e.target.value) : null;
            handleMuseumChange(museumId);
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Select a museum</option>
          {props.museums.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Artifact type
  const [museumId, setMuseumId] = useState<number | null>(
    props.currentMuseumId
  );
  const [roomId, setRoomId] = useState<number | null>(props.currentRoomId);

  useEffect(() => {
    setMuseumId(props.currentMuseumId);
  }, [props.currentMuseumId]);

  useEffect(() => {
    setRoomId(props.currentRoomId);
  }, [props.currentRoomId]);

  const handleSaveMuseumRoom = useCallback(
    async (selectedMuseumId: number | null, selectedRoomId: number | null) => {
      if (!selectedRoomId) {
        throw new Error('Room is required');
      }

      const selectedRoom = props.rooms.find((r) => r.id === selectedRoomId);
      if (!selectedRoom) {
        throw new Error('Selected room not found');
      }

      // Verify room belongs to the selected museum (if museum was provided)
      if (selectedMuseumId && selectedRoom.parentId !== selectedMuseumId) {
        throw new Error('Selected room does not belong to the selected museum');
      }

      // Save the room change (parentId)
      await updateNodeField(props.entityId, 'parentId', selectedRoomId);
      setRoomId(selectedRoomId);
      setMuseumId(selectedMuseumId);
      props.onRoomChange?.(selectedRoomId);
      props.onMuseumChange?.(selectedMuseumId);
      router.refresh();
    },
    [
      props.entityId,
      props.rooms,
      router,
      props.onRoomChange,
      props.onMuseumChange,
    ]
  );

  return (
    <InlineEditableMuseumRoom
      museumLabel="Museum"
      roomLabel="Room"
      museumValue={museumId}
      roomValue={roomId}
      museums={props.museums.map((m) => ({ id: m.id, name: m.name }))}
      rooms={props.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        parentId: r.parentId,
      }))}
      onSave={handleSaveMuseumRoom}
      museumPlaceholder="Select a museum"
      roomPlaceholder="Select a room"
      getMuseumHref={(id) => `/admin/museums/${id}`}
      getRoomHref={(id) => `/admin/rooms/${id}`}
    />
  );
}
