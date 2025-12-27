'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SectionCard } from '@/components/shared/SectionCard';
import { InlineEditableField } from '@/components/shared/InlineEditableField';
import { InlineEditableUrlList } from '@/components/shared/InlineEditableUrlList';
import { TypePill } from '@/components/shared/TypePill';
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
  children: Child[];
  museums: Parent[]; // For parent selection
  rooms: Parent[]; // For artifact parent selection (with parentId)
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
  children,
  museums,
  rooms,
  onSave,
}: EditPageClientProps) {
  const router = useRouter();
  const [node, setNode] = useState<Node>(initialNode);
  const [parent, setParent] = useState<Parent | undefined>(initialParent);
  const [parentParent, setParentParent] = useState<Parent | undefined>(
    initialParentParent
  );

  // Update node when initialNode changes (after save)
  useEffect(() => {
    setNode(initialNode);
  }, [initialNode]);

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

  const typeLabel =
    node.type === 'MUSEUM'
      ? 'Museum'
      : node.type === 'ROOM'
        ? 'Room'
        : 'Artifact';
  const newChildRoute =
    node.type === 'MUSEUM'
      ? `/admin/rooms/new?museumId=${node.id}`
      : node.type === 'ROOM'
        ? `/admin/artifacts/new?museumId=${parent?.id || ''}&roomId=${node.id}`
        : null;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
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
                <>
                  <div className="space-y-2">
                    <Label htmlFor="museumId">Museum</Label>
                    <select
                      id="museumId"
                      value={parentParent?.id || ''}
                      onChange={async (e) => {
                        const museumId = e.target.value
                          ? Number(e.target.value)
                          : null;
                        const selectedMuseum = museumId
                          ? museums.find((m) => m.id === museumId)
                          : undefined;
                        setParentParent(selectedMuseum);
                        // If current room doesn't belong to selected museum, clear it
                        const filteredRooms = museumId
                          ? rooms.filter((r) => r.parentId === museumId)
                          : [];
                        const newParentId =
                          museumId && node.parentId
                            ? filteredRooms.find((r) => r.id === node.parentId)
                              ? node.parentId
                              : null
                            : node.parentId;
                        setNode({ ...node, parentId: newParentId });
                        // Update parent if room was cleared
                        if (!newParentId) {
                          setParent(undefined);
                        }
                        // Save immediately
                        try {
                          await updateNodeField(
                            node.id,
                            'parentId',
                            newParentId
                          );
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
                  <div className="space-y-2">
                    <Label htmlFor="parentId">Room</Label>
                    <select
                      id="parentId"
                      value={node.parentId || ''}
                      onChange={async (e) => {
                        const roomId = e.target.value
                          ? Number(e.target.value)
                          : null;
                        const selectedRoom = roomId
                          ? rooms.find((r) => r.id === roomId)
                          : undefined;
                        setNode({ ...node, parentId: roomId });
                        setParent(selectedRoom);
                        // Save immediately
                        try {
                          await updateNodeField(node.id, 'parentId', roomId);
                          router.refresh();
                        } catch (error) {
                          console.error('Failed to update parent:', error);
                          alert('Failed to update room. Please try again.');
                        }
                      }}
                      disabled={!parentParent}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select a room</option>
                      {rooms
                        .filter(
                          (r) => !parentParent || r.parentId === parentParent.id
                        )
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
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
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Info */}
          <SectionCard title="Info">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <div className="mt-1">
                  <TypePill type={node.type} />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">ID</Label>
                <p className="mt-1 text-sm font-mono text-muted-foreground">
                  {node.id}
                </p>
              </div>
              {parent && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {parent.type === 'MUSEUM' ? 'Museum' : 'Room'}
                  </Label>
                  <div className="mt-1">
                    <Link
                      href={nodeEditHref(parent.type, parent.id)}
                      className="text-sm text-primary hover:underline"
                    >
                      {parent.name}
                    </Link>
                  </div>
                </div>
              )}
              {parentParent && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Museum
                  </Label>
                  <div className="mt-1">
                    <Link
                      href={nodeEditHref('MUSEUM', parentParent.id)}
                      className="text-sm text-primary hover:underline"
                    >
                      {parentParent.name}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Children */}
          {children.length > 0 && (
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
                items={children.map((child) => ({
                  id: child.id,
                  name: child.name,
                  href: nodeEditHref(child.type, child.id),
                  typePill: child.type,
                }))}
                emptyState={null}
              />
            </SectionCard>
          )}
          {children.length === 0 && newChildRoute && (
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
        </div>
      </div>
    </>
  );
}
