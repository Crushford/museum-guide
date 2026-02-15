'use server';

import { redirect } from 'next/navigation';
import { authedApiMutate } from '@/lib/api';
import { RoomCreateInput } from '@/lib/types';

export async function createRoom(token: string, data: RoomCreateInput) {
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

  const room = await authedApiMutate<{ id: number }>(
    '/rooms',
    {
      method: 'POST',
      body,
    },
    token
  );

  redirect(`/admin/rooms/${room.id}`);
}
