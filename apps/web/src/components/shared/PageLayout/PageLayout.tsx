import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumbs } from '../Breadcrumbs';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PageLayoutProps = {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
  narrow?: boolean;
};

export function PageLayout({
  title,
  breadcrumbs,
  actions,
  children,
  narrow,
}: PageLayoutProps) {
  return (
    <div className="bg-canvas">
      <div
        className={cn('mx-auto px-6 py-8', narrow ? 'max-w-2xl' : 'max-w-6xl')}
      >
        <header className="mb-8">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="mb-4">
              <Breadcrumbs items={breadcrumbs} />
            </div>
          )}
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-primary">{title}</h1>
            {actions && (
              <div className="flex items-center gap-2">{actions}</div>
            )}
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
