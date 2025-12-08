import Link from 'next/link';
import { api } from '../../../lib/api';

type Content = { id: number; text: string };
type Artifact = { id: number; name: string };

export default async function RoomPage({
  params,
}: {
  params: Promise<{ museum: string; room: string }>;
}) {
  const { museum: museumId, room: roomId } = await params;
  const content = await api<Content[]>(`/rooms/${roomId}/content`);

  // Artifacts endpoint doesn't exist in backend - show empty list
  const artifacts: Artifact[] = [];

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        Museum {museumId} – Room {roomId}
      </h1>
      <section className="mb-8">
        {content.map((c) => (
          <p key={c.id} className="mb-2">
            {c.text}
          </p>
        ))}
      </section>
      <section>
        <h2 className="font-semibold mb-2">Artifacts</h2>
        <ul className="space-y-2">
          {artifacts.map((a) => (
            <li key={a.id}>
              <Link
                className="text-blue-600 underline"
                href={`/${museumId}/${roomId}/${a.id}`}
              >
                {a.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
