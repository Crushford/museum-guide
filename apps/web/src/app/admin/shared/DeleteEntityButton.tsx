'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/ui/error-text';
import { reportError } from '@/lib/report-error';
import { useAuthedApi } from '@/lib/useAuthedApi';

type EntityType = 'museum' | 'room' | 'artifact';

type DeleteEntityButtonProps = {
  entityType: EntityType;
  entityId: number;
  entityName: string;
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
  warningMessage,
}: DeleteEntityButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const authedApi = useAuthedApi();

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
        const resource =
          entityType === 'museum'
            ? 'museums'
            : entityType === 'room'
              ? 'rooms'
              : 'artifacts';
        await authedApi.mutate(`/${resource}/${entityId}`, {
          method: 'DELETE',
        });
        router.push(`/admin?tab=${resource}`);
        router.refresh();
      } catch (err) {
        console.error(`Failed to delete ${entityType}:`, err);
        reportError(err, {
          message: `Delete ${entityType} failed`,
          tags: { feature: 'admin-entities', action: 'delete-entity' },
          extra: { entityType, entityId, entityName },
        });
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
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
