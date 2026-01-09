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
