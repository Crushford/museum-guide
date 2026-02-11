'use server';

import { redirect } from 'next/navigation';
import { apiMutate } from '@/lib/api';

export async function updateMuseum(
  id: number,
  data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }
) {
  await apiMutate(`/nodes/${id}`, {
    method: 'PATCH',
    body: {
      name: data.name,
      parentId: data.parentId,
      knowledgeText: data.knowledgeText,
      furtherReading: data.furtherReading,
    },
  });

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
  await apiMutate(`/nodes/${id}`, {
    method: 'PATCH',
    body: {
      name: data.name,
      parentId: data.parentId,
      knowledgeText: data.knowledgeText,
      furtherReading: data.furtherReading,
    },
  });

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
  await apiMutate(`/nodes/${id}`, {
    method: 'PATCH',
    body: {
      name: data.name,
      parentId: data.parentId,
      knowledgeText: data.knowledgeText,
      furtherReading: data.furtherReading,
    },
  });

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

  return apiMutate(`/nodes/${id}`, { method: 'PATCH', body: updateData });
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

  return apiMutate(`/rooms/${id}`, { method: 'PATCH', body: updateData });
}

export async function deleteEntity(
  type: 'museums' | 'rooms' | 'artifacts',
  id: number
) {
  await apiMutate(`/${type}/${id}`, { method: 'DELETE' });
  redirect(`/admin?tab=${type}`);
}
