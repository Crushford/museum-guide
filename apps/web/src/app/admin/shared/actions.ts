'use server';

import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function updateMuseum(
  id: number,
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
    throw new Error(error.error || 'Failed to update museum');
  }

  redirect(`/admin/museums/${id}`);
}

export async function updateRoom(
  id: number,
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
    throw new Error(error.error || 'Failed to update room');
  }

  redirect(`/admin/rooms/${id}`);
}

export async function updateArtifact(
  id: number,
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
    throw new Error(error.error || 'Failed to update artifact');
  }

  redirect(`/admin/artifacts/${id}`);
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

// Update room parent relationship (museumId or parentRoomId)
export async function updateRoomParent(
  id: number,
  museumId: number | null,
  parentRoomId: number | null
) {
  const updateData: {
    museumId?: number | null;
    parentRoomId?: number | null;
  } = {};

  if (museumId !== null) {
    updateData.museumId = museumId;
    updateData.parentRoomId = null; // Clear parentRoomId when setting museumId
  } else if (parentRoomId !== null) {
    updateData.parentRoomId = parentRoomId;
    updateData.museumId = null; // Clear museumId when setting parentRoomId
  } else {
    // Both are null - clear both
    updateData.museumId = null;
    updateData.parentRoomId = null;
  }

  const response = await fetch(`${API_URL}/rooms/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updateData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update room parent');
  }

  return response.json();
}
