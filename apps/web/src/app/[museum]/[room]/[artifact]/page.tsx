import { api } from '../../../../lib/api';

type Content = { id: number; text: string };

export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ artifact: string }>;
}) {
  const { artifact: artifactId } = await params;
  const content = await api<Content[]>(`/artifacts/${artifactId}/content`);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Artifact {artifactId}</h1>
      {content.map((c) => (
        <p key={c.id} className="mb-2">
          {c.text}
        </p>
      ))}
    </main>
  );
}
