'use client';

type SaveBarProps = {
  isDirty: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  lastSavedAt?: string;
};

export function SaveBar({
  isDirty,
  onSave,
  onDiscard,
  lastSavedAt,
}: SaveBarProps) {
  if (!isDirty) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-panel border-t border-border p-4 shadow-lg z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-fg">
            You have unsaved changes
          </span>
          {lastSavedAt && (
            <span className="text-xs text-muted">
              Last saved: {lastSavedAt}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onDiscard && (
            <button
              onClick={onDiscard}
              className="px-4 py-2 text-sm border border-border rounded-md text-fg hover:bg-bg-2 transition-colors"
            >
              Discard
            </button>
          )}
          {onSave && (
            <button
              onClick={onSave}
              className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent-2 transition-colors"
            >
              Save Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
