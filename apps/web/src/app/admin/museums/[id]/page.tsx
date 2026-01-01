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
        title: `Museum Guide - Museum: ${hierarchy[0]}`,
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    title: 'Museum Guide - Museum',
  };
}

export default async function MuseumEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Redirect "new" to the proper new node page
  if (id === 'new') {
    redirect('/admin/nodes/new?type=MUSEUM');
  }

  const nodeId = Number(id);

  // Check if nodeId is valid
  if (Number.isNaN(nodeId)) {
    redirect('/admin');
  }

  const [node, children, allArtifacts] = await Promise.all([
    api<Node>(`/nodes/${nodeId}`),
    api<Child[]>(`/nodes/${nodeId}/children`).catch(() => []),
    api<Child[]>(`/admin/nodes/artifacts?museumId=${nodeId}`).catch(() => []),
  ]);

  // Filter to only artifacts (children are rooms)
  const artifacts = allArtifacts.filter((a) => a.type === 'ARTIFACT');

  if (node.type !== 'MUSEUM') {
    // Redirect to correct type
    redirect(nodeEditHref(node.type, nodeId));
  }

  // Get all museums for potential parent selection (not needed for museums, but for consistency)
  const museums = await api<Node[]>(`/admin/nodes/museums`).catch(() => []);

  const handleSave = async (data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }) => {
    'use server';
    await updateNode(nodeId, 'MUSEUM', data);
  };

  return (
    <AdminPageLayout
      title={`Museum: ${node.name}`}
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Museums', href: '/admin?tab=museums' },
        { label: node.name },
      ]}
      actions={
        <Button asChild size="sm">
          <Link href="/admin">Back to Admin</Link>
        </Button>
      }
    >
      <EditPageClient
        node={node}
        childNodes={children}
        museums={museums.filter((m) => m.type === 'MUSEUM') as Parent[]}
        rooms={[]}
        artifacts={artifacts}
        onSave={handleSave}
      />
    </AdminPageLayout>
  );
}
