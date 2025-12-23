'use client';

import { ReactNode, useState } from 'react';
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
    <div className="flex gap-6 py-3 border-b border-divider">
      <div className="w-48 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <label className="text-sm font-medium text-fg">{label}</label>
          {typeBadge && <TypePill type={typeBadge} />}
        </div>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="flex-1 flex items-center gap-3">
        {isEditing ? (
          editor || (
            <input
              type="text"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              className="flex-1 px-3 py-2 bg-bg-2 border border-border rounded-md text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              autoFocus
            />
          )
        ) : (
          <span className="text-fg">{value}</span>
        )}
        {rightSlot && <div className="flex-shrink-0">{rightSlot}</div>}
        {editable && !isEditing && (
          <button
            onClick={handleEdit}
            className="text-sm text-muted hover:text-accent transition-colors"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
