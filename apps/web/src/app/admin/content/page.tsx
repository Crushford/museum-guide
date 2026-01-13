import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { AdminPageLayout } from '@/components/shared';
import { SectionCard } from '@/components/shared';
import { ContentTabsClient } from './ContentTabsClient';

export const metadata: Metadata = {
  title: 'Content Management',
};

export default async function AdminContentPage() {
  // Fetch all three datasets server-side using existing public endpoints
  const [museums, rooms, artifacts] = await Promise.all([
    api<unknown[]>('/museums'),
    api<unknown[]>('/admin/rooms'),
    api<unknown[]>('/admin/artifacts'),
  ]);

  return (
    <AdminPageLayout title="Content Management">
      <SectionCard title="">
        <div className="mb-4 p-4 bg-muted/50 rounded-md border border-border">
          <p className="text-sm text-muted-foreground">
            View-only table. Editing happens on entity pages.
          </p>
        </div>
        <ContentTabsClient
          museums={museums}
          rooms={rooms}
          artifacts={artifacts}
        />
      </SectionCard>
    </AdminPageLayout>
  );
}
