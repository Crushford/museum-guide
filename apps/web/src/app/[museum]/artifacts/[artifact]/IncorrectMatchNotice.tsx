'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function IncorrectMatchNotice() {
  const [clicked, setClicked] = useState(false);

  return (
    <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-amber-900">
      <p className="text-sm">
        This page was opened from a scan duplicate match. If this is wrong, flag
        it.
      </p>
      <Button
        className="mt-2"
        variant="secondary"
        size="sm"
        onClick={() => {
          setClicked(true);
        }}
      >
        Incorrect match
      </Button>
      {clicked && (
        <p className="mt-2 text-xs text-amber-800">
          TODO: wire incorrect-match review flow.
        </p>
      )}
    </div>
  );
}
