import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../../../lib/api';
import { AdminPageLayout } from '../../../../components/shared';
import { EditPageClient } from '../../shared/EditPageClient';
import { updateRoom } from '../../shared/actions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type Room = {
  id: number;
  name: string;
  museumId: number | null;
  knowledgeText: string | null;
  furtherReading: string[];
};

type Museum = {
  id: number;
  name: string;
};

type Artifact = {
  id: number;
  name: string;
};

async function getRoomHierarchy(roomId: number): Promise<string[]> {
  const room = await api<Room>(`/rooms/${roomId}`).catch(() => null);
  if (!room) return [];
  return [room.name];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const nodeId = Number(id);

  try {
    const hierarchy = await getRoomHierarchy(nodeId);
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

  // Redirect "new" to admin (rooms require a museumId)
  if (id === 'new') {
    redirect('/admin');
  }

  const nodeId = Number(id);

  // Check if nodeId is valid
  if (Number.isNaN(nodeId)) {
    redirect('/admin');
  }

  const [room, artifacts, museums] = await Promise.all([
    api<Room>(`/rooms/${nodeId}`),
    api<Artifact[]>(`/rooms/${nodeId}/artifacts`).catch(() => []),
    api<Museum[]>(`/museums`).catch(() => []),
  ]);

  // Get parent museum
  const parentMuseum: Museum | null = room.museumId
    ? await api<Museum>(`/museums/${room.museumId}`).catch(() => null)
    : null;

  const handleSave = async (data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }) => {
    'use server';
    await updateRoom(nodeId, data);
  };

  return (
    <AdminPageLayout
      title={`Room: ${room.name}`}
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Rooms', href: '/admin?tab=rooms' },
        { label: room.name },
      ]}
      actions={
        <Button asChild size="sm">
          <Link href="/admin">Back to Admin</Link>
        </Button>
      }
    >
      <EditPageClient
        entity={{
          id: room.id,
          name: room.name,
          knowledgeText: room.knowledgeText,
          furtherReading: room.furtherReading,
          type: 'room',
          parentId: room.museumId,
        }}
        parentMuseum={parentMuseum}
        childArtifacts={artifacts}
        museums={museums}
        onSave={handleSave}
      />
    </AdminPageLayout>
  );
}
