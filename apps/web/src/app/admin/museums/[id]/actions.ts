'use server';

import { deleteEntity } from '../../shared/actions';

export async function deleteMuseum(id: number) {
  return deleteEntity('museums', id);
}
