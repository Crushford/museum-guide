import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../../../lib/api';
import { AdminPageLayout } from '../../../../components/shared';
import { EditPageClient } from '../../shared/EditPageClient';
import { updateRoom } from '../../shared/actions';
import { DeleteEntityButton } from '../../shared/DeleteEntityButton';
import { deleteRoom } from './actions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Museum, Room, Artifact } from '@/lib/types';

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

  const [room, artifacts, childRooms, museums, allRooms] = await Promise.all([
    api<Room>(`/rooms/${nodeId}`),
    api<Artifact[]>(`/rooms/${nodeId}/artifacts`).catch(() => []),
    api<Room[]>(`/rooms/${nodeId}/children`).catch(() => []),
    api<Museum[]>(`/museums`).catch(() => []),
    api<Room[]>(`/admin/rooms`).catch(() => []),
  ]);

  // Filter out the current room and its children from parent room options
  const availableParentRooms = allRooms.filter(
    (r) => r.id !== nodeId && r.parentRoomId !== nodeId
  );

  // If this is a parent room, get all artifacts from child rooms too
  let allArtifacts = artifacts;
  if (childRooms.length > 0) {
    const recursiveArtifacts = await api<Artifact[]>(
      `/rooms/${nodeId}/artifacts-recursive`
    ).catch(() => []);
    allArtifacts = recursiveArtifacts;
  }

  // Get parent museum - either directly attached or via parent room
  let parentMuseum: Museum | null = null;
  if (room.museumId) {
    // Room is directly attached to a museum
    parentMuseum = await api<Museum>(`/museums/${room.museumId}`).catch(
      () => null
    );
  } else if (room.parentRoomId) {
    // Room is a child room - get parent room's museum
    try {
      const parentRoom = await api<Room>(`/rooms/${room.parentRoomId}`);
      if (parentRoom.museumId) {
        parentMuseum = await api<Museum>(
          `/museums/${parentRoom.museumId}`
        ).catch(() => null);
      }
    } catch {
      // Failed to fetch parent room
    }
  }

  // Fetch museum information for child rooms
  const childRoomsWithMuseums = await Promise.all(
    childRooms.map(async (childRoom) => {
      let museum: Museum | null = null;
      // If child room has a parent room, get the parent room's museum
      if (childRoom.parentRoomId) {
        try {
          const parentRoom = await api<Room>(
            `/rooms/${childRoom.parentRoomId}`
          );
          if (parentRoom.museumId) {
            museum = await api<Museum>(`/museums/${parentRoom.museumId}`).catch(
              () => null
            );
          }
        } catch {
          // If parent room lookup fails, try direct museumId
          if (childRoom.museumId) {
            museum = await api<Museum>(`/museums/${childRoom.museumId}`).catch(
              () => null
            );
          }
        }
      } else if (childRoom.museumId) {
        // Direct museum attachment
        museum = await api<Museum>(`/museums/${childRoom.museumId}`).catch(
          () => null
        );
      }
      return {
        id: childRoom.id,
        name: childRoom.name,
        museum: museum?.name || null,
      };
    })
  );

  // Fetch museum information for artifacts
  const artifactsWithMuseums = await Promise.all(
    artifacts.map(async (artifact) => {
      let museum: Museum | null = null;
      if (artifact.roomId) {
        try {
          const artifactRoom = await api<Room>(`/rooms/${artifact.roomId}`);
          if (artifactRoom.museumId) {
            museum = await api<Museum>(
              `/museums/${artifactRoom.museumId}`
            ).catch(() => null);
          } else if (artifactRoom.parentRoomId) {
            // If artifact's room is a child room, get parent room's museum
            const parentRoom = await api<Room>(
              `/rooms/${artifactRoom.parentRoomId}`
            );
            if (parentRoom.museumId) {
              museum = await api<Museum>(
                `/museums/${parentRoom.museumId}`
              ).catch(() => null);
            }
          }
        } catch {
          // Failed to fetch room info
        }
      }
      return {
        id: artifact.id,
        name: artifact.name,
        museum: museum?.name || null,
      };
    })
  );

  // Fetch museum information for all artifacts (including from child rooms)
  const allArtifactsWithMuseums =
    childRooms.length > 0
      ? await Promise.all(
          allArtifacts.map(async (artifact) => {
            let museum: Museum | null = null;
            if (artifact.roomId) {
              try {
                const artifactRoom = await api<Room>(
                  `/rooms/${artifact.roomId}`
                );
                if (artifactRoom.museumId) {
                  museum = await api<Museum>(
                    `/museums/${artifactRoom.museumId}`
                  ).catch(() => null);
                } else if (artifactRoom.parentRoomId) {
                  // If artifact's room is a child room, get parent room's museum
                  const parentRoom = await api<Room>(
                    `/rooms/${artifactRoom.parentRoomId}`
                  );
                  if (parentRoom.museumId) {
                    museum = await api<Museum>(
                      `/museums/${parentRoom.museumId}`
                    ).catch(() => null);
                  }
                }
              } catch {
                // Failed to fetch room info
              }
            }
            return {
              id: artifact.id,
              name: artifact.name,
              museum: museum?.name || null,
            };
          })
        )
      : artifactsWithMuseums;

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
          knowledgeText: room.knowledgeText ?? null,
          furtherReading: room.furtherReading ?? [],
          type: 'room',
          parentId: room.museumId ?? null,
          parentRoomId: room.parentRoomId ?? null,
        }}
        parentMuseum={parentMuseum}
        parentRooms={availableParentRooms.map((r) => ({
          id: r.id,
          name: r.name,
          parentId: r.museumId ?? r.parentRoomId,
        }))}
        childRooms={childRoomsWithMuseums}
        childArtifacts={artifactsWithMuseums}
        allArtifacts={
          childRooms.length > 0 ? allArtifactsWithMuseums : undefined
        }
        museums={museums}
        onSave={handleSave}
      />
      <div className="flex justify-end pt-4">
        <DeleteEntityButton
          entityType="room"
          entityId={room.id}
          entityName={room.name}
          onDelete={deleteRoom}
        />
      </div>
    </AdminPageLayout>
  );
}
