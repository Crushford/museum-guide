import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../../../lib/api';
import { AdminPageLayout } from '../../../../components/shared';
import { EditPageClient } from '../../shared/EditPageClient';
import { updateNode } from '../../shared/actions';
import { nodeEditHref } from '../../shared/nodeRoutes';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  parentId: number | null;
  knowledgeText: string | null;
  furtherReading: string[];
};

type Child = {
  id: number;
  name: string;
  type: 'ROOM' | 'ARTIFACT';
};

type Parent = {
  id: number;
  name: string;
  type: 'MUSEUM' | 'ROOM';
};

async function getNodeHierarchy(nodeId: number): Promise<string[]> {
  const node = await api<Node>(`/nodes/${nodeId}`).catch(() => null);
  if (!node) return [];

  const hierarchy = [node.name];
  if (node.parentId) {
    const parentHierarchy = await getNodeHierarchy(node.parentId);
    return [...parentHierarchy, ...hierarchy];
  }
  return hierarchy;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const nodeId = Number(id);

  try {
    const hierarchy = await getNodeHierarchy(nodeId);
    if (hierarchy.length > 0) {
      return {
        title: `Museum Guide - Room: ${hierarchy[0]}`,
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    title: 'Museum Guide - Room',
  };
}

export default async function RoomEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nodeId = Number(id);

  const [node, children, museums] = await Promise.all([
    api<Node>(`/nodes/${nodeId}`),
    api<Child[]>(`/nodes/${nodeId}/children`).catch(() => []),
    api<Node[]>(`/admin/nodes/museums`).catch(() => []),
  ]);

  if (node.type !== 'ROOM') {
    // Redirect to correct type
    redirect(nodeEditHref(node.type, nodeId));
  }

  // Get parent museum
  const parent: Parent | undefined = node.parentId
    ? await api<Node>(`/nodes/${node.parentId}`)
        .then((n) => ({ id: n.id, name: n.name, type: n.type as 'MUSEUM' }))
        .catch(() => undefined)
    : undefined;

  const handleSave = async (data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }) => {
    'use server';
    await updateNode(nodeId, 'ROOM', data);
  };

  return (
    <AdminPageLayout
      title={`Room: ${node.name}`}
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Rooms', href: '/admin?tab=rooms' },
        { label: node.name },
      ]}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Back to Admin</Link>
        </Button>
      }
    >
      <EditPageClient
        node={node}
        parent={parent}
        children={children}
        museums={museums}
        rooms={[]}
        onSave={handleSave}
      />
    </AdminPageLayout>
  );
}
