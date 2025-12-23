import { useState } from 'react';

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
    <div className="flex gap-6 py-3 border-b border-divider">
      <div className="w-48 flex-shrink-0">
        <label className="text-sm font-medium text-fg block mb-1">
          {label}
        </label>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="flex-1 flex flex-col gap-2">
        {isEditing ? (
          <textarea
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            rows={rows}
            className="w-full px-3 py-2 bg-bg-2 border border-border rounded-md text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-y"
            autoFocus
          />
        ) : (
          <p className="text-fg whitespace-pre-wrap">{value || '(empty)'}</p>
        )}
        {editable && !isEditing && (
          <button
            onClick={handleEdit}
            className="text-sm text-muted hover:text-accent transition-colors self-start"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
