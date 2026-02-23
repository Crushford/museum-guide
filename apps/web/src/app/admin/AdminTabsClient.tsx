'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Tabs } from '../../components/shared';
import { EmptyState } from '../../components/shared';
import { PromptTemplateBox } from '../../components/shared';
import { NodesListClient } from './nodes/NodesListClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { generateIntroductionTemplate } from './_lib/templates';
import type {
  MuseumResponse,
  RoomResponse,
  ArtifactResponse,
} from '@repo/types';

// Use shared types from API
type Museum = MuseumResponse;
type Room = RoomResponse;
type Artifact = ArtifactResponse;

type AdminTabsClientProps = {
  museums: Museum[];
  rooms: Room[];
  artifacts: Artifact[];
};

export function AdminTabsClient({
  museums,
  rooms,
  artifacts,
}: AdminTabsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get('tab') || 'museums';
  const museumIdParam = searchParams.get('museumId');
  const roomIdParam = searchParams.get('roomId');

  const [selectedMuseumId, setSelectedMuseumId] = useState<number | null>(
    museumIdParam ? Number(museumIdParam) : null
  );
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(
    roomIdParam ? Number(roomIdParam) : null
  );
  const [selectedTemplateArtifactId, setSelectedTemplateArtifactId] = useState<
    number | null
  >(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedTemplateTitle, setSelectedTemplateTitle] =
    useState<string>('');

  // Validate roomId belongs to museumId
  useEffect(() => {
    if (selectedRoomId && selectedMuseumId) {
      const room = rooms.find(
        (r) => r.id === selectedRoomId && r.museumId === selectedMuseumId
      );
      if (!room) {
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
    actions?: React.ReactNode;
  }> = [];

  if (tab === 'museums') {
    displayItems = museums.map((m) => ({
      id: m.id,
      name: m.name,
      href: `/admin/museums/${m.id}`,
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
        : r.museum?.name
          ? `${r.museum.name} - ${r.name}`
          : r.name,
      subtitle: r.museum?.name ? `Museum: ${r.museum.name}` : undefined,
      href: `/admin/rooms/${r.id}`,
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

      const artifact = a;
      const room = rooms.find((r) => r.id === artifact.roomId);
      const museum = museums.find(
        (m) => m.id === artifact.museumId || m.id === room?.museumId
      );
      const parentRoom = room
        ? rooms.find((r) => r.id === room.parentRoomId)
        : undefined;

      const handleGenerateContent = () => {
        // TODO: Implement generate content functionality
        console.log('Generate content for artifact:', artifact.id);
      };

      const handleViewTemplate = () => {
        // All data is already available in the table
        const template = generateIntroductionTemplate(
          artifact,
          room,
          museum,
          parentRoom
        );
        setSelectedTemplate(template);
        setSelectedTemplateTitle(`Introduction Template for ${artifact.name}`);
        setSelectedTemplateArtifactId(artifact.id);
      };

      return {
        id: a.id,
        name,
        subtitle,
        href: `/admin/artifacts/${a.id}`,
        typePill: 'ARTIFACT',
        parentId: a.roomId,
        actions: (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleViewTemplate();
              }}
            >
              View Template
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleGenerateContent();
              }}
            >
              Generate Content
            </Button>
          </>
        ),
      };
    });
  }

  const getAddButtonHref = () => {
    if (tab === 'museums') {
      return '/admin/museums/new';
    } else if (tab === 'rooms') {
      // Rooms require a museumId
      // If no museum selected but museums exist, use the first one
      // If no museums exist, redirect to museums tab
      const museumIdToUse =
        selectedMuseumId || (museums.length > 0 ? museums[0].id : null);

      if (!museumIdToUse) {
        return '/admin?tab=museums';
      }

      const params = new URLSearchParams();
      params.set('museumId', museumIdToUse.toString());
      return `/admin/rooms/new?${params.toString()}`;
    } else if (tab === 'artifacts') {
      const params = new URLSearchParams();
      if (selectedMuseumId) {
        params.set('museumId', selectedMuseumId.toString());
      }
      if (selectedRoomId) {
        params.set('roomId', selectedRoomId.toString());
      }
      return `/admin/artifacts/new?${params.toString()}`;
    }
    return '/admin/museums/new';
  };

  const getAddButtonLabel = () => {
    if (tab === 'museums') return 'Add Museum';
    if (tab === 'rooms') return 'Add Room';
    if (tab === 'artifacts') return 'Add Artifact';
    return 'Add Museum';
  };

  const tabs = [
    { id: 'museums', label: 'Museums' },
    { id: 'rooms', label: 'Rooms' },
    { id: 'artifacts', label: 'Artifacts' },
  ];

  return (
    <Tabs tabs={tabs} defaultTab="museums">
      <div className="space-y-4">
        {/* Filters for Rooms tab */}
        {tab === 'rooms' && (
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-primary">Museum:</label>
            <Select
              value={selectedMuseumId?.toString() ?? 'all'}
              onValueChange={(v) =>
                handleMuseumChange(v === 'all' ? null : Number(v))
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All museums</SelectItem>
                {museums.map((m) => (
                  <SelectItem key={m.id} value={m.id.toString()}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Filters for Artifacts tab */}
        {tab === 'artifacts' && (
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-primary">Museum:</label>
            <Select
              value={selectedMuseumId?.toString() ?? 'all'}
              onValueChange={(v) =>
                handleMuseumChange(v === 'all' ? null : Number(v))
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All museums</SelectItem>
                {museums.map((m) => (
                  <SelectItem key={m.id} value={m.id.toString()}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="text-sm font-medium text-primary">Room:</label>
            <Select
              value={selectedRoomId?.toString() ?? 'all'}
              onValueChange={(v) =>
                handleRoomChange(v === 'all' ? null : Number(v))
              }
              disabled={!selectedMuseumId}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rooms</SelectItem>
                {availableRooms.map((r) => (
                  <SelectItem key={r.id} value={r.id.toString()}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              title={`No ${tab} yet`}
              message={`Create your first ${tab.slice(0, -1)} to get started.`}
              action={{
                label: `Add your first ${tab.slice(0, -1)}`,
                href: getAddButtonHref(),
              }}
            />
          }
        />
      </div>
      <Dialog
        open={!!selectedTemplateArtifactId && !!selectedTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTemplateArtifactId(null);
            setSelectedTemplate('');
            setSelectedTemplateTitle('');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTemplateTitle}</DialogTitle>
          </DialogHeader>
          <PromptTemplateBox
            title=""
            template={selectedTemplate}
            helperText="Click Copy to copy this template to your clipboard."
          />
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
