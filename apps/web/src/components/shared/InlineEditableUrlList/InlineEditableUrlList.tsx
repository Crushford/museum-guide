'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { reportError } from '@/lib/report-error';
import { UrlListEditor } from '../UrlListEditor';

type InlineEditableUrlListProps = {
  label: string;
  value: string[];
  onSave: (value: string[]) => Promise<void>;
  className?: string;
  isEditing?: boolean;
  onEditChange?: (editing: boolean) => void;
};

export function InlineEditableUrlList({
  label,
  value: initialValue,
  onSave,
  className = '',
  isEditing: externalIsEditing,
  onEditChange,
}: InlineEditableUrlListProps) {
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const isEditing =
    externalIsEditing !== undefined ? externalIsEditing : internalIsEditing;
  const [value, setValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    setValue(initialValue);
    setHasUnsavedChanges(false);
  }, [initialValue]);

  const handleEdit = () => {
    if (externalIsEditing === undefined) {
      setInternalIsEditing(true);
    } else {
      onEditChange?.(true);
    }
    setHasUnsavedChanges(false);
  };

  const handleCancel = () => {
    setValue(initialValue);
    if (externalIsEditing === undefined) {
      setInternalIsEditing(false);
    } else {
      onEditChange?.(false);
    }
    setHasUnsavedChanges(false);
  };

  const handleChange = (newValue: string[]) => {
    setValue(newValue);
    const initialStr = JSON.stringify(initialValue.sort());
    const newStr = JSON.stringify(newValue.sort());
    setHasUnsavedChanges(initialStr !== newStr);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(value);
      if (externalIsEditing === undefined) {
        setInternalIsEditing(false);
      } else {
        onEditChange?.(false);
      }
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save:', error);
      reportError(error, {
        message: 'Inline URL list save failed',
        tags: { feature: 'inline-edit', action: 'save-url-list' },
        extra: { label },
      });
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Label>{label}</Label>
        <div className="space-y-2">
          <UrlListEditor value={value} editable onChange={handleChange} />
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
            {hasUnsavedChanges && (
              <span className="text-xs text-muted-foreground">
                Unsaved changes
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          {value.length > 0 ? (
            value.map((url, index) => (
              <div
                key={index}
                className="text-sm text-fg p-2 bg-raised rounded-md border border-line"
              >
                {url}
              </div>
            ))
          ) : (
            <span className="text-sm text-muted-foreground italic">
              No URLs added
            </span>
          )}
        </div>
        {externalIsEditing === undefined && (
          <Button onClick={handleEdit} size="sm" className="border-line">
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}
