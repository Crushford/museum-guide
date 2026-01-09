import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../../../lib/api';
import { AdminPageLayout } from '../../../../components/shared';
import { EditPageClient } from '../../shared/EditPageClient';
import { updateMuseum } from '../../shared/actions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { DeleteMuseumButton } from './DeleteMuseumButton';

type Museum = {
  id: number;
  name: string;
  knowledgeText: string | null;
  furtherReading: string[];
};

type Room = {
  id: number;
  name: string;
};

type Artifact = {
  id: number;
  name: string;
};

async function getMuseumHierarchy(museumId: number): Promise<string[]> {
  const museum = await api<Museum>(`/museums/${museumId}`).catch(() => null);
  if (!museum) return [];
  return [museum.name];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const nodeId = Number(id);

  try {
    const hierarchy = await getMuseumHierarchy(nodeId);
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

  // Redirect "new" to the new museum page
  if (id === 'new') {
    redirect('/admin/museums/new');
  }

  const nodeId = Number(id);

  // Check if nodeId is valid
  if (Number.isNaN(nodeId)) {
    redirect('/admin');
  }

  const [museum, rooms, artifacts] = await Promise.all([
    api<Museum>(`/museums/${nodeId}`),
    api<Room[]>(`/museums/${nodeId}/rooms`).catch(() => []),
    api<Artifact[]>(`/museums/${nodeId}/artifacts`).catch(() => []),
  ]);

  // Get all museums for potential parent selection (not needed for museums, but for consistency)
  const museums = await api<Museum[]>(`/museums`).catch(() => []);

  const handleSave = async (data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }) => {
    'use server';
    await updateMuseum(nodeId, data);
  };

  return (
    <AdminPageLayout
      title={`Museum: ${museum.name}`}
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Museums', href: '/admin?tab=museums' },
        { label: museum.name },
      ]}
      actions={
        <Button asChild size="sm">
          <Link href="/admin">Back to Admin</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <EditPageClient
          entity={{
            id: museum.id,
            name: museum.name,
            knowledgeText: museum.knowledgeText,
            furtherReading: museum.furtherReading,
            type: 'museum',
          }}
          childRooms={rooms}
          childArtifacts={artifacts}
          museums={museums}
          onSave={handleSave}
        />
        <div className="flex justify-end pt-4">
          <DeleteMuseumButton museumId={museum.id} museumName={museum.name} />
        </div>
      </div>
    </AdminPageLayout>
  );
}
