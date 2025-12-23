'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Tabs } from '../../components/shared';
import { EmptyState } from '../../components/shared';
import { NodesListClient } from './nodes/NodesListClient';

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
  name: string;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  parentId: number | null;
};

type AdminTabsClientProps = {
  museums: Museum[];
  rooms: Room[];
  artifacts: Artifact[];
  allNodes: Node[];
};

export function AdminTabsClient({
  museums,
  rooms,
  artifacts,
  allNodes,
}: AdminTabsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get('tab') || 'all';
  const museumIdParam = searchParams.get('museumId');
  const roomIdParam = searchParams.get('roomId');

  const [selectedMuseumId, setSelectedMuseumId] = useState<number | null>(
    museumIdParam ? Number(museumIdParam) : null
  );
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(
    roomIdParam ? Number(roomIdParam) : null
  );

  // Validate roomId belongs to museumId
  useEffect(() => {
    if (selectedRoomId && selectedMuseumId) {
      const room = rooms.find(
        (r) => r.id === selectedRoomId && r.museumId === selectedMuseumId
      );
      if (!room) {
        setSelectedRoomId(null);
        const params = new URLSearchParams(searchParams.toString());
        params.delete('roomId');
        router.replace(`/admin?${params.toString()}`);
      }
    }
  }, [selectedRoomId, selectedMuseumId, rooms, searchParams, router]);

  const handleMuseumChange = (museumId: number | null) => {
    setSelectedMuseumId(museumId);
    setSelectedRoomId(null);
    const params = new URLSearchParams(searchParams.toString());
    if (museumId) {
      params.set('museumId', museumId.toString());
    } else {
      params.delete('museumId');
    }
    params.delete('roomId');
    router.push(`/admin?${params.toString()}`);
  };

  const handleRoomChange = (roomId: number | null) => {
    setSelectedRoomId(roomId);
    const params = new URLSearchParams(searchParams.toString());
    if (roomId) {
      params.set('roomId', roomId.toString());
    } else {
      params.delete('roomId');
    }
    router.push(`/admin?${params.toString()}`);
  };

  // Get rooms for selected museum
  const availableRooms = selectedMuseumId
    ? rooms.filter((r) => r.museumId === selectedMuseumId)
    : [];

  // Filter data based on tab and filters
  let filteredRooms = rooms;
  let filteredArtifacts = artifacts;
  let displayItems: Array<{
    id: number;
    name: string;
    subtitle?: string;
    href: string;
    typePill: string;
    parentId: number | null;
  }> = [];

  if (tab === 'museums') {
    displayItems = museums.map((m) => ({
      id: m.id,
      name: m.name,
      href: `/admin/nodes/${m.id}`,
      typePill: 'MUSEUM',
      parentId: null,
    }));
  } else if (tab === 'rooms') {
    if (selectedMuseumId) {
      filteredRooms = rooms.filter((r) => r.museumId === selectedMuseumId);
    }
    displayItems = filteredRooms.map((r) => ({
      id: r.id,
      name: selectedMuseumId
        ? r.name
        : r.museumName
          ? `${r.museumName} - ${r.name}`
          : r.name,
      subtitle: r.museumName ? `Museum: ${r.museumName}` : undefined,
      href: `/admin/nodes/${r.id}`,
      typePill: 'ROOM',
      parentId: r.museumId,
    }));
  } else if (tab === 'artifacts') {
    if (selectedRoomId) {
      filteredArtifacts = artifacts.filter((a) => a.roomId === selectedRoomId);
    } else if (selectedMuseumId) {
      filteredArtifacts = artifacts.filter(
        (a) => a.museumId === selectedMuseumId
      );
    }

    displayItems = filteredArtifacts.map((a) => {
      let name = a.name;
      let subtitle: string | undefined;

      if (!selectedMuseumId && !selectedRoomId) {
        // No filters: show museum - artifact (or museum - room - artifact)
        if (a.museumName) {
          name = `${a.museumName} - ${a.name}`;
          if (a.roomName) {
            subtitle = `Room: ${a.roomName}`;
          }
        }
      } else if (selectedMuseumId && !selectedRoomId) {
        // Museum selected: show artifact with room context
        if (a.roomName) {
          name = `${a.roomName} - ${a.name}`;
        }
        subtitle = a.roomName ? `Room: ${a.roomName}` : undefined;
      } else {
        // Both selected: just artifact name (room context already clear from filter)
        subtitle = undefined;
      }

      return {
        id: a.id,
        name,
        subtitle,
        href: `/admin/nodes/${a.id}`,
        typePill: 'ARTIFACT',
        parentId: a.roomId,
      };
    });
  } else {
    // tab === 'all'
    displayItems = allNodes.map((node) => {
      let subtitle: string | undefined;
      if (node.type === 'ROOM') {
        const room = rooms.find((r) => r.id === node.id);
        subtitle = room?.museumName ? `Museum: ${room.museumName}` : undefined;
      } else if (node.type === 'ARTIFACT') {
        const artifact = artifacts.find((a) => a.id === node.id);
        if (artifact) {
          const parts: string[] = [];
          if (artifact.roomName) parts.push(`Room: ${artifact.roomName}`);
          if (artifact.museumName) parts.push(`Museum: ${artifact.museumName}`);
          subtitle = parts.length > 0 ? parts.join(', ') : undefined;
        }
      }

      return {
        id: node.id,
        name: node.name,
        subtitle,
        href: `/admin/nodes/${node.id}`,
        typePill: node.type,
        parentId: node.parentId,
      };
    });
  }

  const getAddButtonHref = () => {
    if (tab === 'museums') {
      return '/admin/nodes/new?type=MUSEUM';
    } else if (tab === 'rooms') {
      const params = new URLSearchParams();
      params.set('type', 'ROOM');
      if (selectedMuseumId) {
        params.set('parentId', selectedMuseumId.toString());
      }
      return `/admin/nodes/new?${params.toString()}`;
    } else if (tab === 'artifacts') {
      const params = new URLSearchParams();
      params.set('type', 'ARTIFACT');
      if (selectedRoomId) {
        params.set('parentId', selectedRoomId.toString());
      } else if (selectedMuseumId) {
        params.set('parentId', selectedMuseumId.toString());
      }
      return `/admin/nodes/new?${params.toString()}`;
    }
    return '/admin/nodes/new';
  };

  const getAddButtonLabel = () => {
    if (tab === 'museums') return 'Add Museum';
    if (tab === 'rooms') return 'Add Room';
    if (tab === 'artifacts') return 'Add Artifact';
    return 'Add New Node';
  };

  const tabs = [
    { id: 'all', label: 'All nodes' },
    { id: 'museums', label: 'Museums' },
    { id: 'rooms', label: 'Rooms' },
    { id: 'artifacts', label: 'Artifacts' },
  ];

  return (
    <Tabs tabs={tabs} defaultTab="all">
      <div className="space-y-4">
        {/* Filters for Rooms tab */}
        {tab === 'rooms' && (
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-fg">Museum:</label>
            <select
              value={selectedMuseumId || ''}
              onChange={(e) =>
                handleMuseumChange(
                  e.target.value ? Number(e.target.value) : null
                )
              }
              className="px-3 py-2 bg-bg-2 border border-border rounded-md text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">All museums</option>
              {museums.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Filters for Artifacts tab */}
        {tab === 'artifacts' && (
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-fg">Museum:</label>
            <select
              value={selectedMuseumId || ''}
              onChange={(e) =>
                handleMuseumChange(
                  e.target.value ? Number(e.target.value) : null
                )
              }
              className="px-3 py-2 bg-bg-2 border border-border rounded-md text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">All museums</option>
              {museums.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            <label className="text-sm font-medium text-fg">Room:</label>
            <select
              value={selectedRoomId || ''}
              onChange={(e) =>
                handleRoomChange(e.target.value ? Number(e.target.value) : null)
              }
              disabled={!selectedMuseumId}
              className="px-3 py-2 bg-bg-2 border border-border rounded-md text-fg focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">All rooms</option>
              {availableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <NodesListClient
          items={displayItems}
          primaryAction={{
            label: getAddButtonLabel(),
            href: getAddButtonHref(),
          }}
          emptyState={
            <EmptyState
              title={`No ${tab === 'all' ? 'nodes' : tab} yet`}
              message={
                tab === 'all'
                  ? 'Create your first museum to get started.'
                  : `Create your first ${tab.slice(0, -1)} to get started.`
              }
              action={{
                label: `Add ${tab === 'all' ? 'your first museum' : `your first ${tab.slice(0, -1)}`}`,
                href: getAddButtonHref(),
              }}
            />
          }
        />
      </div>
    </Tabs>
  );
}
