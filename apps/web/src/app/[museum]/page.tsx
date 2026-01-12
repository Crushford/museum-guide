import type { Metadata } from 'next';
import { api } from '../../lib/api';
import { notFound } from 'next/navigation';
import type { MuseumResponse } from '@repo/types';
import { AdminPageLayout } from '../../components/shared';
import { SectionCard } from '../../components/shared';
import { EntityDetailsForm } from '../../app/admin/shared/EntityDetailsForm';
import { ChildEntityList } from '../../app/admin/shared/ChildEntityList';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type Room = {
  id: number;
  name: string;
  slug: string;
  museumId: number | null;
};

type Content = {
  id: number;
  text: string;
  type: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ museum: string }>;
}): Promise<Metadata> {
  const { museum: museumSlug } = await params;

  try {
    const museum = await api<MuseumResponse>(`/museums/by-slug/${museumSlug}`);
    return {
      title: museum.name,
    };
  } catch {
    // Fall through to default
  }

  return {
    title: 'Museum',
  };
}

export default async function MuseumPage({
  params,
}: {
  params: Promise<{ museum: string }>;
}) {
  const { museum: museumSlug } = await params;

  // Fetch museum by slug to get the ID
  const museum = await api<MuseumResponse>(
    `/museums/by-slug/${museumSlug}`
  ).catch(() => null);

  if (!museum) {
    notFound();
  }

  const [rooms, content] = await Promise.all([
    api<Room[]>(`/museums/${museum.id}/rooms`).catch(() => []),
    api<Content[]>(`/museums/${museum.id}/content`).catch(() => []),
  ]);

  // Find intro content (type 'intro' or first content item)
  const intro = content.find((c) => c.type === 'intro') || content[0];
  const followups = content.filter((c) => c.type === 'followup').slice(0, 3);

  const museumWithKnowledgeText = museum as MuseumResponse & {
    knowledgeText: string | null;
    furtherReading: string[];
  };

  return (
    <AdminPageLayout
      title={museum.name}
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin">Admin</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Museum Details */}
        <SectionCard title="About">
          <EntityDetailsForm
            id={museum.id}
            name={museum.name}
            knowledgeText={museumWithKnowledgeText.knowledgeText}
            furtherReading={museumWithKnowledgeText.furtherReading || []}
            allowEdit={false}
          />
        </SectionCard>

        {/* Intro Content */}
        {intro && intro.text.trim() && (
          <SectionCard title="Introduction">
            <p className="text-primary leading-relaxed">{intro.text}</p>
          </SectionCard>
        )}

        {/* Rooms */}
        {rooms.length > 0 && (
          <ChildEntityList
            title="Rooms"
            entities={rooms.map((r) => ({
              id: r.id,
              name: r.name,
              type: 'room' as const,
              href: `/${museumSlug}/${r.slug || r.id}`,
            }))}
            newEntityRoute={null}
            newEntityLabel="Add Room"
            emptyMessage="No rooms yet."
            allowEdit={false}
          />
        )}

        {/* Follow-up Content */}
        {followups.length > 0 && (
          <SectionCard title="Explore Next">
            <div className="space-y-4">
              {followups.map((followup) => {
                if (!followup.text.trim()) return null;
                return (
                  <div key={followup.id}>
                    <p className="text-primary leading-relaxed">
                      {followup.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}
      </div>
    </AdminPageLayout>
  );
}
