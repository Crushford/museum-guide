'use server';

import { deleteEntity } from '../../shared/actions';

export async function deleteRoom(token: string, id: number) {
  return deleteEntity(token, 'rooms', id);
}
