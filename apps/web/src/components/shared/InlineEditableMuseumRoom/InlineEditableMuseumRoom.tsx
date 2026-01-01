'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

type SelectOption = {
  id: number;
  name: string;
  parentId?: number | null;
};

type InlineEditableMuseumRoomProps = {
  museumLabel: string;
  roomLabel: string;
  museumValue: number | null | undefined;
  roomValue: number | null | undefined;
  museums: SelectOption[];
  rooms: SelectOption[];
  onSave: (museumId: number | null, roomId: number | null) => Promise<void>;
  museumPlaceholder?: string;
  roomPlaceholder?: string;
  getMuseumHref?: (id: number) => string;
  getRoomHref?: (id: number) => string;
  className?: string;
};

export function InlineEditableMuseumRoom({
  museumLabel,
  roomLabel,
  museumValue: initialMuseumValue,
  roomValue: initialRoomValue,
  museums,
  rooms,
  onSave,
  museumPlaceholder = 'Select a museum',
  roomPlaceholder = 'Select a room',
  getMuseumHref,
  getRoomHref,
  className = '',
}: InlineEditableMuseumRoomProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [museumValue, setMuseumValue] = useState<number | null | undefined>(
    initialMuseumValue
  );
  const [roomValue, setRoomValue] = useState<number | null | undefined>(
    initialRoomValue
  );
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Derive museum from room's parentId if museumValue is not provided or not found in museums array
  useEffect(() => {
    // Check if museumValue exists in museums array
    const museumExists = initialMuseumValue
      ? museums.some((m) => m.id === initialMuseumValue)
      : false;

    // If museumValue is provided AND exists in museums array, use it
    if (initialMuseumValue && museumExists) {
      setMuseumValue(initialMuseumValue);
    } else if (initialRoomValue && rooms.length > 0) {
      // Otherwise, derive from room's parentId
      const room = rooms.find((r) => r.id === initialRoomValue);
      if (room?.parentId) {
        setMuseumValue(room.parentId);
      } else {
        setMuseumValue(initialMuseumValue || null);
      }
    } else {
      setMuseumValue(initialMuseumValue || null);
    }
    setRoomValue(initialRoomValue);
    setHasUnsavedChanges(false);
  }, [initialMuseumValue, initialRoomValue, rooms, museums]);

  const handleEdit = () => {
    setIsEditing(true);
    setHasUnsavedChanges(false);
    setSaveStatus('idle');
    setErrorMessage('');
  };

  const handleCancel = () => {
    setMuseumValue(initialMuseumValue);
    setRoomValue(initialRoomValue);
    setIsEditing(false);
    setHasUnsavedChanges(false);
    setSaveStatus('idle');
    setErrorMessage('');
  };

  const handleMuseumChange = (newValue: string) => {
    const numValue = newValue ? Number(newValue) : null;
    setMuseumValue(numValue);
    // Clear room if it doesn't belong to new museum
    if (numValue && roomValue) {
      const currentRoom = rooms.find((r) => r.id === roomValue);
      if (currentRoom && currentRoom.parentId !== numValue) {
        setRoomValue(null);
      }
    }
    setHasUnsavedChanges(
      numValue !== initialMuseumValue || roomValue !== initialRoomValue
    );
  };

  const handleRoomChange = (newValue: string) => {
    const numValue = newValue ? Number(newValue) : null;
    setRoomValue(numValue);

    // Automatically update museum if a room is selected and its museum is different
    if (numValue) {
      const selectedRoom = rooms.find((r) => r.id === numValue);
      if (selectedRoom?.parentId) {
        setMuseumValue(selectedRoom.parentId);
      }
    }

    setHasUnsavedChanges(
      museumValue !== initialMuseumValue || numValue !== initialRoomValue
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('loading');
    setErrorMessage('');
    try {
      await onSave(museumValue ?? null, roomValue ?? null);
      setSaveStatus('success');
      setIsEditing(false);
      setHasUnsavedChanges(false);
      // Auto-hide success message after 2 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    } catch (error) {
      console.error('Failed to save:', error);
      setSaveStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to save changes'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const museumOption = museumValue
    ? museums.find((m) => m.id === museumValue)
    : null;
  const roomOption = roomValue ? rooms.find((r) => r.id === roomValue) : null;

  // Filter rooms based on selected museum
  const filteredRooms = museumValue
    ? rooms.filter((r) => r.parentId === museumValue)
    : rooms;

  if (isEditing) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-2">
            <Label>{museumLabel}</Label>
            <select
              value={museumValue ?? ''}
              onChange={(e) => handleMuseumChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">{museumPlaceholder}</option>
              {museums.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 space-y-2">
            <Label>{roomLabel}</Label>
            <select
              value={roomValue ?? ''}
              onChange={(e) => handleRoomChange(e.target.value)}
              disabled={!museumValue}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{roomPlaceholder}</option>
              {filteredRooms.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            size="sm"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button onClick={handleCancel} size="sm" disabled={isSaving}>
            Cancel
          </Button>
          {saveStatus === 'loading' && (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
              <span className="text-xs text-muted-foreground">Saving...</span>
            </div>
          )}
          {saveStatus === 'success' && (
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-xs text-green-500">Saved!</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span className="text-xs text-destructive">
                {errorMessage || 'Failed to save'}
              </span>
            </div>
          )}
          {hasUnsavedChanges && saveStatus === 'idle' && (
            <span className="text-xs text-muted-foreground">
              Unsaved changes
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">{museumLabel}</Label>
          <div className="text-sm text-primary min-h-[1.5rem]">
            {museumOption ? (
              getMuseumHref ? (
                <Link
                  href={getMuseumHref(museumOption.id)}
                  className="text-accent hover:underline"
                >
                  {museumOption.name}
                </Link>
              ) : (
                museumOption.name
              )
            ) : (
              <span className="text-muted-foreground italic">Not set</span>
            )}
          </div>
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">{roomLabel}</Label>
          <div className="text-sm text-primary min-h-[1.5rem]">
            {roomOption ? (
              getRoomHref ? (
                <Link
                  href={getRoomHref(roomOption.id)}
                  className="text-accent hover:underline"
                >
                  {roomOption.name}
                </Link>
              ) : (
                roomOption.name
              )
            ) : (
              <span className="text-muted-foreground italic">Not set</span>
            )}
          </div>
        </div>
        <Button onClick={handleEdit} size="sm" className="border-white mt-6">
          Edit
        </Button>
      </div>
    </div>
  );
}
