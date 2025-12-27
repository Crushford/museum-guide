'use server';

import { redirect } from 'next/navigation';
import { nodeEditHref, type NodeType } from './nodeRoutes';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function updateNode(
  id: number,
  type: NodeType,
  data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }
) {
  const response = await fetch(`${API_URL}/nodes/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: data.name,
      parentId: data.parentId,
      knowledgeText: data.knowledgeText,
      furtherReading: data.furtherReading,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update node');
  }

  // Use the type we already have - no need to fetch again
  redirect(nodeEditHref(type, id));
}

// Individual field update functions (no redirect, for inline editing)
export async function updateNodeField(
  id: number,
  field: 'name' | 'knowledgeText' | 'furtherReading' | 'parentId',
  value: string | string[] | number | null
) {
  const updateData: {
    name?: string;
    knowledgeText?: string | null;
    furtherReading?: string[];
    parentId?: number | null;
  } = {};

  if (field === 'name') {
    updateData.name = value as string;
  } else if (field === 'knowledgeText') {
    updateData.knowledgeText = value as string | null;
  } else if (field === 'furtherReading') {
    updateData.furtherReading = value as string[];
  } else if (field === 'parentId') {
    updateData.parentId = value as number | null;
  }

  const response = await fetch(`${API_URL}/nodes/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updateData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to update ${field}`);
  }

  return response.json();
}
