import Link from 'next/link';
import type { Metadata } from 'next';
import { api } from '../../../../lib/api';
import { notFound } from 'next/navigation';
import type { MuseumResponse } from '@repo/types';
import { AdminPageLayout } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';
import { EntityDetailsForm } from '../../../../app/admin/shared/EntityDetailsForm';
import { Button } from '@/components/ui/button';

type Room = {
  id: number;
  name: string;
  slug: string;
  museumId: number | null;
  parentRoomId: number | null;
};

type Artifact = {
  id: number;
  name: string;
  slug: string;
  roomId: number;
  knowledgeText: string | null;
  furtherReading: string[];
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
      `/artifacts/by-slug/${artifactSlug}`
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
    `/artifacts/by-slug/${artifactSlug}`
  ).catch(() => null);

  if (!artifact) {
    notFound();
  }

  // Fetch room to validate artifact belongs to museum
  const artifactRoom = await api<Room>(`/rooms/${artifact.roomId}`).catch(
    () => null
  );

  if (!artifactRoom) {
    notFound();
  }

  // Check if room belongs to museum (directly or through parent)
  if (artifactRoom.museumId !== museum.id) {
    if (artifactRoom.parentRoomId) {
      const parentRoom = await api<Room>(
        `/rooms/${artifactRoom.parentRoomId}`
      ).catch(() => null);
      if (!parentRoom || parentRoom.museumId !== museum.id) {
        notFound();
      }
    } else {
      notFound();
    }
  }

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
          <Link href={`/${museumSlug}/rooms/${artifactRoom.slug}`}>
            Back to Room
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Artifact Details */}
        <SectionCard title="About">
          <EntityDetailsForm
            id={artifact.id}
            name={artifact.name}
            knowledgeText={artifactWithKnowledgeText.knowledgeText}
            furtherReading={artifactWithKnowledgeText.furtherReading || []}
            allowEdit={false}
          />
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
