'use server';

import { redirect } from 'next/navigation';
import { API_URL, authedApiMutate } from '@/lib/api';
import { ArtifactCreateInput } from '@/lib/types';

export async function createArtifactWithRoom(
  token: string,
  data: ArtifactCreateInput
) {
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

      const newRoom = await authedApiMutate<{ id: number; parentId: number }>(
        '/rooms',
        {
          method: 'POST',
          body: roomPayload,
        },
        token
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
  const artifact = await authedApiMutate<{ id: number }>(
    '/artifacts',
    {
      method: 'POST',
      body: {
        name: data.name,
        museumId: data.museumId,
        roomId: roomId || null,
        knowledgeText: data.knowledgeText || null,
        furtherReading: data.furtherReading || [],
      },
    },
    token
  );

  redirect(`/admin/artifacts/${artifact.id}`);
}
