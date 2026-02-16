'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SaveBar } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { UrlListEditor } from '../../../../components/shared';
import { ArtifactCreateInput, ArtifactImportData, Room } from '@/lib/types';
import { useAuthedApi } from '@/lib/useAuthedApi';

type FormData = {
  name: string;
  parentName: string;
  museumId: string;
  knowledgeText: string;
  furtherReading: string[];
  newRoomParentType?: 'museum' | 'room';
  newRoomParentRoomId?: string;
};

type ArtifactFormClientProps = {
  museumId: number;
  museumName: string;
  rooms: Room[];
  roomId?: number;
  initialParentName?: string;
  importedData?: ArtifactImportData | null;
};

export function ArtifactFormClient({
  museumId,
  museumName,
  rooms,
  initialParentName,
  importedData,
}: ArtifactFormClientProps) {
  const authedApi = useAuthedApi();
  const router = useRouter();
  const STORAGE_KEY = `artifact-form-${museumId}`;

  const [showAddNewRoom, setShowAddNewRoom] = useState(false);
  const [formData, setFormData] = useState<FormData>(() => ({
    name: '',
    parentName: initialParentName || '',
    museumId: museumId.toString(),
    knowledgeText: '',
    furtherReading: [],
    newRoomParentType: 'museum',
    newRoomParentRoomId: '',
  }));
  const isHydratedRef = useRef(false);
  const lastImportedRef = useRef<string>('');

  // Update form fields when JSON data is imported
  useEffect(() => {
    if (importedData) {
      // Create a stable key from the imported data to prevent infinite loops
      const dataKey = JSON.stringify({
        name: importedData.name,
        parentName: importedData.parentName,
        knowledgeText: importedData.knowledgeText,
        furtherReading: importedData.furtherReading,
      });

      // Only update if this is new data
      if (dataKey !== lastImportedRef.current) {
        lastImportedRef.current = dataKey;
        // Use queueMicrotask to defer state updates and avoid synchronous setState warning
        queueMicrotask(() => {
          setFormData((prev) => ({
            name: importedData.name || prev.name,
            parentName: importedData.parentName || prev.parentName,
            museumId: prev.museumId,
            knowledgeText: importedData.knowledgeText || prev.knowledgeText,
            furtherReading: importedData.furtherReading || prev.furtherReading,
          }));
          if (importedData.parentName) {
            setShowAddNewRoom(true);
          }
        });
      }
    }
  }, [importedData]);

  // Load from localStorage after hydration (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined' || isHydratedRef.current) return;

    isHydratedRef.current = true;

    // Load from localStorage
    // This is a valid pattern for loading persisted state after hydration
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FormData;
        // Using setTimeout to defer state update and avoid hydration mismatch
        setTimeout(() => {
          setFormData(parsed);
        }, 0);
      }
    } catch {
      // Failed to load from localStorage, ignore
    }
  }, [STORAGE_KEY]);

  const [, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Save to localStorage whenever formData changes (only after hydration)
  useEffect(() => {
    if (!isHydratedRef.current || typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    } catch {
      // Failed to save to localStorage, ignore
    }
  }, [formData, STORAGE_KEY]);

  const hasFormData = !!(
    formData.name.trim() ||
    formData.parentName.trim() ||
    formData.knowledgeText.trim() ||
    formData.furtherReading.length > 0
  );

  const handleFormChange = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }

    if (!formData.parentName.trim()) {
      alert('Room Name is required');
      return;
    }

    // Ensure museumId is a valid number
    const formMuseumId = formData.museumId.trim()
      ? parseInt(formData.museumId.trim(), 10)
      : null;
    const validMuseumId =
      formMuseumId && !isNaN(formMuseumId) ? formMuseumId : museumId;

    const artifactData: ArtifactCreateInput = {
      type: 'ARTIFACT',
      name: formData.name.trim(),
      parentName: formData.parentName.trim(),
      museumId: validMuseumId,
      knowledgeText: formData.knowledgeText.trim() || undefined,
      furtherReading: formData.furtherReading.filter((url) => url.trim()),
      newRoomParentType: formData.newRoomParentType,
      newRoomParentRoomId: formData.newRoomParentRoomId
        ? parseInt(formData.newRoomParentRoomId, 10)
        : undefined,
    };

    // Ensure museumId is provided when creating a new room
    if (!artifactData.museumId && !artifactData.parentId) {
      setErrorMessage(
        'Museum ID is required when creating a new room. A room must have a museum as its parent.'
      );
      setSaveStatus('error');
      return;
    }

    setSaveStatus('loading');
    setErrorMessage('');

    startTransition(async () => {
      try {
        let roomId: number | null = null;

        // museumId is required for artifacts.
        if (!artifactData.museumId || typeof artifactData.museumId !== 'number') {
          throw new Error('museumId is required for artifacts');
        }

        if (artifactData.parentId) {
          roomId = artifactData.parentId;
        } else if (artifactData.parentName) {
          const museumIdForRoom = artifactData.museumId;

          try {
            const existingRooms = await authedApi.get<
              Array<{ id: number; name: string; museumId: number | null }>
            >(`/museums/${museumIdForRoom}/rooms`);

            const existingRoom = existingRooms.find(
              (room) =>
                room.name.toLowerCase() ===
                  artifactData.parentName!.toLowerCase() &&
                room.museumId === museumIdForRoom
            );

            if (existingRoom) {
              roomId = existingRoom.id;
            }
          } catch (error) {
            console.error('Error fetching rooms:', error);
          }

          if (!roomId) {
            const roomParentType = artifactData.newRoomParentType || 'museum';
            const roomPayload: Record<string, unknown> = {
              name: artifactData.parentName,
              knowledgeText: null,
              furtherReading: [],
            };

            if (roomParentType === 'museum') {
              roomPayload.museumId = museumIdForRoom;
            } else if (
              roomParentType === 'room' &&
              artifactData.newRoomParentRoomId
            ) {
              roomPayload.parentRoomId = artifactData.newRoomParentRoomId;
            } else {
              roomPayload.museumId = museumIdForRoom;
            }

            const newRoom = await authedApi.mutate<{
              id: number;
              parentId: number;
            }>('/rooms', {
              method: 'POST',
              body: roomPayload,
            });

            roomId = newRoom.id;

            if (newRoom.parentId !== museumIdForRoom) {
              console.warn(
                `Room created with parentId ${newRoom.parentId}, expected ${museumIdForRoom}`
              );
            }
          }
        }

        const artifact = await authedApi.mutate<{ id: number }>('/artifacts', {
          method: 'POST',
          body: {
            name: artifactData.name,
            museumId: artifactData.museumId,
            roomId: roomId || null,
            knowledgeText: artifactData.knowledgeText || null,
            furtherReading: artifactData.furtherReading || [],
          },
        });

        // Clear localStorage on successful save
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
        setSaveStatus('success');
        router.push(`/admin/artifacts/${artifact.id}`);
      } catch (error: unknown) {
        console.error('Failed to create artifact:', error);
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Failed to create artifact. Please try again.';
        setErrorMessage(errorMsg);
        setSaveStatus('error');
        // Keep localStorage so user can retry
      }
    });
  };

  const handleDiscard = () => {
    setFormData({
      name: '',
      parentName: initialParentName || '',
      museumId: museumId.toString(),
      knowledgeText: '',
      furtherReading: [],
      newRoomParentType: 'museum',
      newRoomParentRoomId: '',
    });
    setShowAddNewRoom(false);
    setSaveStatus('idle');
    setErrorMessage('');
    // Clear localStorage when discarding
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <>
      {/* Manual Form */}
      <SectionCard title="Artifact Details">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              placeholder="Enter artifact name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parentName">Room</Label>
            <div className="flex items-center gap-2">
              {!showAddNewRoom ? (
                <>
                  <select
                    id="parentName"
                    value={formData.parentName}
                    onChange={(e) => {
                      const selectedRoomName = e.target.value;
                      handleFormChange('parentName', selectedRoomName);
                      // Ensure museumId matches the selected room's museum
                      if (selectedRoomName) {
                        const selectedRoom = rooms.find(
                          (r) => r.name === selectedRoomName
                        );
                        if (selectedRoom && selectedRoom.museumId) {
                          handleFormChange(
                            'museumId',
                            selectedRoom.museumId.toString()
                          );
                        }
                      }
                    }}
                    className="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Select a room</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.name}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setShowAddNewRoom(true);
                      handleFormChange('parentName', '');
                    }}
                  >
                    Add new room
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <Input
                      id="parentName"
                      value={formData.parentName}
                      onChange={(e) =>
                        handleFormChange('parentName', e.target.value)
                      }
                      placeholder="Enter new room name"
                      className="w-64"
                    />
                    <div className="flex items-center gap-2">
                      <Label htmlFor="newRoomParentType" className="text-xs">
                        Parent:
                      </Label>
                      <Button
                        type="button"
                        variant={
                          formData.newRoomParentType === 'museum'
                            ? 'default'
                            : 'secondary'
                        }
                        size="sm"
                        onClick={() => {
                          handleFormChange('newRoomParentType', 'museum');
                          handleFormChange('newRoomParentRoomId', '');
                        }}
                      >
                        Museum
                      </Button>
                      <Button
                        type="button"
                        variant={
                          formData.newRoomParentType === 'room'
                            ? 'default'
                            : 'secondary'
                        }
                        size="sm"
                        onClick={() => {
                          handleFormChange('newRoomParentType', 'room');
                        }}
                      >
                        Room
                      </Button>
                    </div>
                    {formData.newRoomParentType === 'room' && (
                      <select
                        id="newRoomParentRoomId"
                        value={formData.newRoomParentRoomId || ''}
                        onChange={(e) =>
                          handleFormChange(
                            'newRoomParentRoomId',
                            e.target.value
                          )
                        }
                        className="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="">Select a parent room</option>
                        {rooms.map((room) => (
                          <option key={room.id} value={room.id.toString()}>
                            {room.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowAddNewRoom(false);
                      handleFormChange('parentName', '');
                      handleFormChange('newRoomParentType', 'museum');
                      handleFormChange('newRoomParentRoomId', '');
                    }}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {showAddNewRoom
                ? formData.newRoomParentType === 'museum'
                  ? "Enter a new room name (will be created as a parent room if it doesn't exist)"
                  : "Enter a new room name (will be created as a child room if it doesn't exist)"
                : 'Select an existing room or add a new one'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="museumId">Museum ID</Label>
            <div className="flex items-center gap-2">
              <Input
                id="museumId"
                type="number"
                value={formData.museumId}
                onChange={(e) => handleFormChange('museumId', e.target.value)}
                placeholder="Enter museum ID"
                className="w-24"
                maxLength={4}
              />
              {museumName && (
                <span className="text-sm text-primary font-medium whitespace-nowrap">
                  {museumName}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Museum ID for this artifact
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="knowledgeText">Knowledge Text</Label>
            <Textarea
              id="knowledgeText"
              value={formData.knowledgeText}
              onChange={(e) =>
                handleFormChange('knowledgeText', e.target.value)
              }
              placeholder="Describe this artifact..."
              rows={8}
            />
          </div>

          <div className="space-y-2">
            <Label>Further Reading URLs</Label>
            <UrlListEditor
              value={formData.furtherReading}
              editable
              onChange={(urls) => handleFormChange('furtherReading', urls)}
              placeholder="https://example.com/article"
            />
          </div>
        </div>
      </SectionCard>

      {/* Save Bar */}
      <SaveBar
        isDirty={hasFormData}
        onSave={handleSave}
        onDiscard={handleDiscard}
        saveStatus={saveStatus}
        errorMessage={errorMessage}
      />
    </>
  );
}
