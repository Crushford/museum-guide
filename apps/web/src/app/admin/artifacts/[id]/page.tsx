import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../../../lib/api';
import { AdminPageLayout } from '../../../../components/shared';
import { EditPageClient } from '../../shared/EditPageClient';
import { updateArtifact } from '../../shared/actions';
import { DeleteEntityButton } from '../../shared/DeleteEntityButton';
import { deleteArtifact } from './actions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArtifactContentInspector } from './ArtifactContentInspector';

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
  parentRoomId: number | null;
};

type Museum = {
  id: number;
  name: string;
};

type ContentItem = {
  id: number;
  text: string;
  type: string | null;
  llmProvider: string;
  model: string;
  promptVersion?: string;
  audioUrl: string | null;
  createdAt: string;
  updatedAt?: string;
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

  const [artifact, museums, allRooms, artifactContent] = await Promise.all([
    api<Artifact>(`/artifacts/${nodeId}`),
    api<Museum[]>(`/museums`).catch(() => []),
    api<Room[]>(`/admin/rooms`).catch(() => []),
    api<ContentItem[]>(`/artifacts/${nodeId}/content`).catch(() => []),
  ]);

  // Get parent room
  type RoomResponse = {
    id: number;
    name: string;
    museumId?: number | null;
    parentRoomId?: number | null;
  };
  const parentRoom: Room | null = artifact.roomId
    ? await api<RoomResponse>(`/rooms/${artifact.roomId}`)
        .then((r) => ({
          id: r.id,
          name: r.name,
          museumId: r.museumId ?? null,
          parentRoomId: r.parentRoomId ?? null,
        }))
        .catch(() => null)
    : null;

  // Get parent room's parent room (if it exists)
  let parentParentRoom: Room | null = null;
  if (parentRoom?.parentRoomId) {
    parentParentRoom = await api<RoomResponse>(
      `/rooms/${parentRoom.parentRoomId}`
    )
      .then((r) => ({
        id: r.id,
        name: r.name,
        museumId: r.museumId ?? null,
        parentRoomId: r.parentRoomId ?? null,
      }))
      .catch(() => null);
  }

  // Get museum - either directly from room or from parent room
  let parentMuseum: Museum | null = null;
  if (parentRoom?.museumId) {
    // Room is directly attached to a museum
    parentMuseum = await api<Museum>(`/museums/${parentRoom.museumId}`).catch(
      () => null
    );
  } else if (parentRoom?.parentRoomId && parentParentRoom?.museumId) {
    // Room is a child room - get parent room's museum
    parentMuseum = await api<Museum>(
      `/museums/${parentParentRoom.museumId}`
    ).catch(() => null);
  }

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
        parentParentRoom={
          parentParentRoom
            ? {
                id: parentParentRoom.id,
                name: parentParentRoom.name,
                parentId: parentParentRoom.museumId,
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
      <ArtifactContentInspector
        artifactId={artifact.id}
        initialContent={artifactContent}
      />
      <div className="flex justify-end pt-4">
        <DeleteEntityButton
          entityType="artifact"
          entityId={artifact.id}
          entityName={artifact.name}
          onDelete={deleteArtifact}
        />
      </div>
    </AdminPageLayout>
  );
}
