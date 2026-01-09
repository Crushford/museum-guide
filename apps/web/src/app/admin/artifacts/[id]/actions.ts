'use server';

import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function deleteArtifact(id: number) {
  const response = await fetch(`${API_URL}/artifacts/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Failed to delete artifact' }));
    throw new Error(error.error || 'Failed to delete artifact');
  }

  redirect('/admin?tab=artifacts');
}
