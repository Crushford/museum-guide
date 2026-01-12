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
  href?: string; // Optional href for the entity link
};

type ChildEntityListProps = {
  title: string;
  subtitle?: string;
  entities: ChildEntity[];
  newEntityRoute: string | null;
  newEntityLabel: string;
  emptyMessage: string;
  inline?: boolean; // If true, render without SectionCard wrapper
  allowEdit?: boolean; // If false, hide Add buttons (read-only mode)
};

export function ChildEntityList({
  title,
  subtitle,
  entities,
  newEntityRoute,
  newEntityLabel,
  emptyMessage,
  inline = false,
  allowEdit = true,
}: ChildEntityListProps) {
  const getEntityHref = (entity: ChildEntity): string | undefined => {
    // Use provided href if available
    if (entity.href) {
      return entity.href;
    }
    // Default admin routes
    return entity.type === 'room'
      ? `/admin/rooms/${entity.id}`
      : `/admin/artifacts/${entity.id}`;
  };

  const content = (
    <>
      {entities.length > 0 ? (
        <EntityList
          title=""
          items={entities.map((entity) => ({
            id: entity.id,
            name: entity.name,
            subtitle: entity.museum ? `Museum: ${entity.museum}` : undefined,
            href: getEntityHref(entity),
            typePill: entity.type.toUpperCase(),
          }))}
          emptyState={null}
        />
      ) : newEntityRoute && allowEdit ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : !allowEdit && entities.length === 0 ? (
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
          {newEntityRoute && allowEdit && (
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
          newEntityRoute && allowEdit ? (
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

  if (newEntityRoute && allowEdit) {
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

  if (!allowEdit && entities.length === 0) {
    return (
      <SectionCard title={title} subtitle={subtitle}>
        {content}
      </SectionCard>
    );
  }

  return null;
}
