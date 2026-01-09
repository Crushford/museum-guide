'use client';

import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/SectionCard';
import { EntityList } from '@/components/shared/EntityList';
import Link from 'next/link';

type ChildEntity = {
  id: number;
  name: string;
  type: 'room' | 'artifact';
  museum?: string | null;
};

type ChildEntityListProps = {
  title: string;
  subtitle?: string;
  entities: ChildEntity[];
  newEntityRoute: string | null;
  newEntityLabel: string;
  emptyMessage: string;
  inline?: boolean; // If true, render without SectionCard wrapper
};

export function ChildEntityList({
  title,
  subtitle,
  entities,
  newEntityRoute,
  newEntityLabel,
  emptyMessage,
  inline = false,
}: ChildEntityListProps) {
  const content = (
    <>
      {entities.length > 0 ? (
        <EntityList
          title=""
          items={entities.map((entity) => ({
            id: entity.id,
            name: entity.name,
            subtitle: entity.museum ? `Museum: ${entity.museum}` : undefined,
            href:
              entity.type === 'room'
                ? `/admin/rooms/${entity.id}`
                : `/admin/artifacts/${entity.id}`,
            typePill: entity.type.toUpperCase(),
          }))}
          emptyState={null}
        />
      ) : newEntityRoute ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : null}
    </>
  );

  if (inline) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-primary">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          {newEntityRoute && (
            <Button asChild size="sm">
              <Link href={newEntityRoute}>{newEntityLabel}</Link>
            </Button>
          )}
        </div>
        {content}
      </div>
    );
  }

  if (entities.length > 0) {
    return (
      <SectionCard
        title={title}
        subtitle={subtitle}
        actions={
          newEntityRoute ? (
            <Button asChild size="sm">
              <Link href={newEntityRoute}>{newEntityLabel}</Link>
            </Button>
          ) : undefined
        }
      >
        {content}
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
        {content}
      </SectionCard>
    );
  }

  return null;
}
