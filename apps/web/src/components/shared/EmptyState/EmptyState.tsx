'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

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
      <h3 className="text-lg font-semibold text-primary mb-2">{title}</h3>
      {message && (
        <p className="text-muted-foreground mb-6 max-w-md">{message}</p>
      )}
      {action && (
        <Button asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
