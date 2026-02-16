'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageLayout } from '@/components/shared';
import { SectionCard } from '@/components/shared';
import { AdminTabsClient } from './AdminTabsClient';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useAuthedApi } from '@/lib/useAuthedApi';
import type {
  MuseumResponse,
  RoomResponse,
  ArtifactResponse,
} from '@repo/types';

type Museum = MuseumResponse;
type Room = RoomResponse;
type Artifact = ArtifactResponse;

export default function AdminPage() {
  const authedApi = useAuthedApi();
  const [museums, setMuseums] = useState<Museum[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [museumsData, roomsData, artifactsData] = await Promise.all([
        authedApi.get<Museum[]>('/admin/content/museums'),
        authedApi.get<Room[]>('/admin/content/rooms'),
        authedApi.get<Artifact[]>('/admin/content/artifacts'),
      ]);

      setMuseums(museumsData);
      setRooms(roomsData);
      setArtifacts(artifactsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [authedApi]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <PageLayout title="Admin">
        <SectionCard title="">
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        </SectionCard>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title="Admin">
        <SectionCard title="">
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchData}>Retry</Button>
          </div>
        </SectionCard>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Admin"
      actions={
        <Button asChild variant="secondary">
          <Link href="/admin/content" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            View Content
          </Link>
        </Button>
      }
    >
      <SectionCard title="">
        <AdminTabsClient
          museums={museums}
          rooms={rooms}
          artifacts={artifacts}
        />
      </SectionCard>
    </PageLayout>
  );
}
