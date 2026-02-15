'use server';

import { deleteEntity } from '../../shared/actions';

export async function deleteArtifact(token: string, id: number) {
  return deleteEntity(token, 'artifacts', id);
}
