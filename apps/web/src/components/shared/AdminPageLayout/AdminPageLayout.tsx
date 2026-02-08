'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Breadcrumbs } from '../Breadcrumbs';
import { LayoutDashboard, Globe, FileText } from 'lucide-react';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type AdminPageLayoutProps = {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
};

const adminNavItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/cities', label: 'Cities', icon: Globe },
  { href: '/admin/content', label: 'Content', icon: FileText },
];

export function AdminPageLayout({
  title,
  breadcrumbs,
  actions,
  children,
}: AdminPageLayoutProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Navigation Header */}
      <nav className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-1 h-14">
            <span className="font-semibold text-primary mr-4">Admin</span>
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
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
