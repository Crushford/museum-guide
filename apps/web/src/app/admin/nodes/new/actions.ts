'use server';

import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type NodeData = {
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  parentId?: number;
  parentName?: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

export async function createNode(data: NodeData) {
  const response = await fetch(`${API_URL}/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: data.type,
      name: data.name,
      parentId: data.parentId || null,
      knowledgeText: data.knowledgeText || null,
      furtherReading: data.furtherReading || [],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      error.error || `Failed to create ${data.type.toLowerCase()}`
    );
  }

  const node = await response.json();
  redirect(`/admin/nodes/${node.id}`);
}

export async function createMuseum(formData: FormData) {
  const name = formData.get('name') as string;
  const knowledgeText = formData.get('knowledgeText') as string | null;
  const furtherReadingText = formData.get('furtherReading') as string | null;

  // Convert furtherReading textarea to string array
  const furtherReading = furtherReadingText
    ? furtherReadingText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    : [];

  const response = await fetch(`${API_URL}/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'MUSEUM',
      name,
      parentId: null,
      knowledgeText: knowledgeText || null,
      furtherReading,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create museum');
  }

  const node = await response.json();
  redirect(`/admin/nodes/${node.id}`);
}
