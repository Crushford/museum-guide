export type NodeType = 'MUSEUM' | 'ROOM' | 'ARTIFACT';

export const nodeTypeToRoute: Record<
  NodeType,
  'museums' | 'rooms' | 'artifacts'
> = {
  MUSEUM: 'museums',
  ROOM: 'rooms',
  ARTIFACT: 'artifacts',
};

export function nodeEditHref(type: NodeType, id: number): string {
  return `/admin/${nodeTypeToRoute[type]}/${id}`;
}
