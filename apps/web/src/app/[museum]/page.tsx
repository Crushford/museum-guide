import type { Metadata } from 'next';
import { api } from '../../lib/api';
import { notFound } from 'next/navigation';
import type { MuseumResponse } from '@repo/types';
import { PageLayout } from '../../components/shared';
import { SectionCard } from '../../components/shared';
import { ChildEntityList } from '../../app/admin/shared/ChildEntityList';
import { BodyText } from '@/components/ui/body-text';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { MuseumDetailsHydration, ArtifactsHydration } from './MuseumHydration';
import { PlaqueScanner } from './PlaqueScanner';
import { Room, Artifact, ContentItem } from '@/lib/types';

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

  // Cast to include optional fields
  const museumData = museum as MuseumResponse & {
    image?: string;
    wikipediaUrl?: string;
  };

  const [rooms, artifacts, content] = await Promise.all([
    api<Room[]>(`/museums/${museum.id}/rooms`).catch(() => []),
    api<Artifact[]>(`/museums/${museum.id}/artifacts-recursive`).catch(
      () => []
    ),
    api<ContentItem[]>(`/museums/${museum.id}/content`).catch(() => []),
  ]);

  // Find intro content (type 'intro' or first content item)
  const intro = content.find((c) => c.type === 'intro') || content[0];
  const followups = content.filter((c) => c.type === 'followup').slice(0, 3);

  return (
    <PageLayout
      title={museum.name}
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin">Admin</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Museum Details - Hydrated from Wikipedia */}
        <MuseumDetailsHydration
          museumSlug={museumSlug}
          initialName={museum.name}
          initialDescription={museumData.description ?? undefined}
          initialWikipediaSummary={museumData.wikipediaSummary ?? undefined}
          initialOfficialWebsite={museumData.officialWebsite ?? undefined}
          initialCoordinates={
            museumData.coordinates as { lat: number; lng: number } | undefined
          }
          initialImage={museumData.image}
          initialWikipediaUrl={museumData.wikipediaUrl}
        />

        <PlaqueScanner museumId={museum.id} museumSlug={museumSlug} />

        {/* Intro Content (if exists from LLM generation) */}
        {intro && intro.text.trim() && (
          <SectionCard title="Introduction">
            <BodyText>{intro.text}</BodyText>
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
              href: `/${museumSlug}/rooms/${r.slug || r.id}`,
            }))}
            newEntityRoute={null}
            newEntityLabel="Add Room"
            emptyMessage="No rooms yet."
            allowEdit={false}
          />
        )}

        {/* Artifacts - Hydrated from Wikipedia */}
        <ArtifactsHydration
          museumSlug={museumSlug}
          existingArtifacts={artifacts.map((a) => ({
            id: a.id,
            name: a.name,
            slug: a.slug || '',
            wikipediaUrl: a.wikipediaUrl || undefined,
            wikimediaImageUrl: a.wikimediaImageUrl || undefined,
          }))}
        />

        {/* Follow-up Content */}
        {followups.length > 0 && (
          <SectionCard title="Explore Next">
            <div className="space-y-4">
              {followups.map((followup) => {
                if (!followup.text.trim()) return null;
                return (
                  <div key={followup.id}>
                    <BodyText>{followup.text}</BodyText>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}
      </div>
    </PageLayout>
  );
}
