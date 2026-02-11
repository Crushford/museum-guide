'use server';

import { redirect } from 'next/navigation';
import { apiMutate } from '@/lib/api';

type MuseumData = {
  name: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

export async function createMuseum(data: MuseumData) {
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
