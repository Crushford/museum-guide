import type { Metadata } from 'next';
import { api } from '../../lib/api';
import { AdminPageLayout } from '../../components/shared';
import { SectionCard } from '../../components/shared';
import { AdminTabsClient } from './AdminTabsClient';
import type {
  MuseumResponse,
  RoomResponse,
  ArtifactResponse,
} from '@repo/types';

export const metadata: Metadata = {
  title: 'Admin',
};

// Use shared types from API
type Museum = MuseumResponse;
type Room = RoomResponse;
type Artifact = ArtifactResponse;

export default async function AdminPage() {
  const [museums, rooms, artifacts] = await Promise.all([
    api<Museum[]>('/museums'),
    api<Room[]>('/admin/rooms'),
    api<Artifact[]>('/admin/artifacts'),
  ]);

  return (
    <AdminPageLayout title="Admin">
      <SectionCard title="">
        <AdminTabsClient
          museums={museums}
          rooms={rooms}
          artifacts={artifacts}
        />
      </SectionCard>
    </AdminPageLayout>
  );
}
