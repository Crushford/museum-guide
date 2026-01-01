'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SectionCard } from '@/components/shared/SectionCard';
import { InlineEditableField } from '@/components/shared/InlineEditableField';
import { InlineEditableUrlList } from '@/components/shared/InlineEditableUrlList';
import { InlineEditableMuseumRoom } from '@/components/shared/InlineEditableMuseumRoom';
import { EntityList } from '@/components/shared/EntityList';
import { nodeEditHref } from './nodeRoutes';
import { updateNodeField } from './actions';
import Link from 'next/link';

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  parentId: number | null;
  knowledgeText: string | null;
  furtherReading: string[];
};

type Parent = {
  id: number;
  name: string;
  type: 'MUSEUM' | 'ROOM';
  parentId?: number | null;
};

type Child = {
  id: number;
  name: string;
  type: 'ROOM' | 'ARTIFACT';
};

type EditPageClientProps = {
  node: Node;
  parent?: Parent;
  parentParent?: Parent; // For artifacts: room's parent (museum)
  childNodes: Child[];
  museums: Parent[]; // For parent selection
  rooms: Parent[]; // For artifact parent selection (with parentId)
  artifacts?: Child[]; // For museums: all artifacts in the museum
  onSave: (data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }) => Promise<void>;
};

export function EditPageClient({
  node: initialNode,
  parent: initialParent,
  parentParent: initialParentParent,
  childNodes,
  museums,
  rooms,
  artifacts: museumArtifacts,
  onSave,
}: EditPageClientProps) {
  const router = useRouter();
  const [node, setNode] = useState<Node>(initialNode);
  const [parent, setParent] = useState<Parent | undefined>(initialParent);
  const [parentParent, setParentParent] = useState<Parent | undefined>(() => {
    // Derive museum from room's parent if not already set
    if (initialParentParent) return initialParentParent;
    if (initialParent?.parentId) {
      return museums.find((m) => m.id === initialParent.parentId);
    }
    return undefined;
  });

  // Update node when initialNode changes (after save)
  useEffect(() => {
    setNode(initialNode);
  }, [initialNode]);

  // Update parentParent when initialParentParent or initialParent changes (derive museum from room)
  useEffect(() => {
    // Prioritize initialParentParent if provided
    if (initialParentParent) {
      setParentParent(initialParentParent);
      return;
    }

    // Otherwise, derive from initialParent's parentId
    if (initialParent?.parentId && museums.length > 0) {
      const roomMuseum = museums.find((m) => m.id === initialParent.parentId);
      if (roomMuseum) {
        setParentParent(roomMuseum);
        return;
      }
    }

    // If no parent, clear museum
    if (!initialParent) {
      setParentParent(undefined);
    }
  }, [initialParentParent, initialParent, museums]);

  // Update parentParent when parent changes (derive museum from room)
  useEffect(() => {
    if (parent?.parentId && museums.length > 0) {
      const roomMuseum = museums.find((m) => m.id === parent.parentId);
      if (roomMuseum) {
        setParentParent(roomMuseum);
      }
    } else if (!parent) {
      setParentParent(undefined);
    }
  }, [parent, museums]);

  // Individual field save handlers
  const handleSaveName = useCallback(
    async (value: string) => {
      await updateNodeField(node.id, 'name', value);
      setNode({ ...node, name: value });
      router.refresh();
    },
    [node, router]
  );

  const handleSaveKnowledgeText = useCallback(
    async (value: string) => {
      await updateNodeField(node.id, 'knowledgeText', value || null);
      setNode({ ...node, knowledgeText: value || null });
      router.refresh();
    },
    [node, router]
  );

  const handleSaveFurtherReading = useCallback(
    async (value: string[]) => {
      await updateNodeField(node.id, 'furtherReading', value);
      setNode({ ...node, furtherReading: value });
      router.refresh();
    },
    [node, router]
  );

  const handleSaveMuseumRoom = useCallback(
    async (museumId: number | null, roomId: number | null) => {
      // Artifacts only have a parentId (room), not a museum ID
      // The museum is derived from the room's parent
      if (!roomId) {
        throw new Error('Room is required');
      }

      const selectedRoom = rooms.find((r) => r.id === roomId);
      if (!selectedRoom) {
        throw new Error('Selected room not found');
      }

      // Verify room belongs to the selected museum (if museum was provided)
      if (museumId && selectedRoom.parentId !== museumId) {
        throw new Error('Selected room does not belong to the selected museum');
      }

      // Update the artifact's parentId (room)
      setNode({ ...node, parentId: roomId });
      setParent(selectedRoom);

      // Derive museum from room's parent
      if (selectedRoom.parentId) {
        const roomMuseum = museums.find((m) => m.id === selectedRoom.parentId);
        if (roomMuseum) {
          setParentParent(roomMuseum);
        }
      }

      // Save the room change (parentId)
      await updateNodeField(node.id, 'parentId', roomId);
      router.refresh();
    },
    [node, museums, rooms, router]
  );

  const newChildRoute =
    node.type === 'MUSEUM'
      ? `/admin/rooms/new?museumId=${node.id}`
      : node.type === 'ROOM'
        ? `/admin/artifacts/new?museumId=${parent?.id || ''}&roomId=${node.id}`
        : null;
  const newArtifactRoute =
    node.type === 'MUSEUM' ? `/admin/artifacts/new?museumId=${node.id}` : null;

  return (
    <>
      <div className="space-y-6">
        {/* Combined Details, Content, and Further Reading */}
        <SectionCard title="Details">
          <div className="space-y-6">
            {/* Name */}
            <InlineEditableField
              label="Name"
              value={node.name}
              onSave={handleSaveName}
              type="text"
            />

            {/* Parent selection (for Rooms and Artifacts) */}
            {node.type === 'ROOM' && (
              <div className="space-y-2">
                <Label htmlFor="parentId">Museum</Label>
                <select
                  id="parentId"
                  value={node.parentId || ''}
                  onChange={async (e) => {
                    const parentId = e.target.value
                      ? Number(e.target.value)
                      : null;
                    setNode({ ...node, parentId });
                    // Save immediately
                    try {
                      await updateNodeField(node.id, 'parentId', parentId);
                      router.refresh();
                    } catch (error) {
                      console.error('Failed to update parent:', error);
                      alert('Failed to update museum. Please try again.');
                    }
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select a museum</option>
                  {museums.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {node.type === 'ARTIFACT' && (
              <InlineEditableMuseumRoom
                museumLabel="Museum"
                roomLabel="Room"
                museumValue={parentParent?.id}
                roomValue={node.parentId}
                museums={museums.map((m) => ({ id: m.id, name: m.name }))}
                rooms={rooms.map((r) => ({
                  id: r.id,
                  name: r.name,
                  parentId: r.parentId,
                }))}
                onSave={handleSaveMuseumRoom}
                museumPlaceholder="Select a museum"
                roomPlaceholder="Select a room"
                getMuseumHref={(id) => nodeEditHref('MUSEUM', id)}
                getRoomHref={(id) => nodeEditHref('ROOM', id)}
              />
            )}

            {/* Knowledge Text */}
            <InlineEditableField
              label="Knowledge Text"
              value={node.knowledgeText || ''}
              onSave={handleSaveKnowledgeText}
              type="textarea"
              rows={8}
              placeholder="Enter knowledge text about this entity..."
            />

            {/* Further Reading */}
            <InlineEditableUrlList
              label="Further Reading"
              value={node.furtherReading || []}
              onSave={handleSaveFurtherReading}
            />
          </div>
        </SectionCard>

        {/* Children */}
        {childNodes.length > 0 && (
          <SectionCard
            title={node.type === 'MUSEUM' ? 'Rooms' : 'Artifacts'}
            actions={
              newChildRoute ? (
                <Button asChild size="sm">
                  <Link href={newChildRoute}>
                    Add {node.type === 'MUSEUM' ? 'Room' : 'Artifact'}
                  </Link>
                </Button>
              ) : undefined
            }
          >
            <EntityList
              title=""
              items={childNodes.map((child) => ({
                id: child.id,
                name: child.name,
                href: nodeEditHref(child.type, child.id),
                typePill: child.type,
              }))}
              emptyState={null}
            />
          </SectionCard>
        )}
        {childNodes.length === 0 && newChildRoute && (
          <SectionCard
            title={node.type === 'MUSEUM' ? 'Rooms' : 'Artifacts'}
            actions={
              <Button asChild size="sm">
                <Link href={newChildRoute}>
                  Add {node.type === 'MUSEUM' ? 'Room' : 'Artifact'}
                </Link>
              </Button>
            }
          >
            <p className="text-sm text-muted-foreground">
              No {node.type === 'MUSEUM' ? 'rooms' : 'artifacts'} yet.
            </p>
          </SectionCard>
        )}

        {/* Artifacts section for museums */}
        {node.type === 'MUSEUM' && (
          <>
            {museumArtifacts && museumArtifacts.length > 0 ? (
              <SectionCard
                title="Artifacts"
                actions={
                  newArtifactRoute ? (
                    <Button asChild size="sm">
                      <Link href={newArtifactRoute}>Add Artifact</Link>
                    </Button>
                  ) : undefined
                }
              >
                <EntityList
                  title=""
                  items={museumArtifacts.map((artifact) => ({
                    id: artifact.id,
                    name: artifact.name,
                    href: nodeEditHref(artifact.type, artifact.id),
                    typePill: artifact.type,
                  }))}
                  emptyState={null}
                />
              </SectionCard>
            ) : (
              newArtifactRoute && (
                <SectionCard
                  title="Artifacts"
                  actions={
                    <Button asChild size="sm">
                      <Link href={newArtifactRoute}>Add Artifact</Link>
                    </Button>
                  }
                >
                  <p className="text-sm text-muted-foreground">
                    No artifacts yet.
                  </p>
                </SectionCard>
              )
            )}
          </>
        )}
      </div>
    </>
  );
}
