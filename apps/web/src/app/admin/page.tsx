import type { Metadata } from 'next';
import { api } from '../../lib/api';
import { AdminPageLayout } from '../../components/shared';
import { SectionCard } from '../../components/shared';
import { AdminTabsClient } from './AdminTabsClient';

export const metadata: Metadata = {
  title: 'Admin',
};

type Museum = {
  id: number;
  name: string;
};

type Room = {
  id: number;
  name: string;
  museumId: number | null;
  museumName: string | null;
};

type Artifact = {
  id: number;
  name: string;
  roomId: number | null;
  roomName: string | null;
  museumId: number | null;
  museumName: string | null;
};

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  parentId: number | null;
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
  const [museums, rooms, artifacts, allNodes] = await Promise.all([
    api<Museum[]>('/nodes/museums'),
    api<Room[]>('/admin/nodes/rooms'),
    api<Artifact[]>('/admin/nodes/artifacts'),
    getAllNodes(),
  ]);

  return (
    <AdminPageLayout title="Admin">
      <SectionCard title="">
        <AdminTabsClient
          museums={museums}
          rooms={rooms}
          artifacts={artifacts}
          allNodes={allNodes}
        />
      </SectionCard>
    </AdminPageLayout>
  );
}
