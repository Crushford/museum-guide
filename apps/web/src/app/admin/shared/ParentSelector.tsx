'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ErrorText } from '@/components/ui/error-text';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { InlineEditableMuseumRoom } from '@/components/shared/InlineEditableMuseumRoom';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { Museum, Room } from '@/lib/types';

type ParentSelectorProps =
  | {
      type: 'museum';
      // Museums don't have parents
    }
  | {
      type: 'room';
      entityId: number;
      currentMuseumId: number | null;
      currentParentRoomId: number | null;
      museums: Museum[];
      parentRooms?: Room[]; // Available parent rooms for child room selection
      parentMuseum?: Museum | null; // Museum that the parent room belongs to (for child rooms)
      onMuseumChange?: (museumId: number | null) => void;
      isEditing?: boolean;
      onEditChange?: (editing: boolean) => void;
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
  const authedApi = useAuthedApi();

  // Room-specific state (only used when type === 'room')
  const [internalIsEditingRoom, setInternalIsEditingRoom] = useState(false);
  const isEditingRoom =
    props.type === 'room' && props.isEditing !== undefined
      ? props.isEditing
      : internalIsEditingRoom;
  const currentMuseumIdForRoom =
    props.type === 'room' ? props.currentMuseumId : null;
  const currentParentRoomIdForRoom =
    props.type === 'room' ? props.currentParentRoomId : null;

  // Determine if room is currently a parent room (has museum) or child room (has parentRoom)
  const isParentRoom = currentMuseumIdForRoom !== null;
  const [roomMode, setRoomMode] = useState<'parent' | 'child'>(() =>
    isParentRoom ? 'parent' : 'child'
  );

  const [selectedMuseumId, setSelectedMuseumId] = useState<number | null>(
    () => currentMuseumIdForRoom
  );
  const [selectedParentRoomId, setSelectedParentRoomId] = useState<
    number | null
  >(() => currentParentRoomIdForRoom);
  const lastMuseumIdForRoomRef = useRef(currentMuseumIdForRoom);
  const lastParentRoomIdForRoomRef = useRef(currentParentRoomIdForRoom);

  // Update selectedParentRoomId when currentParentRoomId changes
  useEffect(() => {
    if (
      props.type === 'room' &&
      currentParentRoomIdForRoom !== null &&
      lastParentRoomIdForRoomRef.current !== currentParentRoomIdForRoom
    ) {
      lastParentRoomIdForRoomRef.current = currentParentRoomIdForRoom;
      queueMicrotask(() => {
        setSelectedParentRoomId(currentParentRoomIdForRoom);
      });
    }
  }, [props.type, currentParentRoomIdForRoom]);

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
  const roomIsEditing = props.type === 'room' ? props.isEditing : undefined;
  const roomOnEditChange = props.type === 'room' ? props.onEditChange : null;

  const handleRoomParentChange = useCallback(
    async (museumId: number | null, parentRoomId: number | null) => {
      if (!roomEntityId) return;
      try {
        const updateData: {
          museumId?: number | null;
          parentRoomId?: number | null;
        } = {};
        if (museumId !== null) {
          updateData.museumId = museumId;
          updateData.parentRoomId = null;
        } else if (parentRoomId !== null) {
          updateData.parentRoomId = parentRoomId;
          updateData.museumId = null;
        } else {
          updateData.museumId = null;
          updateData.parentRoomId = null;
        }
        await authedApi.mutate(`/rooms/${roomEntityId}`, {
          method: 'PATCH',
          body: updateData,
        });
        setSelectedMuseumId(museumId);
        setSelectedParentRoomId(parentRoomId);
        roomOnMuseumChange?.(museumId);
        if (roomIsEditing === undefined) {
          setInternalIsEditingRoom(false);
        } else {
          roomOnEditChange?.(false);
        }
        router.refresh();
      } catch (error) {
        console.error('Failed to update room parent:', error);
        alert('Failed to update room parent. Please try again.');
      }
    },
    [
      roomEntityId,
      roomOnMuseumChange,
      roomIsEditing,
      roomOnEditChange,
      router,
      authedApi,
    ]
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
      await authedApi.mutate(`/nodes/${artifactEntityId}`, {
        method: 'PATCH',
        body: { parentId: selectedRoomId },
      });
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
      authedApi,
    ]
  );

  if (props.type === 'museum') {
    return null; // Museums don't have parents
  }

  if (props.type === 'room') {
    // Check current state - prioritize parentRoomId over museumId
    const hasParentRoom = currentParentRoomIdForRoom !== null;
    const hasMuseum = currentMuseumIdForRoom !== null;

    const currentMuseum = selectedMuseumId
      ? props.museums.find((m) => m.id === selectedMuseumId)
      : null;
    const currentParentRoom = selectedParentRoomId
      ? props.parentRooms?.find((r) => r.id === selectedParentRoomId)
      : null;

    // Display mode: show current parent (museum or parent room)
    // Prioritize showing parent room if it exists
    if (!isEditingRoom) {
      if (hasParentRoom && currentParentRoom) {
        return (
          <div className="space-y-2">
            <Label>Parent Room</Label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/rooms/${currentParentRoom.id}`}
                  className="text-primary hover:underline font-medium"
                >
                  {currentParentRoom.name}
                </Link>
                {props.isEditing === undefined && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (props.isEditing === undefined) {
                        setInternalIsEditingRoom(true);
                      } else {
                        props.onEditChange?.(true);
                      }
                    }}
                    className="h-8 px-2"
                  >
                    Edit
                  </Button>
                )}
              </div>
              {props.parentMuseum && (
                <div className="text-sm text-muted-foreground">
                  Museum:{' '}
                  <Link
                    href={`/admin/museums/${props.parentMuseum.id}`}
                    className="text-primary hover:underline"
                  >
                    {props.parentMuseum.name}
                  </Link>
                </div>
              )}
            </div>
          </div>
        );
      } else if (hasMuseum && currentMuseum) {
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
              {props.isEditing === undefined && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (props.isEditing === undefined) {
                      setInternalIsEditingRoom(true);
                    } else {
                      props.onEditChange?.(true);
                    }
                  }}
                  className="h-8 px-2"
                >
                  Edit
                </Button>
              )}
            </div>
          </div>
        );
      } else {
        // No parent set - show error message
        return (
          <div className="space-y-2">
            <Label>Parent</Label>
            <div className="flex items-center gap-2">
              <ErrorText>
                There is no parent attached and you should attach one.
              </ErrorText>
              {props.isEditing === undefined && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (props.isEditing === undefined) {
                      setInternalIsEditingRoom(true);
                    } else {
                      props.onEditChange?.(true);
                    }
                  }}
                  className="h-8 px-2"
                >
                  Edit
                </Button>
              )}
            </div>
          </div>
        );
      }
    }

    // Edit mode: show toggle and selector
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Room Type</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={roomMode === 'parent' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => {
                setRoomMode('parent');
                setSelectedParentRoomId(null);
              }}
            >
              Parent Room (Museum)
            </Button>
            <Button
              type="button"
              variant={roomMode === 'child' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => {
                setRoomMode('child');
                setSelectedMuseumId(null);
              }}
            >
              Child Room (Parent Room)
            </Button>
          </div>
        </div>

        {roomMode === 'parent' ? (
          <div className="space-y-2">
            <Label htmlFor="museumId">Museum</Label>
            <div className="flex items-center gap-2">
              <select
                id="museumId"
                value={selectedMuseumId || ''}
                onChange={(e) => {
                  const museumId = e.target.value
                    ? Number(e.target.value)
                    : null;
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
                onClick={() => handleRoomParentChange(selectedMuseumId, null)}
                disabled={!selectedMuseumId}
                className="h-10"
              >
                Save
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (props.isEditing === undefined) {
                    setInternalIsEditingRoom(false);
                  } else {
                    props.onEditChange?.(false);
                  }
                  setSelectedMuseumId(props.currentMuseumId);
                  setSelectedParentRoomId(props.currentParentRoomId);
                  setRoomMode(isParentRoom ? 'parent' : 'child');
                }}
                className="h-10"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="parentRoomId">Parent Room</Label>
            <div className="flex items-center gap-2">
              <select
                id="parentRoomId"
                value={selectedParentRoomId || ''}
                onChange={(e) => {
                  const parentRoomId = e.target.value
                    ? Number(e.target.value)
                    : null;
                  setSelectedParentRoomId(parentRoomId);
                }}
                className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select a parent room</option>
                {props.parentRooms?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() =>
                  handleRoomParentChange(null, selectedParentRoomId)
                }
                disabled={!selectedParentRoomId}
                className="h-10"
              >
                Save
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (props.isEditing === undefined) {
                    setInternalIsEditingRoom(false);
                  } else {
                    props.onEditChange?.(false);
                  }
                  setSelectedMuseumId(props.currentMuseumId);
                  setSelectedParentRoomId(props.currentParentRoomId);
                  setRoomMode(isParentRoom ? 'parent' : 'child');
                }}
                className="h-10"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
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
