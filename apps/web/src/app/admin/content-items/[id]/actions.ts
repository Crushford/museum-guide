'use server';

import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

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
    redirect(`/admin/nodes/${returnTo}`);
  } else {
    redirect(`/admin/content-items/${id}`);
  }
}
