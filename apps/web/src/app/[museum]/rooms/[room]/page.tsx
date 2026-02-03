import Link from 'next/link';
import type { Metadata } from 'next';
import { api } from '../../../../lib/api';
import { notFound } from 'next/navigation';
import type { MuseumResponse } from '@repo/types';
import { AdminPageLayout } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';
import { EntityDetailsForm } from '../../../../app/admin/shared/EntityDetailsForm';
import { ChildEntityList } from '../../../../app/admin/shared/ChildEntityList';
import { Button } from '@/components/ui/button';

type Room = {
  id: number;
  name: string;
  slug: string;
  museumId: number;
  parentRoomId: number | null;
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
  params: Promise<{ museum: string; room: string }>;
}): Promise<Metadata> {
  const { museum: museumSlug, room: roomSlug } = await params;

  try {
    const room = await api<Room>(
      `/rooms/by-slug/${roomSlug}?museumSlug=${museumSlug}`
    ).catch(() => null);
    if (room) {
      return {
        title: room.name,
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    title: 'Room',
  };
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ museum: string; room: string }>;
}) {
  const { museum: museumSlug, room: roomSlug } = await params;

  // Fetch museum by slug
  const museum = await api<MuseumResponse>(
    `/museums/by-slug/${museumSlug}`
  ).catch(() => null);

  if (!museum) {
    notFound();
  }

  // Fetch room by slug
  const room = await api<Room>(
    `/rooms/by-slug/${roomSlug}?museumSlug=${museumSlug}`
  ).catch(() => null);

  if (!room) {
    notFound();
  }

  // Validate room belongs to museum
  if (room.museumId !== museum.id) {
    notFound();
  }

  const [artifacts, childRooms, content] = await Promise.all([
    api<Array<{ id: number; name: string; slug: string }>>(
      `/rooms/${room.id}/artifacts`
    ).catch(() => []),
    api<Array<{ id: number; name: string; slug: string }>>(
      `/rooms/${room.id}/children`
    ).catch(() => []),
    api<Content[]>(`/rooms/${room.id}/content`).catch(() => []),
  ]);

  const roomBrief = content.find((c) => c.type === 'roomBrief') || content[0];
  const followups = content.filter((c) => c.type === 'followup').slice(0, 3);

  const roomWithKnowledgeText = room as Room & {
    knowledgeText: string | null;
    furtherReading: string[];
  };

  return (
    <AdminPageLayout
      title={room.name}
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link href={`/${museumSlug}`}>Back to Museum</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Room Details */}
        <SectionCard title="About">
          <EntityDetailsForm
            id={room.id}
            name={room.name}
            knowledgeText={roomWithKnowledgeText.knowledgeText}
            furtherReading={roomWithKnowledgeText.furtherReading || []}
            allowEdit={false}
          />
        </SectionCard>

        {/* Room Brief Content */}
        {roomBrief && roomBrief.text.trim() && (
          <SectionCard title="Room in Brief">
            <p className="text-primary leading-relaxed">{roomBrief.text}</p>
          </SectionCard>
        )}

        {/* Child Rooms */}
        {childRooms.length > 0 && (
          <ChildEntityList
            title="Child Rooms"
            entities={childRooms.map((r) => ({
              id: r.id,
              name: r.name,
              type: 'room' as const,
              href: `/${museumSlug}/rooms/${r.slug}`,
            }))}
            newEntityRoute={null}
            newEntityLabel="Add Room"
            emptyMessage="No child rooms yet."
            allowEdit={false}
          />
        )}

        {/* Artifacts */}
        {artifacts.length > 0 && (
          <ChildEntityList
            title="Artifacts"
            entities={artifacts.map((a) => ({
              id: a.id,
              name: a.name,
              type: 'artifact' as const,
              href: `/${museumSlug}/artifacts/${a.slug}`,
            }))}
            newEntityRoute={null}
            newEntityLabel="Add Artifact"
            emptyMessage="No artifacts yet."
            allowEdit={false}
          />
        )}

        {/* Follow-up Content */}
        {followups.length > 0 && (
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
