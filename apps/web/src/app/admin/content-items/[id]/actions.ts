'use server';

import { redirect } from 'next/navigation';
import { API_URL, authedApiMutate } from '@/lib/api';

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
};

export async function updateContentItemBody(
  token: string,
  id: number,
  body: string,
  returnTo?: string
) {
  await authedApiMutate(
    `/content-items/${id}`,
    {
      method: 'PATCH',
      body: { body },
    },
    token
  );

  if (returnTo) {
    // Fetch the node to determine its type and redirect to the appropriate route
    try {
      const nodeResponse = await fetch(`${API_URL}/nodes/${returnTo}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (nodeResponse.ok) {
        const node: Node = await nodeResponse.json();
        if (node.type === 'MUSEUM') {
          redirect(`/admin/museums/${returnTo}`);
        } else if (node.type === 'ROOM') {
          redirect(`/admin/rooms/${returnTo}`);
        } else if (node.type === 'ARTIFACT') {
          redirect(`/admin/artifacts/${returnTo}`);
        } else {
          redirect('/admin');
        }
      } else {
        redirect('/admin');
      }
    } catch {
      redirect('/admin');
    }
  } else {
    redirect(`/admin/content-items/${id}`);
  }
}
