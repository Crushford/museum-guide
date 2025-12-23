'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { HasUnsavedChanges } from '../HasUnsavedChanges';
import { TypePill } from '../TypePill';

type ChildWithChanges = {
  id: number;
  name: string;
  href: string;
};

type EntityItem = {
  id: string | number;
  name: string;
  subtitle?: string;
  href?: string;
  hasUnsavedChanges?: boolean;
  childrenWithChanges?: ChildWithChanges[];
  typePill?: string;
};

type EntityListProps = {
  title: string;
  items: EntityItem[];
  primaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  emptyState?: ReactNode;
};

export function EntityList({
  title,
  items,
  primaryAction,
  emptyState,
}: EntityListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {primaryAction && (
          <>
            {primaryAction.href ? (
              <Button asChild size="sm">
                <Link href={primaryAction.href}>{primaryAction.label}</Link>
              </Button>
            ) : (
              <Button onClick={primaryAction.onClick} size="sm">
                {primaryAction.label}
              </Button>
            )}
          </>
        )}
      </div>
      {items.length === 0 && emptyState ? (
        emptyState
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No items found.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const content = (
              <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-md hover:bg-secondary transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-foreground font-medium">
                      {item.name}
                    </span>
                    {item.hasUnsavedChanges && (
                      <HasUnsavedChanges
                        childrenWithChanges={item.childrenWithChanges}
                      />
                    )}
                    {item.typePill && <TypePill type={item.typePill} />}
                  </div>
                  {item.subtitle && (
                    <p className="text-sm text-muted-foreground">
                      {item.subtitle}
                    </p>
                  )}
                </div>
              </div>
            );

            return item.href ? (
              <Link key={item.id} href={item.href} className="block">
                {content}
              </Link>
            ) : (
              <div key={item.id}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
