import Link from 'next/link';
import { api } from '../lib/api';

type Museum = {
  id: number;
  name: string;
};

export default async function Home() {
  const museums = await api<Museum[]>('/museums');

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Museums</h1>
        <Link
          href="/admin"
          className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-2 transition-colors"
        >
          Admin
        </Link>
      </div>
      <ul className="space-y-2">
        {museums.map((museum) => (
          <li key={museum.id}>
            <Link className="text-blue-600 underline" href={`/${museum.id}`}>
              {museum.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
