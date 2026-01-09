'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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

  // Room-specific state (only used when type === 'room')
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const currentMuseumIdForRoom =
    props.type === 'room' ? props.currentMuseumId : null;
  const [selectedMuseumId, setSelectedMuseumId] = useState<number | null>(
    () => currentMuseumIdForRoom
  );
  const lastMuseumIdForRoomRef = useRef(currentMuseumIdForRoom);

  // Artifact-specific state (only used when type === 'artifact')
  const currentMuseumIdForArtifact =
    props.type === 'artifact' ? props.currentMuseumId : null;
  const currentRoomIdForArtifact =
    props.type === 'artifact' ? props.currentRoomId : null;
  const [museumId, setMuseumId] = useState<number | null>(
    () => currentMuseumIdForArtifact
  );
  const [roomId, setRoomId] = useState<number | null>(
    () => currentRoomIdForArtifact
  );
  const lastMuseumIdForArtifactRef = useRef(currentMuseumIdForArtifact);
  const lastRoomIdForArtifactRef = useRef(currentRoomIdForArtifact);

  // Update selectedMuseumId when currentMuseumId changes (for room type)
  useEffect(() => {
    if (
      props.type === 'room' &&
      currentMuseumIdForRoom !== null &&
      lastMuseumIdForRoomRef.current !== currentMuseumIdForRoom
    ) {
      lastMuseumIdForRoomRef.current = currentMuseumIdForRoom;
      queueMicrotask(() => {
        setSelectedMuseumId(currentMuseumIdForRoom);
      });
    }
  }, [props.type, currentMuseumIdForRoom]);

  // Update artifact state when props change
  useEffect(() => {
    if (
      props.type === 'artifact' &&
      lastMuseumIdForArtifactRef.current !== currentMuseumIdForArtifact
    ) {
      lastMuseumIdForArtifactRef.current = currentMuseumIdForArtifact;
      queueMicrotask(() => {
        setMuseumId(currentMuseumIdForArtifact);
      });
    }
  }, [props.type, currentMuseumIdForArtifact]);

  useEffect(() => {
    if (
      props.type === 'artifact' &&
      lastRoomIdForArtifactRef.current !== currentRoomIdForArtifact
    ) {
      lastRoomIdForArtifactRef.current = currentRoomIdForArtifact;
      queueMicrotask(() => {
        setRoomId(currentRoomIdForArtifact);
      });
    }
  }, [props.type, currentRoomIdForArtifact]);

  // Extract values for useCallback dependencies
  const roomEntityId = props.type === 'room' ? props.entityId : null;
  const roomOnMuseumChange =
    props.type === 'room' ? props.onMuseumChange : null;

  const handleRoomMuseumChange = useCallback(
    async (museumId: number | null) => {
      if (!roomEntityId) return;
      try {
        await updateNodeField(roomEntityId, 'parentId', museumId);
        setSelectedMuseumId(museumId);
        roomOnMuseumChange?.(museumId);
        setIsEditingRoom(false);
        router.refresh();
      } catch (error) {
        console.error('Failed to update museum:', error);
        alert('Failed to update museum. Please try again.');
      }
    },
    [roomEntityId, roomOnMuseumChange, router]
  );

  // Extract values for useCallback dependencies
  const artifactEntityId = props.type === 'artifact' ? props.entityId : null;
  const artifactRooms = props.type === 'artifact' ? props.rooms : null;
  const artifactOnRoomChange =
    props.type === 'artifact' ? props.onRoomChange : null;
  const artifactOnMuseumChange =
    props.type === 'artifact' ? props.onMuseumChange : null;

  const handleSaveMuseumRoom = useCallback(
    async (selectedMuseumId: number | null, selectedRoomId: number | null) => {
      if (!artifactEntityId || !artifactRooms) return;

      if (!selectedRoomId) {
        throw new Error('Room is required');
      }

      const selectedRoom = artifactRooms.find((r) => r.id === selectedRoomId);
      if (!selectedRoom) {
        throw new Error('Selected room not found');
      }

      // Verify room belongs to the selected museum (if museum was provided)
      if (selectedMuseumId && selectedRoom.parentId !== selectedMuseumId) {
        throw new Error('Selected room does not belong to the selected museum');
      }

      // Save the room change (parentId)
      await updateNodeField(artifactEntityId, 'parentId', selectedRoomId);
      setRoomId(selectedRoomId);
      setMuseumId(selectedMuseumId);
      artifactOnRoomChange?.(selectedRoomId);
      artifactOnMuseumChange?.(selectedMuseumId);
      router.refresh();
    },
    [
      artifactEntityId,
      artifactRooms,
      artifactOnRoomChange,
      artifactOnMuseumChange,
      router,
    ]
  );

  if (props.type === 'museum') {
    return null; // Museums don't have parents
  }

  if (props.type === 'room') {
    const currentMuseum = selectedMuseumId
      ? props.museums.find((m) => m.id === selectedMuseumId)
      : null;

    if (!isEditingRoom && currentMuseum) {
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsEditingRoom(true)}
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
        <Label htmlFor="parentId">Museum</Label>
        <div className="flex items-center gap-2">
          <select
            id="parentId"
            value={selectedMuseumId || ''}
            onChange={(e) => {
              const museumId = e.target.value ? Number(e.target.value) : null;
              setSelectedMuseumId(museumId);
            }}
            className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select a museum</option>
            {props.museums.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => handleRoomMuseumChange(selectedMuseumId)}
            className="h-10"
          >
            Save
          </Button>
          {currentMuseum && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsEditingRoom(false);
                setSelectedMuseumId(props.currentMuseumId);
              }}
              className="h-10"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Artifact type
  if (props.type === 'artifact') {
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

  return null;
}
