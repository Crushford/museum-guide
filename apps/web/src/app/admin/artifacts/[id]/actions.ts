'use server';

import { deleteEntity } from '../../shared/actions';

export async function deleteArtifact(id: number) {
  return deleteEntity('artifacts', id);
}
