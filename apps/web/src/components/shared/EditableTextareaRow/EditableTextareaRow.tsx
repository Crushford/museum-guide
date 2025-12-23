'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

type EditableTextareaRowProps = {
  label: string;
  hint?: string;
  value: string;
  editable?: boolean;
  isEditing?: boolean;
  onEditToggle?: () => void;
  onChange?: (value: string) => void;
  rows?: number;
};

export function EditableTextareaRow({
  label,
  hint,
  value,
  editable = false,
  isEditing = false,
  onEditToggle,
  onChange,
  rows = 4,
}: EditableTextareaRowProps) {
  const [localValue, setLocalValue] = useState(value);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  const handleEdit = () => {
    if (editable && onEditToggle) {
      onEditToggle();
    }
  };

  return (
    <div className="flex gap-6 py-3 border-b border-border">
      <div className="w-48 flex-shrink-0">
        <label className="text-sm font-medium text-foreground block mb-1">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex-1 flex flex-col gap-2">
        {isEditing ? (
          <Textarea
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            rows={rows}
            className="w-full resize-y"
            autoFocus
          />
        ) : value ? (
          <>
            <p className="text-foreground whitespace-pre-wrap">{value}</p>
            {editable && (
              <button
                onClick={handleEdit}
                className="text-sm text-muted-foreground hover:text-primary transition-colors self-start"
              >
                Edit
              </button>
            )}
          </>
        ) : editable ? (
          <Button
            onClick={handleEdit}
            variant="outline"
            className="text-left justify-start"
          >
            <span className="text-muted-foreground">
              No content, click to add
            </span>
          </Button>
        ) : (
          <p className="text-muted-foreground">(empty)</p>
        )}
      </div>
    </div>
  );
}
