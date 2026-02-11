'use server';

import { redirect } from 'next/navigation';
import { apiMutate } from '@/lib/api';
import { MuseumInput } from '@/lib/types';

export async function createMuseum(data: MuseumInput) {
  const museum = await apiMutate<{ id: number }>('/museums', {
    method: 'POST',
    body: {
      name: data.name,
      knowledgeText: data.knowledgeText || null,
      furtherReading: data.furtherReading || [],
    },
  });

  redirect(`/admin/museums/${museum.id}`);
}
