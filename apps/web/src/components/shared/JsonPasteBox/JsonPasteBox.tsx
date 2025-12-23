type JsonPasteBoxProps = {
  label: string;
  value: string;
  onChange?: (next: string) => void;
  errors?: string[];
  placeholder?: string;
};

function isValidJson(str: string): boolean {
  if (!str.trim()) {
    return true;
  }
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export function JsonPasteBox({
  label,
  value,
  onChange,
  errors = [],
  placeholder = 'Paste JSON here...',
}: JsonPasteBoxProps) {
  const isValid = isValidJson(value);
  const hasErrors = errors.length > 0;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-fg">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-bg-2 border border-border rounded-md text-fg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-y min-h-[200px]"
      />
      <div className="space-y-1">
        {!hasErrors && isValid && value.trim() && (
          <p className="text-xs text-success">Valid JSON</p>
        )}
        {hasErrors && (
          <div className="space-y-1">
            {errors.map((error, index) => (
              <p key={index} className="text-xs text-danger">
                {error}
              </p>
            ))}
          </div>
        )}
        {!hasErrors && !isValid && value.trim() && (
          <p className="text-xs text-danger">Invalid JSON</p>
        )}
      </div>
    </div>
  );
}
