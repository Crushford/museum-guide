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
        className={cn(
          'mx-auto px-4 py-6 sm:px-6 sm:py-8',
          narrow ? 'max-w-2xl' : 'max-w-6xl'
        )}
      >
        <header className="mb-6 sm:mb-8">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="mb-4">
              <Breadcrumbs items={breadcrumbs} />
            </div>
          )}
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold text-primary break-words sm:text-3xl">
              {title}
            </h1>
            {actions && (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                {actions}
              </div>
            )}
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
