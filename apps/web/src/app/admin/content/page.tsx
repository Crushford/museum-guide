'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLayout } from '@/components/shared';
import { SectionCard } from '@/components/shared';
import { ContentTabsClient } from './ContentTabsClient';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuthedApi } from '@/lib/useAuthedApi';
import type {
  MuseumResponse,
  RoomResponse,
  ArtifactResponse,
} from '@repo/types';
import type { ContentRow } from '@/lib/types';

export default function AdminContentPage() {
  const authedApi = useAuthedApi();
  const [museums, setMuseums] = useState<MuseumResponse[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactResponse[]>([]);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
      try {
        setLoading(true);
        setError(null);
      const [museumsData, roomsData, artifactsData, contentData] =
        await Promise.all([
          authedApi.get<MuseumResponse[]>('/admin/content/museums'),
          authedApi.get<RoomResponse[]>('/admin/content/rooms'),
          authedApi.get<ArtifactResponse[]>('/admin/content/artifacts'),
          authedApi.get<ContentRow[]>('/admin/content/content'),
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
  }, [authedApi]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <PageLayout title="Content Management">
      <SectionCard title="">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchData}>Retry</Button>
          </div>
        )}
        {!loading && !error && (
          <ContentTabsClient
            museums={museums}
            rooms={rooms}
            artifacts={artifacts}
            content={content}
            onRefresh={fetchData}
          />
        )}
      </SectionCard>
    </PageLayout>
  );
}
