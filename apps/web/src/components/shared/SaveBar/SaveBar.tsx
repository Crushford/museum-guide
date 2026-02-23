'use client';

import { Button } from '@/components/ui/button';

type SaveBarProps = {
  isDirty: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  lastSavedAt?: string;
  saveStatus?: 'idle' | 'loading' | 'success' | 'error';
  errorMessage?: string;
};

export function SaveBar({
  isDirty,
  onSave,
  onDiscard,
  lastSavedAt,
  saveStatus = 'idle',
  errorMessage,
}: SaveBarProps) {
  if (!isDirty && saveStatus === 'idle') {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-line p-4 shadow-lg z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          {saveStatus === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
              <span className="text-sm font-medium text-primary">
                Saving changes...
              </span>
            </>
          )}
          {saveStatus === 'success' && (
            <>
              <svg
                className="h-4 w-4 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-sm font-medium text-primary">
                Saved successfully!
              </span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <svg
                className="h-4 w-4 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span className="text-sm font-medium text-destructive">
                {errorMessage || 'Failed to save changes'}
              </span>
            </>
          )}
          {saveStatus === 'idle' && (
            <span className="text-sm font-medium text-primary">
              You have unsaved changes
            </span>
          )}
          {lastSavedAt && saveStatus === 'idle' && (
            <span className="text-xs text-muted-foreground">
              Last saved: {lastSavedAt}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onDiscard && saveStatus !== 'loading' && (
            <Button
              onClick={onDiscard}
              size="sm"
              disabled={saveStatus === 'success'}
            >
              Discard
            </Button>
          )}
          {onSave && (
            <Button
              onClick={onSave}
              size="sm"
              disabled={saveStatus === 'loading' || saveStatus === 'success'}
            >
              {saveStatus === 'loading' ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
