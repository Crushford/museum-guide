'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

type EntityType = 'museum' | 'room' | 'artifact';

type DeleteEntityButtonProps = {
  entityType: EntityType;
  entityId: number;
  entityName: string;
  onDelete: (id: number) => Promise<void>;
  warningMessage?: string;
};

const entityLabels: Record<EntityType, string> = {
  museum: 'Museum',
  room: 'Room',
  artifact: 'Artifact',
};

export function DeleteEntityButton({
  entityType,
  entityId,
  entityName,
  onDelete,
  warningMessage,
}: DeleteEntityButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const entityLabel = entityLabels[entityType];
  const defaultWarning =
    entityType === 'room'
      ? 'All child rooms and artifacts will also be deleted.'
      : undefined;

  const handleDelete = () => {
    const warning = warningMessage || defaultWarning;
    const message = warning
      ? `Are you sure you want to delete "${entityName}"? This action cannot be undone. ${warning}`
      : `Are you sure you want to delete "${entityName}"? This action cannot be undone.`;

    const confirmed = window.confirm(message);

    if (!confirmed) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await onDelete(entityId);
      } catch (err) {
        console.error(`Failed to delete ${entityType}:`, err);
        setError(
          err instanceof Error
            ? err.message
            : `Failed to delete ${entityLabel.toLowerCase()}`
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
        {isPending ? 'Deleting...' : `Delete ${entityLabel}`}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
