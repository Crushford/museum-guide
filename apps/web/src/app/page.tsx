import type { Metadata } from 'next';
import { api } from '../lib/api';
import { PageLayout } from '../components/shared';
import { SectionCard } from '../components/shared';
import { EntityList } from '../components/shared';
import { EmptyState } from '../components/shared';
import type { MuseumResponse } from '@repo/types';

export const metadata: Metadata = {
  title: 'Museums',
};

export default async function Home() {
  const museums = await api<MuseumResponse[]>('/museums');

  return (
    <PageLayout title="Museum Guide">
      <SectionCard
        title="Select a Museum"
        subtitle="Choose the museum you want to start exploring"
      >
        <EntityList
          title=""
          items={museums.map((museum) => {
            const museumWithSlug = museum as MuseumResponse & { slug: string };
            return {
              id: museum.id,
              name: museum.name,
              href: `/${museumWithSlug.slug || museum.id}`,
              typePill: 'MUSEUM' as const,
            };
          })}
          emptyState={
            <EmptyState
              title="No museums available"
              message="There are no museums to display at this time."
            />
          }
        />
      </SectionCard>
    </PageLayout>
  );
}
