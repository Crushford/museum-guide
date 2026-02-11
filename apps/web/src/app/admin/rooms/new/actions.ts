'use server';

import { redirect } from 'next/navigation';
import { apiMutate } from '@/lib/api';

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

  const room = await apiMutate<{ id: number }>('/rooms', {
    method: 'POST',
    body,
  });

  redirect(`/admin/rooms/${room.id}`);
}
