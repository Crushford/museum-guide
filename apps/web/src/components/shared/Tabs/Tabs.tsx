'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import {
  Tabs as TabsPrimitive,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';

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
  const pathname = usePathname();
  const currentTab = searchParams.get('tab') || defaultTab || tabs[0]?.id;

  const handleValueChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <TabsPrimitive
      value={currentTab}
      onValueChange={handleValueChange}
      className="space-y-4"
    >
      <TabsList className="border-b border-line bg-transparent p-0 h-auto rounded-none">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent rounded-none border-b-2 border-transparent"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={currentTab} className="mt-0">
        {children}
      </TabsContent>
    </TabsPrimitive>
  );
}
