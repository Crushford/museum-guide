'use server';

import { redirect } from 'next/navigation';
import { authedApiMutate } from '@/lib/api';
import { MuseumInput } from '@/lib/types';

export async function createMuseum(token: string, data: MuseumInput) {
  const museum = await authedApiMutate<{ id: number }>(
    '/museums',
    {
      method: 'POST',
      body: {
        name: data.name,
        knowledgeText: data.knowledgeText || null,
        furtherReading: data.furtherReading || [],
      },
    },
    token
  );

  redirect(`/admin/museums/${museum.id}`);
}
