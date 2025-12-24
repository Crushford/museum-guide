'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SaveBar } from '@/components/shared/SaveBar';
import { useLeavePageGuard } from '@/components/shared/LeavePageGuard';
import { SectionCard } from '@/components/shared/SectionCard';
import { UrlListEditor } from '@/components/shared/UrlListEditor';
import { TypePill } from '@/components/shared/TypePill';
import { EntityList } from '@/components/shared/EntityList';
import { nodeEditHref } from './nodeRoutes';
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

const DRAFT_KEY_PREFIX = 'admin:draft';

function getDraftKey(type: string, id: number): string {
  return `${DRAFT_KEY_PREFIX}:${type}:${id}`;
}

function loadDraft(type: string, id: number, baseData: Node): Node | null {
  if (typeof window === 'undefined') return null;

  const key = getDraftKey(type, id);
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    const draft = JSON.parse(stored);
    // Check if draft differs from base
    const draftStr = JSON.stringify({
      name: draft.data.name,
      parentId: draft.data.parentId,
      knowledgeText: draft.data.knowledgeText || null,
      furtherReading: draft.data.furtherReading || [],
    });
    const baseStr = JSON.stringify({
      name: baseData.name,
      parentId: baseData.parentId,
      knowledgeText: baseData.knowledgeText || null,
      furtherReading: baseData.furtherReading || [],
    });

    if (draftStr === baseStr) {
      // Draft matches API, clear it
      localStorage.removeItem(key);
      return null;
    }

    return draft.data;
  } catch {
    return null;
  }
}

function saveDraft(type: string, id: number, data: Node, baseData: Node): void {
  if (typeof window === 'undefined') return;

  const key = getDraftKey(type, id);
  const draftStr = JSON.stringify({
    name: data.name,
    parentId: data.parentId,
    knowledgeText: data.knowledgeText || null,
    furtherReading: data.furtherReading || [],
  });
  const baseStr = JSON.stringify({
    name: baseData.name,
    parentId: baseData.parentId,
    knowledgeText: baseData.knowledgeText || null,
    furtherReading: baseData.furtherReading || [],
  });

  if (draftStr === baseStr) {
    // Matches API, clear draft
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(
    key,
    JSON.stringify({
      data,
      updatedAt: new Date().toISOString(),
      baseSnapshot: baseData,
    })
  );
}

function clearDraft(type: string, id: number): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(getDraftKey(type, id));
}

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
  const [baseNode, setBaseNode] = useState<Node>(initialNode);
  const [parent, setParent] = useState<Parent | undefined>(initialParent);
  const [parentParent, setParentParent] = useState<Parent | undefined>(
    initialParentParent
  );
  const [isSaving, setIsSaving] = useState(false);

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft(node.type.toLowerCase(), node.id, baseNode);
    if (draft) {
      setNode(draft);
    }
  }, []); // Only on mount

  // Save draft on change
  useEffect(() => {
    saveDraft(node.type.toLowerCase(), node.id, node, baseNode);
  }, [node, baseNode]);

  const isDirty =
    JSON.stringify({
      name: node.name,
      parentId: node.parentId,
      knowledgeText: node.knowledgeText || null,
      furtherReading: node.furtherReading || [],
    }) !==
    JSON.stringify({
      name: baseNode.name,
      parentId: baseNode.parentId,
      knowledgeText: baseNode.knowledgeText || null,
      furtherReading: baseNode.furtherReading || [],
    });

  useLeavePageGuard(isDirty);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave({
        name: node.name,
        parentId: node.parentId,
        knowledgeText: node.knowledgeText || null,
        furtherReading: node.furtherReading || [],
      });
      // Update base node to match saved state
      setBaseNode(node);
      clearDraft(node.type.toLowerCase(), node.id);
      // Refetch will happen via router refresh
      router.refresh();
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [node, onSave, router]);

  const handleDiscard = useCallback(() => {
    setNode(baseNode);
    clearDraft(node.type.toLowerCase(), node.id);
  }, [baseNode, node.type, node.id]);

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
          {/* Details */}
          <SectionCard title="Details">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={node.name}
                  onChange={(e) => setNode({ ...node, name: e.target.value })}
                />
              </div>

              {node.type === 'ROOM' && (
                <div className="space-y-2">
                  <Label htmlFor="parentId">Museum</Label>
                  <select
                    id="parentId"
                    value={node.parentId || ''}
                    onChange={(e) =>
                      setNode({
                        ...node,
                        parentId: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
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
                      onChange={(e) => {
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
                      onChange={(e) => {
                        const roomId = e.target.value
                          ? Number(e.target.value)
                          : null;
                        const selectedRoom = roomId
                          ? rooms.find((r) => r.id === roomId)
                          : undefined;
                        setNode({ ...node, parentId: roomId });
                        setParent(selectedRoom);
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
            </div>
          </SectionCard>

          {/* Content */}
          <SectionCard title="Content">
            <div className="space-y-2">
              <Label htmlFor="knowledgeText">Knowledge Text</Label>
              <Textarea
                id="knowledgeText"
                value={node.knowledgeText || ''}
                onChange={(e) =>
                  setNode({ ...node, knowledgeText: e.target.value || null })
                }
                rows={8}
                className="resize-y"
                placeholder="Enter knowledge text about this entity..."
              />
            </div>
          </SectionCard>

          {/* Further Reading */}
          <SectionCard title="Further Reading">
            <UrlListEditor
              value={node.furtherReading || []}
              editable
              onChange={(urls) => setNode({ ...node, furtherReading: urls })}
            />
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

      <SaveBar
        isDirty={isDirty}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </>
  );
}
