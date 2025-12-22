import Link from 'next/link';
import { api } from '../../../../lib/api';
import { updateNode } from './edit/actions';
import { createChildNode } from './actions';
import { saveOutline } from './outline-actions';

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
  name: string;
  parentId: number | null;
  knowledgeText: string | null;
  furtherReading: string[];
  outline: any;
  outlineUpdatedAt: string | null;
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
        audioUrl: string | null;
      };
    }>
  >;
};

export default async function NodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nodeId = Number(id);

  const [node, children, playlist] = await Promise.all([
    api<Node>(`/nodes/${nodeId}`),
    api<Node[]>(`/nodes/${nodeId}/children`),
    api<PlaylistResponse>(`/nodes/${nodeId}/playlist`).catch(() => ({
      node: { id: nodeId, type: '', name: '' },
      roles: {},
    })),
  ]);

  const canAddChild = node.type === 'MUSEUM' || node.type === 'ROOM';
  const childType = node.type === 'MUSEUM' ? 'ROOM' : 'ARTIFACT';
  const childLabel = node.type === 'MUSEUM' ? 'Room' : 'Artifact';

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-blue-600 underline mb-4 inline-block"
        >
          ← Back to admin home
        </Link>
        <h1 className="text-3xl font-bold mb-2">
          {node.type} - {node.name}
        </h1>
      </div>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Edit Node</h2>
        <form action={updateNode.bind(null, nodeId)} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={node.name}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label
              htmlFor="knowledgeText"
              className="block text-sm font-medium mb-1"
            >
              Knowledge Text
            </label>
            <textarea
              id="knowledgeText"
              name="knowledgeText"
              rows={4}
              defaultValue={node.knowledgeText || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label
              htmlFor="furtherReading"
              className="block text-sm font-medium mb-1"
            >
              Further Reading (one URL per line)
            </label>
            <textarea
              id="furtherReading"
              name="furtherReading"
              rows={4}
              defaultValue={node.furtherReading.join('\n')}
              placeholder="https://example.com/article1&#10;https://example.com/article2"
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Update Node
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Knowledge Text</h2>
        {node.knowledgeText ? (
          <p className="text-gray-700 whitespace-pre-wrap">
            {node.knowledgeText}
          </p>
        ) : (
          <p className="text-gray-500 italic">No knowledge text set.</p>
        )}
      </section>

      {node.furtherReading.length > 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Further Reading</h2>
          <ul className="space-y-2">
            {node.furtherReading.map((url, index) => (
              <li key={index}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canAddChild && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Children ({childLabel}s)
          </h2>
          {children.length === 0 ? (
            <p className="text-gray-600 mb-4">
              No {childLabel.toLowerCase()}s yet.
            </p>
          ) : (
            <ul className="space-y-2 mb-4">
              {children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/admin/nodes/${child.id}`}
                    className="text-blue-600 underline hover:text-blue-800"
                  >
                    {child.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <h3 className="text-xl font-semibold mb-4">Add {childLabel}</h3>
            <form
              action={createChildNode.bind(null, nodeId, childType)}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="child-name"
                  className="block text-sm font-medium mb-1"
                >
                  Name *
                </label>
                <input
                  type="text"
                  id="child-name"
                  name="name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label
                  htmlFor="child-knowledgeText"
                  className="block text-sm font-medium mb-1"
                >
                  Knowledge Text
                </label>
                <textarea
                  id="child-knowledgeText"
                  name="knowledgeText"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label
                  htmlFor="child-furtherReading"
                  className="block text-sm font-medium mb-1"
                >
                  Further Reading (one URL per line)
                </label>
                <textarea
                  id="child-furtherReading"
                  name="furtherReading"
                  rows={4}
                  placeholder="https://example.com/article1&#10;https://example.com/article2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                />
              </div>

              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Create {childLabel}
              </button>
            </form>
          </div>
        </section>
      )}

      {node.type === 'ARTIFACT' && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Children</h2>
          <p className="text-gray-600">Artifacts have no children.</p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Outline</h2>
        {node.outlineUpdatedAt && (
          <p className="text-sm text-gray-600 mb-4">
            Last updated: {new Date(node.outlineUpdatedAt).toLocaleString()}
          </p>
        )}
        <form
          action={async (formData: FormData) => {
            'use server';
            const outlineJson = formData.get('outline') as string;
            return saveOutline(nodeId, outlineJson);
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="outline" className="block text-sm font-medium mb-1">
              Paste Outline JSON
            </label>
            <textarea
              id="outline"
              name="outline"
              rows={12}
              defaultValue={
                node.outline ? JSON.stringify(node.outline, null, 2) : ''
              }
              placeholder='{"roles": {"intro": [{"key": "museum-intro", "title": "Welcome", "contentType": "intro"}]}}'
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Save Outline
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Playlist Preview</h2>
        {Object.keys(playlist.roles).length === 0 ? (
          <p className="text-gray-600">
            No placements yet. Add an outline above.
          </p>
        ) : (
          <div className="space-y-6">
            {Object.entries(playlist.roles).map(([role, placements]) => (
              <div key={role}>
                <h3 className="text-lg font-semibold mb-2 capitalize">
                  {role} ({placements.length})
                </h3>
                <ul className="space-y-2 ml-4">
                  {placements.map((placement) => (
                    <li key={placement.id} className="text-sm">
                      <div className="flex items-start gap-2">
                        <span className="text-gray-500">
                          {placement.sortOrder + 1}.
                        </span>
                        <div className="flex-1">
                          <Link
                            href={`/admin/content-items/${placement.contentItem.id}?returnTo=${nodeId}`}
                            className="font-medium text-blue-600 underline hover:text-blue-800"
                          >
                            {placement.contentItem.title}
                          </Link>
                          <div className="text-gray-600 text-xs mt-1">
                            Type: {placement.contentItem.type} | ID:{' '}
                            {placement.contentItem.id}
                            {placement.contentItem.body.trim() === '' ? (
                              <span className="text-orange-600 ml-2 font-semibold">
                                (needs text)
                              </span>
                            ) : (
                              <span className="text-green-600 ml-2">
                                (has text)
                              </span>
                            )}
                            {placement.contentItem.audioUrl ? (
                              <span className="text-green-600 ml-2">
                                (has audio)
                              </span>
                            ) : (
                              <span className="text-gray-400 ml-2">
                                (no audio)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
