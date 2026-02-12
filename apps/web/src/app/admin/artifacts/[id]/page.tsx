import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../../../lib/api';
import { PageLayout } from '../../../../components/shared';
import { EditPageClient } from '../../shared/EditPageClient';
import { updateArtifact } from '../../shared/actions';
import { DeleteEntityButton } from '../../shared/DeleteEntityButton';
import { deleteArtifact } from './actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { ArtifactContentInspector } from './ArtifactContentInspector';
import { Museum, Room, Artifact, ContentItem } from '@/lib/types';

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
  const parentRoom: Room | null = artifact.roomId
    ? await api<Room>(`/rooms/${artifact.roomId}`).catch(() => null)
    : null;

  // Get parent room's parent room (if it exists)
  let parentParentRoom: Room | null = null;
  if (parentRoom?.parentRoomId) {
    parentParentRoom = await api<Room>(
      `/rooms/${parentRoom.parentRoomId}`
    ).catch(() => null);
  }

  // Get museum directly from the artifact's museumId
  const parentMuseum: Museum | null = await api<Museum>(
    `/museums/${artifact.museumId}`
  ).catch(() => null);

  const handleSave = async (data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }) => {
    'use server';
    await updateArtifact(nodeId, {
      ...data,
      knowledgeText: data.knowledgeText,
    });
  };

  // Find the museum for this artifact to build the public page link
  const artifactMuseum = museums.find((m) => m.id === artifact.museumId);

  // Aggregate tags across all content items
  const hasAdultContent = artifactContent.some((c) => c.isAdultContent);
  const allSensitiveTopics = [
    ...new Set(artifactContent.flatMap((c) => c.sensitiveTopics ?? [])),
  ];
  const allSubjectTags = [
    ...new Set(artifactContent.flatMap((c) => c.subjectTags ?? [])),
  ];

  return (
    <PageLayout
      title={`Artifact: ${artifact.name}`}
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Artifacts', href: '/admin?tab=artifacts' },
        { label: artifact.name },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {artifactMuseum && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/${artifactMuseum.slug}/artifacts/${artifact.slug}`}>
                View Public Page
                <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
          <Button asChild size="sm">
            <Link href="/admin">Back to Admin</Link>
          </Button>
        </div>
      }
    >
      <EditPageClient
        entity={{
          id: artifact.id,
          name: artifact.name,
          knowledgeText: artifact.rawPlaqueText ?? null,
          furtherReading: artifact.furtherReading ?? [],
          type: 'artifact',
          parentId: artifact.roomId ?? null,
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
      {/* Content Tags */}
      {(hasAdultContent ||
        allSensitiveTopics.length > 0 ||
        allSubjectTags.length > 0) && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">Content Tags</h3>
          <div className="flex flex-wrap gap-2">
            {hasAdultContent && (
              <Badge variant="destructive">Adult Content</Badge>
            )}
            {allSensitiveTopics.map((topic) => (
              <Badge key={topic} variant="warning">
                {topic}
              </Badge>
            ))}
            {allSubjectTags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
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
    </PageLayout>
  );
}
