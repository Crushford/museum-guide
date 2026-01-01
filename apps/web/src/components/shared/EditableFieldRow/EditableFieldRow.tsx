'use client';

import { ReactNode, useState } from 'react';
import { Input } from '@/components/ui/input';
import { TypePill } from '../TypePill';

type EditableFieldRowProps = {
  label: string;
  hint?: string;
  typeBadge?: string;
  value: string;
  editable?: boolean;
  isEditing?: boolean;
  onEditToggle?: () => void;
  editor?: ReactNode;
  rightSlot?: ReactNode;
};

export function EditableFieldRow({
  label,
  hint,
  typeBadge,
  value,
  editable = false,
  isEditing = false,
  onEditToggle,
  editor,
  rightSlot,
}: EditableFieldRowProps) {
  const [localValue, setLocalValue] = useState(value);

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
      <div className="flex-1 flex items-center gap-3">
        {isEditing ? (
          editor || (
            <Input
              type="text"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
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
    </div>
  );
}
