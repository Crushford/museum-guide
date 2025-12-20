'use server';

import { createChildNode } from './actions';

export function createChildAction(
  parentId: number,
  childType: 'ROOM' | 'ARTIFACT'
) {
  return async (formData: FormData) => {
    return createChildNode(parentId, childType, formData);
  };
}
