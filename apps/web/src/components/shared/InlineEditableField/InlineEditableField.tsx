'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type InlineEditableFieldProps = {
  label: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  type?: 'text' | 'textarea';
  placeholder?: string;
  rows?: number;
  className?: string;
};

export function InlineEditableField({
  label,
  value: initialValue,
  onSave,
  type = 'text',
  placeholder,
  rows = 4,
  className = '',
}: InlineEditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    setValue(initialValue);
    setHasUnsavedChanges(false);
  }, [initialValue]);

  const handleEdit = () => {
    setIsEditing(true);
    setHasUnsavedChanges(false);
  };

  const handleCancel = () => {
    setValue(initialValue);
    setIsEditing(false);
    setHasUnsavedChanges(false);
  };

  const handleChange = (newValue: string) => {
    setValue(newValue);
    setHasUnsavedChanges(newValue !== initialValue);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(value);
      setIsEditing(false);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save:', error);
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
          {type === 'textarea' ? (
            <Textarea
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
              rows={rows}
              className="resize-y"
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
            />
          )}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
              size="sm"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              size="sm"
              disabled={isSaving}
            >
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
        <span className="flex-1 text-sm text-foreground min-h-[1.5rem] whitespace-pre-wrap">
          {value || (
            <span className="text-muted-foreground italic">Not set</span>
          )}
        </span>
        <Button
          onClick={handleEdit}
          variant="outline"
          size="sm"
          className="border-white"
        >
          Edit
        </Button>
      </div>
    </div>
  );
}
