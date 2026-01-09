'use server';

import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function deleteRoom(id: number) {
  const response = await fetch(`${API_URL}/rooms/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Failed to delete room' }));
    throw new Error(error.error || 'Failed to delete room');
  }

  redirect('/admin?tab=rooms');
}
