'use server';

import { redirect } from 'next/navigation';
import { nodeEditHref } from '../../shared/nodeRoutes';

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

  // API response includes node type, use it directly
  const nodeResponse = await fetch(`${API_URL}/nodes/${nodeId}`, {
    cache: 'no-store',
  });
  if (nodeResponse.ok) {
    const node = await nodeResponse.json();
    redirect(nodeEditHref(node.type, nodeId));
  } else {
    redirect('/admin');
  }
}
