import Link from 'next/link';
import type { Metadata } from 'next';
import { api } from '../../../lib/api';
import { notFound } from 'next/navigation';

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  parentId: number | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ museum: string; room: string }>;
}): Promise<Metadata> {
  const { museum: museumId, room: roomId } = await params;
  const museumNodeId = Number(museumId);
  const roomNodeId = Number(roomId);

  try {
    const [roomNode, museumNode] = await Promise.all([
      api<Node>(`/nodes/${roomNodeId}`),
      api<Node>(`/nodes/${museumNodeId}`),
    ]);

    if (
      roomNode &&
      roomNode.type === 'ROOM' &&
      museumNode &&
      museumNode.type === 'MUSEUM' &&
      roomNode.parentId === museumNodeId
    ) {
      return {
        title: `${museumNode.name} - ${roomNode.name}`,
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    title: 'Room',
  };
}

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

export default async function RoomPage({
  params,
}: {
  params: Promise<{ museum: string; room: string }>;
}) {
  const { museum: museumId, room: roomId } = await params;
  const museumNodeId = Number(museumId);
  const roomNodeId = Number(roomId);

  const [roomNode, playlist, artifacts] = await Promise.all([
    api<Node>(`/nodes/${roomNodeId}`).catch(() => null),
    api<PlaylistResponse>(`/nodes/${roomNodeId}/playlist`).catch(() => ({
      node: { id: roomNodeId, type: '', name: '' },
      roles: {},
    })),
    api<Node[]>(`/nodes/${roomNodeId}/children`).catch(() => []),
  ]);

  // Validate node type and parent
  if (
    !roomNode ||
    roomNode.type !== 'ROOM' ||
    roomNode.parentId !== museumNodeId
  ) {
    notFound();
  }

  const roomBrief = playlist.roles.roomBrief?.[0];
  const followups = playlist.roles.followup?.slice(0, 3) || [];

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/${museumId}`}
          className="text-blue-600 underline mb-2 inline-block"
        >
          ← Back to museum
        </Link>
        <h1 className="text-3xl font-bold">{roomNode.name}</h1>
      </div>

      {roomBrief && roomBrief.contentItem.body.trim() && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Room in Brief</h2>
          <div className="prose max-w-none">
            <p className="text-lg leading-relaxed">
              {roomBrief.contentItem.body}
            </p>
          </div>
        </section>
      )}

      {artifacts.length > 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Artifacts</h2>
          <ul className="space-y-3">
            {artifacts.map((artifact) => (
              <li key={artifact.id}>
                <Link
                  className="text-blue-600 underline hover:text-blue-800 text-lg"
                  href={`/${museumId}/${roomId}/${artifact.id}`}
                >
                  {artifact.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {followups.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Learn More</h2>
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
