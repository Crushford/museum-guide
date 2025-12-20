'use server';

import { updateNode } from './edit/actions';
import { createChildNode } from './actions';

export async function updateNodeAction(nodeId: number, formData: FormData) {
  return updateNode(nodeId, formData);
}

export async function createChildNodeAction(
  parentId: number,
  childType: 'ROOM' | 'ARTIFACT',
  formData: FormData
) {
  return createChildNode(parentId, childType, formData);
}
