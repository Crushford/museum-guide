import Link from 'next/link';
import type { Metadata } from 'next';
import { api } from '../../lib/api';
import { AdminPageLayout } from '../../components/shared';
import { SectionCard } from '../../components/shared';
import { EmptyState } from '../../components/shared';
import { NodesListClient } from './nodes/NodesListClient';

export const metadata: Metadata = {
  title: 'Admin',
};

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  parentId: number | null;
  updatedAt: string;
};

async function getAllNodes(): Promise<Node[]> {
  const museums = await api<Node[]>('/nodes/museums');
  const allNodes: Node[] = [];

  for (const museum of museums) {
    allNodes.push(museum);
    const rooms = await api<Node[]>(`/nodes/${museum.id}/children`);
    for (const room of rooms) {
      allNodes.push(room);
      const artifacts = await api<Node[]>(`/nodes/${room.id}/children`);
      allNodes.push(...artifacts);
    }
  }

  return allNodes;
}

export default async function AdminPage() {
  const allNodes = await getAllNodes();

  const items = allNodes.map((node) => {
    const parent = allNodes.find((n) => n.id === node.parentId);
    return {
      id: node.id,
      name: node.name,
      subtitle: parent ? `Parent: ${parent.name}` : undefined,
      href: `/admin/nodes/${node.id}`,
      typePill: node.type,
      parentId: node.parentId,
    };
  });

  return (
    <AdminPageLayout
      title="Admin"
      actions={
        <Link
          href="/admin/nodes/new"
          className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-2 transition-colors"
        >
          Add New Node
        </Link>
      }
    >
      <SectionCard title="All Nodes">
        {allNodes.length === 0 ? (
          <EmptyState
            title="No nodes yet"
            message="Create your first museum to get started."
            action={{
              label: 'Add your first museum',
              href: '/admin/nodes/new',
            }}
          />
        ) : (
          <NodesListClient items={items} />
        )}
      </SectionCard>
    </AdminPageLayout>
  );
}
