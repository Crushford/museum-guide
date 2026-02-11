import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../../../lib/api';
import { AdminPageLayout } from '../../../../components/shared';
import { EditPageClient } from '../../shared/EditPageClient';
import { updateMuseum } from '../../shared/actions';
import { DeleteEntityButton } from '../../shared/DeleteEntityButton';
import { deleteMuseum } from './actions';
import { SectionCard } from '../../../../components/shared';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Museum, Room, Artifact, ContentItem } from '@/lib/types';

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

  const [museum, rooms, artifacts, content, museums] = await Promise.all([
    api<Museum>(`/museums/${nodeId}`),
    api<Room[]>(`/museums/${nodeId}/rooms`).catch(() => []),
    api<Artifact[]>(`/museums/${nodeId}/artifacts-recursive`).catch(() => []),
    api<ContentItem[]>(`/museums/${nodeId}/content`).catch(() => []),
    api<Museum[]>(`/museums`).catch(() => []),
  ]);

  // Find intro content and followups (same as public page)
  const intro = content.find((c) => c.type === 'intro') || content[0];
  const followups = content.filter((c) => c.type === 'followup').slice(0, 3);

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
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/${museum.slug}`}>
              View Public Page
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin">Back to Admin</Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <EditPageClient
          entity={{
            id: museum.id,
            name: museum.name,
            knowledgeText: museum.knowledgeText ?? null,
            furtherReading: museum.furtherReading ?? [],
            type: 'museum',
          }}
          childRooms={rooms}
          childArtifacts={artifacts}
          museums={museums}
          onSave={handleSave}
        />
        {/* Generated Content */}
        {intro && intro.text.trim() && (
          <SectionCard title="Introduction">
            <p className="text-primary leading-relaxed">{intro.text}</p>
          </SectionCard>
        )}

        {followups.length > 0 && (
          <SectionCard title="Explore Next">
            <div className="space-y-4">
              {followups.map((followup) => {
                if (!followup.text.trim()) return null;
                return (
                  <div key={followup.id}>
                    <p className="text-primary leading-relaxed">
                      {followup.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        <div className="flex justify-end pt-4">
          <DeleteEntityButton
            entityType="museum"
            entityId={museum.id}
            entityName={museum.name}
            onDelete={deleteMuseum}
          />
        </div>
      </div>
    </AdminPageLayout>
  );
}
