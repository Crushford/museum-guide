'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from '@/components/shared';
import { SectionCard } from '@/components/shared';
import { ContentTabsClient } from './ContentTabsClient';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type {
  MuseumResponse,
  RoomResponse,
  ArtifactResponse,
} from '@repo/types';
import type { ContentRow } from '@/lib/types';

export default function AdminContentPage() {
  const [museums, setMuseums] = useState<MuseumResponse[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactResponse[]>([]);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [museumsRes, roomsRes, artifactsRes, contentRes] =
        await Promise.all([
          fetch('/api/admin/museums'),
          fetch('/api/admin/rooms'),
          fetch('/api/admin/artifacts'),
          fetch('/api/admin/content'),
        ]);

      if (
        !museumsRes.ok ||
        !roomsRes.ok ||
        !artifactsRes.ok ||
        !contentRes.ok
      ) {
        throw new Error('Failed to fetch admin data');
      }

      const [museumsData, roomsData, artifactsData, contentData] =
        await Promise.all([
          museumsRes.json(),
          roomsRes.json(),
          artifactsRes.json(),
          contentRes.json(),
        ]);

      setMuseums(museumsData);
      setRooms(roomsData);
      setArtifacts(artifactsData);
      setContent(contentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <PageLayout title="Content Management">
      <SectionCard title="">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchData}>Retry</Button>
          </div>
        )}
        {!loading && !error && (
          <>
            <div className="mb-4 p-4 bg-muted/50 rounded-md border border-border">
              <p className="text-sm text-muted-foreground">
                View-only table. Editing happens on entity pages.
              </p>
            </div>
            <ContentTabsClient
              museums={museums}
              rooms={rooms}
              artifacts={artifacts}
              content={content}
              onRefresh={fetchData}
            />
          </>
        )}
      </SectionCard>
    </PageLayout>
  );
}
