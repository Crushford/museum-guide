import Link from 'next/link';
import { api } from '../../../../lib/api';
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

export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ museum: string; room: string; artifact: string }>;
}) {
  const { museum: museumId, room: roomId, artifact: artifactId } = await params;
  const museumNodeId = Number(museumId);
  const roomNodeId = Number(roomId);
  const artifactNodeId = Number(artifactId);

  const [artifactNode, playlist] = await Promise.all([
    api<Node>(`/nodes/${artifactNodeId}`).catch(() => null),
    api<PlaylistResponse>(`/nodes/${artifactNodeId}/playlist`).catch(() => ({
      node: { id: artifactNodeId, type: '', name: '' },
      roles: {},
    })),
  ]);

  // Validate node type and parent chain
  if (
    !artifactNode ||
    artifactNode.type !== 'ARTIFACT' ||
    artifactNode.parentId !== roomNodeId
  ) {
    notFound();
  }

  // Verify parent chain
  const roomNode = await api<Node>(`/nodes/${roomNodeId}`).catch(() => null);
  if (!roomNode || roomNode.parentId !== museumNodeId) {
    notFound();
  }

  const artifactMain = playlist.roles.artifactMain?.[0];
  const qaItems = playlist.roles.qa?.slice(0, 3) || [];
  const followups = playlist.roles.followup?.slice(0, 3) || [];

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/${museumId}/${roomId}`}
          className="text-blue-600 underline mb-2 inline-block"
        >
          ← Back to room
        </Link>
        <h1 className="text-3xl font-bold">{artifactNode.name}</h1>
      </div>

      {artifactMain && artifactMain.contentItem.body.trim() && (
        <section className="mb-8">
          <div className="prose max-w-none">
            <p className="text-lg leading-relaxed">
              {artifactMain.contentItem.body}
            </p>
          </div>
        </section>
      )}

      {qaItems.length > 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Common Questions</h2>
          <ul className="space-y-4">
            {qaItems.map((qa) => {
              if (!qa.contentItem.body.trim()) return null;
              return (
                <li key={qa.id}>
                  <div className="prose max-w-none">
                    <h3 className="text-lg font-medium mb-2">
                      {qa.contentItem.title}
                    </h3>
                    <p className="text-gray-700">{qa.contentItem.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {followups.length > 0 && qaItems.length === 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Learn More</h2>
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
