import { redirect } from 'next/navigation';
import { api } from '../../../../lib/api';
import { nodeEditHref } from '../../shared/nodeRoutes';

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  parentId: number | null;
};

export default async function NodeRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nodeId = Number(id);

  try {
    const node = await api<Node>(`/nodes/${nodeId}`);
    redirect(nodeEditHref(node.type, nodeId));
  } catch {
    redirect('/admin');
  }
}
