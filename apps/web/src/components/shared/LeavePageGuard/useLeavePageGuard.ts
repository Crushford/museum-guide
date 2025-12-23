'use client';

import { useEffect } from 'react';

/**
 * Hook to guard against leaving a page with unsaved changes.
 * Shows a browser confirmation dialog when the user tries to leave.
 *
 * TODO: This only handles browser navigation (back/forward/close).
 * Internal Next.js route navigation guard will be added when admin pages exist.
 *
 * @param isDirty - Whether there are unsaved changes
 * @param message - Optional custom message for the confirmation dialog
 */
export function useLeavePageGuard(isDirty: boolean, message?: string): void {
  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        message || 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty, message]);
}
