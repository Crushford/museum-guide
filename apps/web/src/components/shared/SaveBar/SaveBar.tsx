'use client';

import { Button } from '@/components/ui/button';

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
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 shadow-lg z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-foreground">
            You have unsaved changes
          </span>
          {lastSavedAt && (
            <span className="text-xs text-muted-foreground">
              Last saved: {lastSavedAt}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onDiscard && (
            <Button onClick={onDiscard} variant="outline" size="sm">
              Discard
            </Button>
          )}
          {onSave && (
            <Button onClick={onSave} size="sm">
              Save Changes
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
