'use server';

import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
};

export async function updateContentItemBody(
  id: number,
  body: string,
  returnTo?: string
) {
  const response = await fetch(`${API_URL}/content-items/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update content item');
  }

  if (returnTo) {
    // Fetch the node to determine its type and redirect to the appropriate route
    try {
      const nodeResponse = await fetch(`${API_URL}/nodes/${returnTo}`, {
        cache: 'no-store',
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
