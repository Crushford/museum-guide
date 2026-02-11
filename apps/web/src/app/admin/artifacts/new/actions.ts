'use server';

import { redirect } from 'next/navigation';
import { API_URL, apiMutate } from '@/lib/api';

type ArtifactData = {
  type: 'ARTIFACT';
  name: string;
  parentId?: number;
  parentName?: string;
  museumId?: number;
  museumName?: string;
  knowledgeText?: string;
  furtherReading?: string[];
  newRoomParentType?: 'museum' | 'room';
  newRoomParentRoomId?: number;
};

export async function createArtifactWithRoom(data: ArtifactData) {
  // museumId is now required for artifacts
  if (!data.museumId || typeof data.museumId !== 'number') {
    throw new Error('museumId is required for artifacts');
  }

  let roomId: number | null = null;

  // If parentId is provided, use it directly
  if (data.parentId) {
    roomId = data.parentId;
  } else if (data.parentName) {
    // Need to find or create the room
    const museumId = data.museumId;

    // First, try to find existing room by name within the museum
    try {
      const roomsResponse = await fetch(`${API_URL}/museums/${museumId}/rooms`);
      if (roomsResponse.ok) {
        const rooms = await roomsResponse.json();
        const existingRoom = rooms.find(
          (r: { name: string; museumId: number | null }) =>
            r.name.toLowerCase() === data.parentName!.toLowerCase() &&
            r.museumId === museumId
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
      // Determine parent type for the new room
      const roomParentType = data.newRoomParentType || 'museum';
      const roomPayload: Record<string, unknown> = {
        name: data.parentName,
        knowledgeText: null,
        furtherReading: [],
      };

      if (roomParentType === 'museum') {
        roomPayload.museumId = museumId;
      } else if (roomParentType === 'room' && data.newRoomParentRoomId) {
        roomPayload.parentRoomId = data.newRoomParentRoomId;
      } else {
        // Default to museum if no parent room specified
        roomPayload.museumId = museumId;
      }

      const newRoom = await apiMutate<{ id: number; parentId: number }>(
        '/rooms',
        {
          method: 'POST',
          body: roomPayload,
        }
      );
      roomId = newRoom.id;

      // Verify the room was created with the correct parentId
      if (newRoom.parentId !== museumId) {
        console.warn(
          `Room created with parentId ${newRoom.parentId}, expected ${museumId}`
        );
      }
    }
  }
  // Now create the artifact
  const artifact = await apiMutate<{ id: number }>('/artifacts', {
    method: 'POST',
    body: {
      name: data.name,
      museumId: data.museumId,
      roomId: roomId || null,
      knowledgeText: data.knowledgeText || null,
      furtherReading: data.furtherReading || [],
    },
  });

  redirect(`/admin/artifacts/${artifact.id}`);
}
