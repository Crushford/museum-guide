'use server';

import { deleteEntity } from '../../shared/actions';

export async function deleteRoom(id: number) {
  return deleteEntity('rooms', id);
}
