import Link from 'next/link';
import { api } from '../../lib/api';
import { notFound } from 'next/navigation';

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  parentId: number | null;
};

type PlaylistResponse = {
  node: { id: number; type: string; name: string };
  roles: Record<
    string,
    Array<{
      id: number;
      sortOrder: number;
      contentItem: {
        id: number;
        title: string;
        type: string;
        body: string;
      };
    }>
  >;
};

export default async function MuseumPage({
  params,
}: {
  params: Promise<{ museum: string }>;
}) {
  const { museum: museumId } = await params;
  const nodeId = Number(museumId);

  const [node, playlist, rooms] = await Promise.all([
    api<Node>(`/nodes/${nodeId}`).catch(() => null),
    api<PlaylistResponse>(`/nodes/${nodeId}/playlist`).catch(() => ({
      node: { id: nodeId, type: '', name: '' },
      roles: {},
    })),
    api<Node[]>(`/nodes/${nodeId}/children`).catch(() => []),
  ]);

  // Validate node type
  if (!node || node.type !== 'MUSEUM') {
    notFound();
  }

  const intro = playlist.roles.intro?.[0];
  const followups = playlist.roles.followup?.slice(0, 3) || [];

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">{node.name}</h1>

      {intro && intro.contentItem.body.trim() && (
        <section className="mb-8">
          <div className="prose max-w-none">
            <p className="text-lg leading-relaxed">{intro.contentItem.body}</p>
          </div>
        </section>
      )}

      {rooms.length > 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">In This Museum</h2>
          <ul className="space-y-3">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  className="text-blue-600 underline hover:text-blue-800 text-lg"
                  href={`/${museumId}/${room.id}`}
                >
                  {room.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {followups.length > 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Explore Next</h2>
          <ul className="space-y-4">
            {followups.map((followup) => {
              if (!followup.contentItem.body.trim()) return null;
              return (
                <li key={followup.id}>
                  <div className="prose max-w-none">
                    <h3 className="text-lg font-medium mb-2">
                      {followup.contentItem.title}
                    </h3>
                    <p className="text-gray-700">{followup.contentItem.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
