'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/useAuthedApi';

type Node = {
  id: number;
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT';
};

type ContentItemEditorClientProps = {
  contentItemId: number;
  initialBody: string;
  returnTo?: string;
};

export function ContentItemEditorClient({
  contentItemId,
  initialBody,
  returnTo,
}: ContentItemEditorClientProps) {
  const authedApi = useAuthedApi();
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await authedApi.mutate(`/content-items/${contentItemId}`, {
          method: 'PATCH',
          body: { body },
        });

        if (returnTo) {
          try {
            const node = await authedApi.get<Node>(`/nodes/${returnTo}`);
            if (node.type === 'MUSEUM') {
              router.push(`/admin/museums/${returnTo}`);
              return;
            }
            if (node.type === 'ROOM') {
              router.push(`/admin/rooms/${returnTo}`);
              return;
            }
            if (node.type === 'ARTIFACT') {
              router.push(`/admin/artifacts/${returnTo}`);
              return;
            }
          } catch {
            // Fall through to admin root on lookup failure.
          }
          router.push('/admin');
          return;
        }

        router.push(`/admin/content-items/${contentItemId}`);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to save text'
        );
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="body" className="block text-sm font-medium mb-1">
          Paste generated text here
        </label>
        <Textarea
          id="body"
          name="body"
          rows={12}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Paste the generated text from ChatGPT here..."
          className="w-full font-mono text-sm"
        />
      </div>
      <div className="flex gap-4 items-center">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save Text'}
        </Button>
        {body.trim() && (
          <div className="flex items-center text-sm text-success">
            Text length: {body.length} characters
          </div>
        )}
      </div>
      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </form>
  );
}
