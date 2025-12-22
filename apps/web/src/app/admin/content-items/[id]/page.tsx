import Link from 'next/link';
import { api } from '../../../../lib/api';
import { updateContentItemBody } from './actions';

type ContentItem = {
  id: number;
  nodeId: number | null;
  type: string;
  title: string;
  body: string;
  audioUrl: string | null;
  outlineKey: string | null;
  nodeContents: Array<{
    id: number;
    role: string;
    sortOrder: number;
    node: {
      id: number;
      type: string;
      name: string;
    };
  }>;
};

export default async function ContentItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const contentItemId = Number(id);

  const contentItem = await api<ContentItem>(`/content-items/${contentItemId}`);

  async function saveBodyAction(formData: FormData) {
    'use server';
    const body = formData.get('body') as string;
    return updateContentItemBody(contentItemId, body, returnTo);
  }

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        {returnTo ? (
          <Link
            href={`/admin/nodes/${returnTo}`}
            className="text-blue-600 underline mb-4 inline-block"
          >
            ← Back to node admin
          </Link>
        ) : (
          <Link
            href="/admin"
            className="text-blue-600 underline mb-4 inline-block"
          >
            ← Back to admin home
          </Link>
        )}
        <h1 className="text-3xl font-bold mb-2">{contentItem.title}</h1>
        <div className="text-sm text-gray-600 space-y-1">
          <div>Type: {contentItem.type}</div>
          {contentItem.outlineKey && (
            <div>Outline Key: {contentItem.outlineKey}</div>
          )}
          {contentItem.audioUrl && (
            <div>
              Audio:{' '}
              <a
                href={contentItem.audioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                {contentItem.audioUrl}
              </a>
            </div>
          )}
        </div>
      </div>

      {contentItem.nodeContents.length > 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Used In</h2>
          <ul className="space-y-2">
            {contentItem.nodeContents.map((nc) => (
              <li key={nc.id}>
                <Link
                  href={`/admin/nodes/${nc.node.id}`}
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  {nc.node.type} - {nc.node.name}
                </Link>
                <span className="text-gray-600 ml-2">
                  (role: {nc.role}, order: {nc.sortOrder})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Generated Content Text</h2>
        <form action={saveBodyAction} className="space-y-4">
          <div>
            <label htmlFor="body" className="block text-sm font-medium mb-1">
              Paste generated text here
            </label>
            <textarea
              id="body"
              name="body"
              rows={12}
              defaultValue={contentItem.body}
              placeholder="Paste the generated text from ChatGPT here..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>
          <div className="flex gap-4">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Save Text
            </button>
            {contentItem.body.trim() && (
              <div className="flex items-center text-sm text-green-600">
                ✓ Text saved ({contentItem.body.length} characters)
              </div>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
