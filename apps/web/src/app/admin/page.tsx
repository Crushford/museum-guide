import Link from 'next/link';
import { api } from '../../lib/api';
import { createMuseum } from './nodes/new/actions';
import { NodeForm } from './components/NodeForm';

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  knowledgeText: string | null;
  furtherReading: string[];
};

export default async function AdminPage() {
  const museums = await api<Node[]>('/nodes/museums');

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Admin - Museums</h1>
        <Link href="/" className="text-blue-600 underline mb-4 inline-block">
          ← Back to public site
        </Link>
      </div>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Museums</h2>
        {museums.length === 0 ? (
          <p className="text-gray-600">No museums yet. Create one below.</p>
        ) : (
          <ul className="space-y-2">
            {museums.map((museum) => (
              <li key={museum.id}>
                <Link
                  href={`/admin/nodes/${museum.id}`}
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  {museum.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Add Museum</h2>
        <NodeForm submitLabel="Create Museum" action={createMuseum} />
      </section>
    </main>
  );
}
