'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { deleteMuseum } from './actions';

type DeleteMuseumButtonProps = {
  museumId: number;
  museumName: string;
};

export function DeleteMuseumButton({
  museumId,
  museumName,
}: DeleteMuseumButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${museumName}"? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await deleteMuseum(museumId);
      } catch (err) {
        console.error('Failed to delete museum:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to delete museum'
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleDelete}
        disabled={isPending}
        variant="destructive"
        size="sm"
      >
        {isPending ? 'Deleting...' : 'Delete Museum'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
