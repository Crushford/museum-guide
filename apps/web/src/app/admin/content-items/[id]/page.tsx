import Link from 'next/link';
import { api } from '../../../../lib/api';
import { ContentItemEditorClient } from './ContentItemEditorClient';

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

  // Find the node type for returnTo if it's in nodeContents
  const returnToNode = returnTo
    ? contentItem.nodeContents.find((nc) => nc.node.id === Number(returnTo))
        ?.node
    : null;

  const getEntityEditHref = (type: string, id: number): string => {
    if (type === 'MUSEUM') return `/admin/museums/${id}`;
    if (type === 'ROOM') return `/admin/rooms/${id}`;
    if (type === 'ARTIFACT') return `/admin/artifacts/${id}`;
    return `/admin`;
  };

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        {returnTo ? (
          <Link
            href={
              returnToNode
                ? getEntityEditHref(returnToNode.type, returnToNode.id)
                : `/admin`
            }
            className="text-accent hover:underline mb-4 inline-block"
          >
            ← Back to admin
          </Link>
        ) : (
          <Link
            href="/admin"
            className="text-accent hover:underline mb-4 inline-block"
          >
            ← Back to admin home
          </Link>
        )}
        <h1 className="text-3xl font-bold mb-2">{contentItem.title}</h1>
        <div className="text-sm text-muted-foreground space-y-1">
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
                className="text-accent hover:underline"
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
                  href={getEntityEditHref(nc.node.type, nc.node.id)}
                  className="text-accent hover:underline"
                >
                  {nc.node.type} - {nc.node.name}
                </Link>
                <span className="text-muted-foreground ml-2">
                  (role: {nc.role}, order: {nc.sortOrder})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Generated Content Text</h2>
        <ContentItemEditorClient
          contentItemId={contentItemId}
          initialBody={contentItem.body}
          returnTo={returnTo}
        />
      </section>
    </main>
  );
}
