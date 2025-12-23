import Link from 'next/link';
import { ReactNode } from 'react';
import { DraftStatusBadge } from '../DraftStatusBadge';
import { TypePill } from '../TypePill';

type EntityItem = {
  id: string | number;
  name: string;
  subtitle?: string;
  href?: string;
  status?: 'draft' | 'dirty' | 'none';
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
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {primaryAction && (
          <>
            {primaryAction.href ? (
              <Link
                href={primaryAction.href}
                className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-2 transition-colors text-sm"
              >
                {primaryAction.label}
              </Link>
            ) : (
              <button
                onClick={primaryAction.onClick}
                className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-2 transition-colors text-sm"
              >
                {primaryAction.label}
              </button>
            )}
          </>
        )}
      </div>
      {items.length === 0 && emptyState ? (
        emptyState
      ) : items.length === 0 ? (
        <p className="text-muted text-sm">No items found.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const content = (
              <div className="flex items-center gap-3 p-3 bg-panel border border-border rounded-md hover:bg-bg-2 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-fg font-medium">{item.name}</span>
                    {item.status && item.status !== 'none' && (
                      <DraftStatusBadge
                        status={item.status}
                        tooltip={
                          item.status === 'draft'
                            ? 'Draft'
                            : 'Has unsaved changes'
                        }
                      />
                    )}
                    {item.typePill && <TypePill type={item.typePill} />}
                  </div>
                  {item.subtitle && (
                    <p className="text-sm text-muted">{item.subtitle}</p>
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
