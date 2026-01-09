'use server';

import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type MuseumData = {
  name: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

export async function createMuseum(data: MuseumData) {
  const response = await fetch(`${API_URL}/museums`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: data.name,
      knowledgeText: data.knowledgeText || null,
      furtherReading: data.furtherReading || [],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create museum');
  }

  const museum = await response.json();
  redirect(`/admin/museums/${museum.id}`);
}
