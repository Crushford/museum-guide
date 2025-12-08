import Link from 'next/link';
import { api } from '../../lib/api';

type Content = { id: number; text: string; type?: string };
type Room = { id: number; name: string };

export default async function MuseumPage({
  params,
}: {
  params: Promise<{ museum: string }>;
}) {
  const { museum: museumId } = await params;
  const [content, rooms] = await Promise.all([
    api<Content[]>(`/museums/${museumId}/content`),
    api<Room[]>(`/museums/${museumId}/rooms`),
  ]);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Museum {museumId}</h1>
      <section className="mb-8">
        <h2 className="font-semibold mb-2">About</h2>
        {content.map((c) => (
          <p key={c.id} className="mb-2">
            {c.text}
          </p>
        ))}
      </section>
      <section>
        <h2 className="font-semibold mb-2">Rooms</h2>
        <ul className="space-y-2">
          {rooms.map((room) => (
            <li key={room.id}>
              <Link
                className="text-blue-600 underline"
                href={`/${museumId}/${room.id}`}
              >
                {room.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
