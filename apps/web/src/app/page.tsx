import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { api } from '../lib/api';
import { AdminPageLayout } from '../components/shared';
import { SectionCard } from '../components/shared';
import { EntityList } from '../components/shared';
import { EmptyState } from '../components/shared';

export const metadata: Metadata = {
  title: 'Museums',
};

type Museum = {
  id: number;
  name: string;
  slug: string;
};

export default async function Home() {
  const museums = await api<Museum[]>('/museums');

  return (
    <AdminPageLayout
      title="Museum Guide"
      actions={
        <Button asChild variant="outline">
          <Link href="/admin">Admin</Link>
        </Button>
      }
    >
      <SectionCard
        title="Select a Museum"
        subtitle="Choose the museum you want to start exploring"
      >
        <EntityList
          title=""
          items={museums.map((museum) => ({
            id: museum.id,
            name: museum.name,
            href: `/${museum.slug}`,
            typePill: 'MUSEUM',
          }))}
          emptyState={
            <EmptyState
              title="No museums available"
              message="There are no museums to display at this time."
            />
          }
        />
      </SectionCard>
    </AdminPageLayout>
  );
}
