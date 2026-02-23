'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

type SelectOption = {
  id: number;
  name: string;
};

type InlineEditableSelectProps = {
  label: string;
  value: number | null | undefined;
  options: SelectOption[];
  onSave: (value: number | null) => Promise<void>;
  placeholder?: string;
  className?: string;
  getHref?: (id: number) => string;
};

export function InlineEditableSelect({
  label,
  value: initialValue,
  options,
  onSave,
  placeholder = 'Select an option',
  className = '',
  getHref,
}: InlineEditableSelectProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<number | null | undefined>(initialValue);
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
    const numValue = newValue ? Number(newValue) : null;
    setValue(numValue);
    setHasUnsavedChanges(numValue !== initialValue);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(value ?? null);
      setIsEditing(false);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const displayValue = value
    ? options.find((opt) => opt.id === value)?.name
    : null;

  if (isEditing) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Label>{label}</Label>
        <div className="space-y-2">
          <select
            value={value ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
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

  const selectedOption = value ? options.find((opt) => opt.id === value) : null;

  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>
      <div className="flex items-start gap-2">
        <span className="flex-1 text-sm text-primary min-h-[1.5rem]">
          {selectedOption ? (
            getHref && value ? (
              <Link
                href={getHref(value)}
                className="text-accent hover:underline"
              >
                {selectedOption.name}
              </Link>
            ) : (
              selectedOption.name
            )
          ) : (
            <span className="text-muted-foreground italic">Not set</span>
          )}
        </span>
        <Button onClick={handleEdit} size="sm" className="border-line">
          Edit
        </Button>
      </div>
    </div>
  );
}
