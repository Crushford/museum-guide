'use server';

import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type RoomData = {
  name: string;
  museumId?: number;
  parentRoomId?: number;
  knowledgeText?: string;
  furtherReading?: string[];
};

export async function createRoom(data: RoomData) {
  const body: Record<string, unknown> = {
    name: data.name,
    knowledgeText: data.knowledgeText || null,
    furtherReading: data.furtherReading || [],
  };

  if (data.museumId) {
    body.museumId = data.museumId;
  } else if (data.parentRoomId) {
    body.parentRoomId = data.parentRoomId;
  }

  const response = await fetch(`${API_URL}/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create room');
  }

  const room = await response.json();
  redirect(`/admin/rooms/${room.id}`);
}
