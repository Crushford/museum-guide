import { prisma } from '@repo/db';
import type { Prisma } from '@repo/db';

export async function getDescendantRoomIds(
  parentId: number
): Promise<number[]> {
  const children = await prisma.room.findMany({
    where: { parentRoomId: parentId } as Prisma.RoomWhereInput,
    select: { id: true },
  });

  const childIds = children.map((child) => child.id);
  const allDescendantIds = [...childIds];

  for (const childId of childIds) {
    const grandChildIds = await getDescendantRoomIds(childId);
    allDescendantIds.push(...grandChildIds);
  }

  return allDescendantIds;
}
