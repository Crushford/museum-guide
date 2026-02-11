'use server';

import { redirect } from 'next/navigation';
import { apiMutate } from '@/lib/api';
import { RoomCreateInput } from '@/lib/types';

export async function createRoom(data: RoomCreateInput) {
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
