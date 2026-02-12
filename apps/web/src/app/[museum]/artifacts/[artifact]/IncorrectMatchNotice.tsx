'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function IncorrectMatchNotice() {
  const [clicked, setClicked] = useState(false);

  return (
    <Alert variant="warning">
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
        <p className="mt-2 text-xs text-warning">
          TODO: wire incorrect-match review flow.
        </p>
      )}
    </Alert>
  );
}
