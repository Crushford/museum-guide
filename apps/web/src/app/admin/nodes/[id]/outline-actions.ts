'use server';

import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function saveOutline(nodeId: number, outlineJson: string) {
  let outline;
  try {
    outline = JSON.parse(outlineJson);
  } catch (error) {
    throw new Error('Invalid JSON format');
  }

  const response = await fetch(`${API_URL}/nodes/${nodeId}/outline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ outline }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save outline');
  }

  redirect(`/admin/nodes/${nodeId}`);
}
