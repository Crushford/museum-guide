import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../../../lib/api';
import { AdminPageLayout } from '../../../../components/shared';
import { EditPageClient } from '../../shared/EditPageClient';
import { updateArtifact } from '../../shared/actions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type Artifact = {
  id: number;
  name: string;
  roomId: number;
  knowledgeText: string | null;
  furtherReading: string[];
};

type Room = {
  id: number;
  name: string;
  museumId: number | null;
};

type Museum = {
  id: number;
  name: string;
};

async function getArtifactHierarchy(artifactId: number): Promise<string[]> {
  const artifact = await api<Artifact>(`/artifacts/${artifactId}`).catch(
    () => null
  );
  if (!artifact) return [];
  return [artifact.name];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const nodeId = Number(id);

  try {
    const hierarchy = await getArtifactHierarchy(nodeId);
    if (hierarchy.length > 0) {
      return {
        title: `Museum Guide - Artifact: ${hierarchy[0]}`,
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    title: 'Museum Guide - Artifact',
  };
}

export default async function ArtifactEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Redirect "new" to admin (artifacts require a museumId)
  if (id === 'new') {
    redirect('/admin');
  }

  const nodeId = Number(id);

  // Check if nodeId is valid
  if (Number.isNaN(nodeId)) {
    redirect('/admin');
  }

  const [artifact, museums, allRooms] = await Promise.all([
    api<Artifact>(`/artifacts/${nodeId}`),
    api<Museum[]>(`/museums`).catch(() => []),
    api<Room[]>(`/admin/rooms`).catch(() => []),
  ]);

  // Get parent room
  type RoomResponse = {
    id: number;
    name: string;
    museumId?: number | null;
    parentId?: number | null;
  };
  const parentRoom: Room | null = artifact.roomId
    ? await api<RoomResponse>(`/rooms/${artifact.roomId}`)
        .then((r) => ({
          id: r.id,
          name: r.name,
          museumId: r.museumId ?? null,
        }))
        .catch(() => null)
    : null;

  // Get parent's parent (museum)
  const parentMuseum: Museum | null = parentRoom?.museumId
    ? await api<Museum>(`/museums/${parentRoom.museumId}`).catch(() => null)
    : null;

  const handleSave = async (data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }) => {
    'use server';
    await updateArtifact(nodeId, data);
  };

  return (
    <AdminPageLayout
      title={`Artifact: ${artifact.name}`}
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Artifacts', href: '/admin?tab=artifacts' },
        { label: artifact.name },
      ]}
      actions={
        <Button asChild size="sm">
          <Link href="/admin">Back to Admin</Link>
        </Button>
      }
    >
      <EditPageClient
        entity={{
          id: artifact.id,
          name: artifact.name,
          knowledgeText: artifact.knowledgeText,
          furtherReading: artifact.furtherReading,
          type: 'artifact',
          parentId: artifact.roomId,
        }}
        parentRoom={
          parentRoom
            ? {
                id: parentRoom.id,
                name: parentRoom.name,
                parentId: parentRoom.museumId,
              }
            : null
        }
        parentMuseum={parentMuseum}
        museums={museums}
        rooms={allRooms.map((r) => ({
          id: r.id,
          name: r.name,
          parentId: (r as { museumId?: number | null }).museumId ?? null,
        }))}
        onSave={handleSave}
      />
    </AdminPageLayout>
  );
}
