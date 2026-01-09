'use client';

import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/SectionCard';
import { EntityList } from '@/components/shared/EntityList';
import Link from 'next/link';

type ChildEntity = {
  id: number;
  name: string;
  type: 'room' | 'artifact';
};

type ChildEntityListProps = {
  title: string;
  entities: ChildEntity[];
  newEntityRoute: string | null;
  newEntityLabel: string;
  emptyMessage: string;
};

export function ChildEntityList({
  title,
  entities,
  newEntityRoute,
  newEntityLabel,
  emptyMessage,
}: ChildEntityListProps) {
  if (entities.length > 0) {
    return (
      <SectionCard
        title={title}
        actions={
          newEntityRoute ? (
            <Button asChild size="sm">
              <Link href={newEntityRoute}>{newEntityLabel}</Link>
            </Button>
          ) : undefined
        }
      >
        <EntityList
          title=""
          items={entities.map((entity) => ({
            id: entity.id,
            name: entity.name,
            href:
              entity.type === 'room'
                ? `/admin/rooms/${entity.id}`
                : `/admin/artifacts/${entity.id}`,
            typePill: entity.type.toUpperCase(),
          }))}
          emptyState={null}
        />
      </SectionCard>
    );
  }

  if (newEntityRoute) {
    return (
      <SectionCard
        title={title}
        actions={
          <Button asChild size="sm">
            <Link href={newEntityRoute}>{newEntityLabel}</Link>
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </SectionCard>
    );
  }

  return null;
}
