'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ReactNode } from 'react';

type Tab = {
  id: string;
  label: string;
};

type TabsProps = {
  tabs: Tab[];
  defaultTab?: string;
  children: ReactNode;
};

export function Tabs({ tabs, defaultTab, children }: TabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || defaultTab || tabs[0]?.id;

  const handleTabClick = (tabId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tabId);
    router.push(`/admin?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-divider">
        <nav className="flex gap-4" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-fg hover:border-border'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
