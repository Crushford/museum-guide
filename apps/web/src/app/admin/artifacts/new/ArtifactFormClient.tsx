'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { JsonPasteBox } from '../../../../components/shared';
import { SaveBar } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { UrlListEditor } from '../../../../components/shared';
import { createArtifactWithRoom } from './actions';

type ArtifactData = {
  type: 'ARTIFACT';
  name: string;
  parentId?: number;
  parentName?: string;
  museumId?: number;
  museumName?: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

type FormData = {
  name: string;
  parentName: string;
  museumId: string;
  knowledgeText: string;
  furtherReading: string[];
};

type ConflictField = {
  field: keyof FormData;
  oldValue: string | string[];
  newValue: string | string[];
};

type ConflictResolution = {
  [K in keyof FormData]?: 'keep' | 'replace';
};

function validateJson(jsonString: string): {
  isValid: boolean;
  data: ArtifactData | null;
  errors: string[];
} {
  if (!jsonString.trim()) {
    return {
      isValid: false,
      data: null,
      errors: [],
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonString) as Record<string, unknown>;
  } catch {
    return {
      isValid: false,
      data: null,
      errors: ['Invalid JSON format'],
    };
  }

  const errors: string[] = [];

  // Validate required fields
  if (!parsed.type) {
    errors.push('Missing required field: type');
  } else if (
    typeof parsed.type === 'string' &&
    parsed.type.toUpperCase() !== 'ARTIFACT'
  ) {
    errors.push('Type must be ARTIFACT');
  }

  if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
    errors.push('Missing or invalid field: name');
  }

  // Validate parent requirements
  if (!parsed.parentId && !parsed.parentName) {
    errors.push('ARTIFACT requires either parentId or parentName');
  }

  if (parsed.parentName && !parsed.museumId && !parsed.museumName) {
    errors.push(
      'When using parentName, museumId or museumName must be provided for automatic room creation'
    );
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      data: null,
      errors,
    };
  }

  return {
    isValid: true,
    data: {
      type: 'ARTIFACT',
      name: typeof parsed.name === 'string' ? parsed.name.trim() : '',
      parentId:
        typeof parsed.parentId === 'number' ? parsed.parentId : undefined,
      parentName:
        typeof parsed.parentName === 'string' ? parsed.parentName : undefined,
      museumId:
        typeof parsed.museumId === 'number' ? parsed.museumId : undefined,
      museumName:
        typeof parsed.museumName === 'string' ? parsed.museumName : undefined,
      knowledgeText:
        typeof parsed.knowledgeText === 'string'
          ? parsed.knowledgeText
          : undefined,
      furtherReading:
        Array.isArray(parsed.furtherReading) &&
        parsed.furtherReading.every((item) => typeof item === 'string')
          ? (parsed.furtherReading as string[])
          : [],
    },
    errors: [],
  };
}

function detectConflicts(
  formData: FormData,
  jsonData: ArtifactData
): ConflictField[] {
  const conflicts: ConflictField[] = [];

  // Check name conflict
  if (formData.name.trim() && jsonData.name !== formData.name.trim()) {
    conflicts.push({
      field: 'name',
      oldValue: formData.name,
      newValue: jsonData.name,
    });
  }

  // Check parentName conflict
  if (
    formData.parentName.trim() &&
    jsonData.parentName &&
    formData.parentName.trim() !== jsonData.parentName
  ) {
    conflicts.push({
      field: 'parentName',
      oldValue: formData.parentName,
      newValue: jsonData.parentName,
    });
  }

  // Check museumId conflict
  const formMuseumId = formData.museumId.trim();
  if (
    formMuseumId &&
    jsonData.museumId &&
    parseInt(formMuseumId, 10) !== jsonData.museumId
  ) {
    conflicts.push({
      field: 'museumId',
      oldValue: formMuseumId,
      newValue: jsonData.museumId.toString(),
    });
  }

  // Check knowledgeText conflict
  if (
    formData.knowledgeText.trim() &&
    jsonData.knowledgeText &&
    formData.knowledgeText.trim() !== jsonData.knowledgeText
  ) {
    conflicts.push({
      field: 'knowledgeText',
      oldValue: formData.knowledgeText,
      newValue: jsonData.knowledgeText,
    });
  }

  // Check furtherReading conflict
  const formUrls = formData.furtherReading.filter((url) => url.trim());
  const jsonUrls = jsonData.furtherReading || [];
  if (
    formUrls.length > 0 &&
    JSON.stringify(formUrls.sort()) !== JSON.stringify(jsonUrls.sort())
  ) {
    conflicts.push({
      field: 'furtherReading',
      oldValue: formUrls,
      newValue: jsonUrls,
    });
  }

  return conflicts;
}

function ConflictResolutionUI({
  conflicts,
  onResolve,
}: {
  conflicts: ConflictField[];
  onResolve: (resolution: ConflictResolution) => void;
}) {
  const [resolutions, setResolutions] = useState<ConflictResolution>(() => {
    const initial: ConflictResolution = {};
    conflicts.forEach((conflict) => {
      initial[conflict.field] = 'keep';
    });
    return initial;
  });

  const handleResolve = (field: keyof FormData, choice: 'keep' | 'replace') => {
    setResolutions((prev) => ({ ...prev, [field]: choice }));
  };

  const handleApply = () => {
    onResolve(resolutions);
  };

  const getFieldLabel = (field: keyof FormData): string => {
    const labels: Record<keyof FormData, string> = {
      name: 'Name',
      parentName: 'Room Name',
      museumId: 'Museum ID',
      knowledgeText: 'Knowledge Text',
      furtherReading: 'Further Reading',
    };
    return labels[field];
  };

  const formatValue = (value: string | string[]): string => {
    if (Array.isArray(value)) {
      return value.length === 0
        ? '(empty)'
        : value.map((url, i) => `${i + 1}. ${url}`).join('\n');
    }
    return value || '(empty)';
  };

  return (
    <div className="space-y-4 p-4 bg-muted rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-primary">
          Conflict Resolution Required
        </h3>
        <p className="text-sm text-muted-foreground">
          The JSON contains different values. Choose which to keep for each
          field.
        </p>
      </div>

      <div className="space-y-4">
        {conflicts.map((conflict) => (
          <div
            key={conflict.field}
            className="p-4 bg-background rounded-md border border-border"
          >
            <Label className="text-base font-medium text-primary mb-3 block">
              {getFieldLabel(conflict.field)}
            </Label>

            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-medium text-primary">
                    Current Value
                  </span>
                </div>
                <div className="p-3 bg-muted rounded border border-border">
                  <pre className="text-sm text-primary whitespace-pre-wrap break-words">
                    {formatValue(conflict.oldValue)}
                  </pre>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm font-medium text-primary">
                    New Value (from JSON)
                  </span>
                </div>
                <div className="p-3 bg-muted rounded border border-border">
                  <pre className="text-sm text-primary whitespace-pre-wrap break-words">
                    {formatValue(conflict.newValue)}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant={
                  resolutions[conflict.field] === 'keep'
                    ? 'default'
                    : 'secondary'
                }
                onClick={() => handleResolve(conflict.field, 'keep')}
              >
                Keep Current
              </Button>
              <Button
                size="sm"
                variant={
                  resolutions[conflict.field] === 'replace'
                    ? 'default'
                    : 'secondary'
                }
                onClick={() => handleResolve(conflict.field, 'replace')}
              >
                Use New
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button onClick={handleApply} size="sm">
          Apply Resolution
        </Button>
      </div>
    </div>
  );
}

type Room = {
  id: number;
  name: string;
  type: 'ROOM';
  parentId: number | null;
};

type ArtifactFormClientProps = {
  museumId: number;
  museumName: string;
  rooms: Room[];
  roomId?: number;
  initialParentName?: string;
};

export function ArtifactFormClient({
  museumId,
  museumName,
  rooms,
  initialParentName,
}: ArtifactFormClientProps) {
  const STORAGE_KEY = `artifact-form-${museumId}`;

  const [showAddNewRoom, setShowAddNewRoom] = useState(false);
  const [formData, setFormData] = useState<FormData>(() => ({
    name: '',
    parentName: initialParentName || '',
    museumId: museumId.toString(),
    knowledgeText: '',
    furtherReading: [],
  }));
  const isHydratedRef = useRef(false);

  // Load from localStorage after hydration (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined' || isHydratedRef.current) return;

    isHydratedRef.current = true;

    // Load from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FormData;
        // eslint-disable-next-line react-compiler/react-compiler
        setFormData(parsed);
      }
    } catch {
      // Failed to load from localStorage, ignore
    }
  }, [STORAGE_KEY]);

  const [jsonString, setJsonString] = useState('');
  const [conflicts, setConflicts] = useState<ConflictField[]>([]);
  const [showConflictResolution, setShowConflictResolution] = useState(false);
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

  const validation = validateJson(jsonString);
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

  const handleJsonChange = (newJson: string) => {
    setJsonString(newJson);
    setShowConflictResolution(false);
    setConflicts([]);
  };

  const handleJsonImport = () => {
    if (!validation.isValid || !validation.data) {
      return;
    }

    const detectedConflicts = detectConflicts(formData, validation.data);

    if (detectedConflicts.length > 0) {
      setConflicts(detectedConflicts);
      setShowConflictResolution(true);
    } else {
      // No conflicts, apply JSON data directly
      applyJsonData(validation.data);
    }
  };

  const applyJsonData = (jsonData: ArtifactData) => {
    setFormData((prev) => ({
      name: jsonData.name || prev.name,
      parentName: jsonData.parentName || prev.parentName,
      museumId: jsonData.museumId?.toString() || prev.museumId,
      knowledgeText: jsonData.knowledgeText || prev.knowledgeText,
      furtherReading: jsonData.furtherReading || prev.furtherReading,
    }));
    setJsonString('');
    setShowConflictResolution(false);
    setConflicts([]);
  };

  const handleConflictResolution = (resolution: ConflictResolution) => {
    if (!validation.data) return;

    const updatedFormData = { ...formData };

    conflicts.forEach((conflict) => {
      const choice = resolution[conflict.field];
      if (choice === 'replace') {
        if (conflict.field === 'furtherReading') {
          updatedFormData[conflict.field] = conflict.newValue as string[];
        } else {
          updatedFormData[conflict.field] = conflict.newValue as string;
        }
      }
    });

    // Apply non-conflicting fields from JSON
    if (!conflicts.find((c) => c.field === 'name')) {
      updatedFormData.name = validation.data.name || updatedFormData.name;
    }
    if (!conflicts.find((c) => c.field === 'parentName')) {
      updatedFormData.parentName =
        validation.data.parentName || updatedFormData.parentName;
    }
    if (!conflicts.find((c) => c.field === 'museumId')) {
      updatedFormData.museumId =
        validation.data.museumId?.toString() || updatedFormData.museumId;
    }
    if (!conflicts.find((c) => c.field === 'knowledgeText')) {
      updatedFormData.knowledgeText =
        validation.data.knowledgeText || updatedFormData.knowledgeText;
    }
    if (!conflicts.find((c) => c.field === 'furtherReading')) {
      updatedFormData.furtherReading =
        validation.data.furtherReading || updatedFormData.furtherReading;
    }

    setFormData(updatedFormData);
    setJsonString('');
    setShowConflictResolution(false);
    setConflicts([]);
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

    const artifactData: ArtifactData = {
      type: 'ARTIFACT',
      name: formData.name.trim(),
      parentName: formData.parentName.trim(),
      museumId: formData.museumId.trim()
        ? parseInt(formData.museumId.trim(), 10)
        : museumId,
      knowledgeText: formData.knowledgeText.trim() || undefined,
      furtherReading: formData.furtherReading.filter((url) => url.trim()),
    };

    const finalMuseumId = artifactData.museumId || museumId;

    setSaveStatus('loading');
    setErrorMessage('');

    startTransition(async () => {
      try {
        await createArtifactWithRoom(artifactData, finalMuseumId);
        // Clear localStorage on successful save
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
        setSaveStatus('success');
        // If successful, redirect will happen server-side
      } catch (error: unknown) {
        // Next.js redirect() throws a special error - don't show it as an error
        if (
          error &&
          typeof error === 'object' &&
          ('digest' in error || 'message' in error)
        ) {
          const errorObj = error as { digest?: string; message?: string };
          if (
            errorObj.digest?.startsWith('NEXT_REDIRECT') ||
            errorObj.message === 'NEXT_REDIRECT'
          ) {
            // Clear localStorage on successful redirect
            if (typeof window !== 'undefined') {
              localStorage.removeItem(STORAGE_KEY);
            }
            setSaveStatus('success');
            // Let the redirect happen
            return;
          }
        }
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
    });
    setShowAddNewRoom(false);
    setJsonString('');
    setShowConflictResolution(false);
    setConflicts([]);
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
                        if (selectedRoom && selectedRoom.parentId) {
                          handleFormChange(
                            'museumId',
                            selectedRoom.parentId.toString()
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
                  <Input
                    id="parentName"
                    value={formData.parentName}
                    onChange={(e) =>
                      handleFormChange('parentName', e.target.value)
                    }
                    placeholder="Enter new room name"
                    className="w-64"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowAddNewRoom(false);
                      handleFormChange('parentName', '');
                    }}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {showAddNewRoom
                ? "Enter a new room name (will be created if it doesn't exist)"
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

      {/* JSON Import */}
      <SectionCard title="Import from JSON">
        <div className="space-y-4">
          <JsonPasteBox
            label="Artifact JSON"
            value={jsonString}
            onChange={handleJsonChange}
            errors={validation.errors}
            placeholder='{"type": "ARTIFACT", "name": "Artifact Name", "parentName": "Room Name", ...}'
          />

          {validation.isValid && validation.data && (
            <div className="flex justify-end">
              <Button onClick={handleJsonImport} size="sm">
                Import JSON to Form
              </Button>
            </div>
          )}

          {showConflictResolution && conflicts.length > 0 && (
            <ConflictResolutionUI
              conflicts={conflicts}
              onResolve={handleConflictResolution}
            />
          )}
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
