'use client';

import Link from 'next/link';

type EmptyStateProps = {
  title: string;
  message?: string;
  action?: {
    label: string;
    href: string;
  };
};

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <h3 className="text-lg font-semibold text-fg mb-2">{title}</h3>
      {message && <p className="text-muted mb-6 max-w-md">{message}</p>}
      {action && (
        <Link
          href={action.href}
          className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-2 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
