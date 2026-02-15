'use server';

import { deleteEntity } from '../../shared/actions';

export async function deleteMuseum(token: string, id: number) {
  return deleteEntity(token, 'museums', id);
}
