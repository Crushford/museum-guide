'use client';

import { ReactNode, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { TypePill } from '../TypePill';

type EditableRowProps = {
  label: string;
  hint?: string;
  value: string;
  editable?: boolean;
  isEditing?: boolean;
  onEditToggle?: () => void;
  onChange?: (value: string) => void;
  // Input-only
  type?: 'input' | 'textarea';
  typeBadge?: string;
  editor?: ReactNode;
  rightSlot?: ReactNode;
  // Textarea-only
  rows?: number;
};

export function EditableRow({
  label,
  hint,
  value,
  editable = false,
  isEditing = false,
  onEditToggle,
  onChange,
  type = 'input',
  typeBadge,
  editor,
  rightSlot,
  rows = 4,
}: EditableRowProps) {
  const [localValue, setLocalValue] = useState(value);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    onChange?.(newValue);
  };

  const handleEdit = () => {
    if (editable && onEditToggle) {
      onEditToggle();
    }
  };

  return (
    <div className="flex gap-6 py-3 border-b border-border">
      <div className="w-48 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <label className="text-sm font-medium text-primary">{label}</label>
          {typeBadge && <TypePill type={typeBadge} />}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      {type === 'textarea' ? (
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
              <p className="text-primary whitespace-pre-wrap">{value}</p>
              {editable && (
                <button
                  onClick={handleEdit}
                  className="text-sm text-muted-foreground hover:text-accent transition-colors self-start"
                >
                  Edit
                </button>
              )}
            </>
          ) : editable ? (
            <Button onClick={handleEdit} className="text-left justify-start">
              <span className="text-muted-foreground">
                No content, click to add
              </span>
            </Button>
          ) : (
            <p className="text-muted-foreground">(empty)</p>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-3">
          {isEditing ? (
            editor || (
              <Input
                type="text"
                value={localValue}
                onChange={(e) => handleChange(e.target.value)}
                className="flex-1"
                autoFocus
              />
            )
          ) : (
            <span className="text-primary">{value}</span>
          )}
          {rightSlot && <div className="flex-shrink-0">{rightSlot}</div>}
          {editable && !isEditing && (
            <button
              onClick={handleEdit}
              className="text-sm text-muted-foreground hover:text-accent transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
