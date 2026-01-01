'use server';

import { redirect } from 'next/navigation';
import { nodeEditHref } from '../../shared/nodeRoutes';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type ArtifactData = {
  type: 'ARTIFACT';
  name: string;
  parentId?: number;
  parentName?: string;
  museumId?: number;
  museumName?: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

export async function createArtifactWithRoom(
  data: ArtifactData,
  defaultMuseumId: number
) {
  let roomId: number | null = null;

  // If parentId is provided, use it directly
  if (data.parentId) {
    roomId = data.parentId;
  } else if (data.parentName) {
    // Need to find or create the room
    const museumId = data.museumId || defaultMuseumId;

    if (!museumId) {
      throw new Error(
        'museumId is required when using parentName for room creation'
      );
    }

    // First, try to find existing room by name within the museum
    try {
      const roomsResponse = await fetch(
        `${API_URL}/admin/nodes/rooms?museumId=${museumId}`
      );
      if (roomsResponse.ok) {
        const rooms = await roomsResponse.json();
        const existingRoom = rooms.find(
          (r: { name: string }) =>
            r.name.toLowerCase() === data.parentName!.toLowerCase()
        );
        if (existingRoom) {
          roomId = existingRoom.id;
        }
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }

    // If room doesn't exist, create it
    if (!roomId) {
      const createRoomResponse = await fetch(`${API_URL}/nodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'ROOM',
          name: data.parentName,
          parentId: museumId,
        }),
      });

      if (!createRoomResponse.ok) {
        const error = await createRoomResponse.json();
        throw new Error(
          error.error || `Failed to create room "${data.parentName}"`
        );
      }

      const newRoom = await createRoomResponse.json();
      roomId = newRoom.id;
    }
  } else {
    throw new Error('Either parentId or parentName must be provided');
  }

  if (!roomId) {
    throw new Error('Failed to determine room ID');
  }

  // Now create the artifact
  const response = await fetch(`${API_URL}/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'ARTIFACT',
      name: data.name,
      parentId: roomId,
      knowledgeText: data.knowledgeText || null,
      furtherReading: data.furtherReading || [],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create artifact');
  }

  const artifact = await response.json();
  redirect(nodeEditHref('ARTIFACT', artifact.id));
}
