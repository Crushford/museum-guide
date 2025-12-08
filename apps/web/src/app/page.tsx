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
      <h1 className="text-2xl font-bold mb-4">Museums</h1>
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
