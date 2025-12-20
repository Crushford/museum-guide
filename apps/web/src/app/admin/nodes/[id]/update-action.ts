'use server';

import { updateNode } from './edit/actions';

export function createUpdateAction(nodeId: number) {
  return async (formData: FormData) => {
    return updateNode(nodeId, formData);
  };
}
