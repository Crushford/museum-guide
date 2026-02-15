'use server';

import { redirect } from 'next/navigation';
import { authedApiMutate } from '@/lib/api';

export async function updateMuseum(
  token: string,
  id: number,
  data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }
) {
  await authedApiMutate(
    `/nodes/${id}`,
    {
      method: 'PATCH',
      body: {
        name: data.name,
        parentId: data.parentId,
        knowledgeText: data.knowledgeText,
        furtherReading: data.furtherReading,
      },
    },
    token
  );

  redirect(`/admin/museums/${id}`);
}

export async function updateRoom(
  token: string,
  id: number,
  data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }
) {
  await authedApiMutate(
    `/nodes/${id}`,
    {
      method: 'PATCH',
      body: {
        name: data.name,
        parentId: data.parentId,
        knowledgeText: data.knowledgeText,
        furtherReading: data.furtherReading,
      },
    },
    token
  );

  redirect(`/admin/rooms/${id}`);
}

export async function updateArtifact(
  token: string,
  id: number,
  data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }
) {
  await authedApiMutate(
    `/nodes/${id}`,
    {
      method: 'PATCH',
      body: {
        name: data.name,
        parentId: data.parentId,
        knowledgeText: data.knowledgeText,
        furtherReading: data.furtherReading,
      },
    },
    token
  );

  redirect(`/admin/artifacts/${id}`);
}

// Individual field update functions (no redirect, for inline editing)
export async function updateNodeField(
  token: string,
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

  return authedApiMutate(
    `/nodes/${id}`,
    { method: 'PATCH', body: updateData },
    token
  );
}

// Update room parent relationship (museumId or parentRoomId)
export async function updateRoomParent(
  token: string,
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

  return authedApiMutate(
    `/rooms/${id}`,
    { method: 'PATCH', body: updateData },
    token
  );
}

export async function deleteEntity(
  token: string,
  type: 'museums' | 'rooms' | 'artifacts',
  id: number
) {
  await authedApiMutate(`/${type}/${id}`, { method: 'DELETE' }, token);
  redirect(`/admin?tab=${type}`);
}
