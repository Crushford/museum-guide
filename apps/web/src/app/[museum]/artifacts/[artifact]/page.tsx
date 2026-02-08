import Link from 'next/link';
import type { Metadata } from 'next';
import { api } from '../../../../lib/api';
import { notFound } from 'next/navigation';
import type { MuseumResponse } from '@repo/types';
import { AdminPageLayout } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';
import { EntityDetailsForm } from '../../../../app/admin/shared/EntityDetailsForm';
import { Button } from '@/components/ui/button';
import { Globe, ExternalLink } from 'lucide-react';

type Room = {
  id: number;
  name: string;
  slug: string;
  museumId: number;
  parentRoomId: number | null;
};

type Artifact = {
  id: number;
  name: string;
  slug: string;
  roomId: number;
  museumId: number;
  knowledgeText: string | null;
  furtherReading: string[];
  wikimediaImageUrl: string | null;
  wikipediaUrl: string | null;
};

type Content = {
  id: number;
  text: string;
  type: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ museum: string; artifact: string }>;
}): Promise<Metadata> {
  const { museum: museumSlug, artifact: artifactSlug } = await params;

  try {
    const artifact = await api<Artifact>(
      `/artifacts/by-slug/${artifactSlug}?museumSlug=${museumSlug}`
    ).catch(() => null);
    if (artifact) {
      return {
        title: artifact.name,
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    title: 'Artifact',
  };
}

export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ museum: string; artifact: string }>;
}) {
  const { museum: museumSlug, artifact: artifactSlug } = await params;

  // Fetch museum by slug
  const museum = await api<MuseumResponse>(
    `/museums/by-slug/${museumSlug}`
  ).catch(() => null);

  if (!museum) {
    notFound();
  }

  // Fetch artifact by slug
  const artifact = await api<Artifact>(
    `/artifacts/by-slug/${artifactSlug}?museumSlug=${museumSlug}`
  ).catch(() => null);

  if (!artifact) {
    notFound();
  }

  // Validate artifact belongs to museum
  if (artifact.museumId !== museum.id) {
    notFound();
  }

  // Fetch room for back navigation
  const artifactRoom = await api<Room>(`/rooms/${artifact.roomId}`).catch(
    () => null
  );

  const [content] = await Promise.all([
    api<Content[]>(`/artifacts/${artifact.id}/content`).catch(() => []),
  ]);

  const artifactMain =
    content.find((c) => c.type === 'artifactMain') || content[0];
  const qaItems = content.filter((c) => c.type === 'qa').slice(0, 3);
  const followups = content.filter((c) => c.type === 'followup').slice(0, 3);

  const artifactWithKnowledgeText = artifact as Artifact & {
    knowledgeText: string | null;
    furtherReading: string[];
  };

  return (
    <AdminPageLayout
      title={artifact.name}
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link href={artifactRoom ? `/${museumSlug}/rooms/${artifactRoom.slug}` : `/${museumSlug}`}>
            {artifactRoom ? 'Back to Room' : 'Back to Museum'}
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Artifact Details */}
        <SectionCard title="About">
          <div className="space-y-4">
            {/* Image */}
            {artifact.wikimediaImageUrl && (
              <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-lg bg-muted">
                <img
                  src={artifact.wikimediaImageUrl}
                  alt={artifact.name}
                  className="object-cover w-full h-full"
                />
              </div>
            )}

            <EntityDetailsForm
              id={artifact.id}
              name={artifact.name}
              knowledgeText={artifactWithKnowledgeText.knowledgeText}
              furtherReading={artifactWithKnowledgeText.furtherReading || []}
              allowEdit={false}
            />

            {/* Wikipedia Link */}
            {artifact.wikipediaUrl && (
              <div className="pt-2">
                <a
                  href={artifact.wikipediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Globe className="h-4 w-4" />
                  View on Wikipedia
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Artifact Main Content */}
        {artifactMain && artifactMain.text.trim() && (
          <SectionCard>
            <p className="text-primary leading-relaxed">{artifactMain.text}</p>
          </SectionCard>
        )}

        {/* Q&A Items */}
        {qaItems.length > 0 && (
          <SectionCard title="Common Questions">
            <div className="space-y-4">
              {qaItems.map((qa) => {
                if (!qa.text.trim()) return null;
                return (
                  <div key={qa.id}>
                    <p className="text-primary leading-relaxed">{qa.text}</p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* Follow-up Content */}
        {followups.length > 0 && qaItems.length === 0 && (
          <SectionCard title="Learn More">
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
