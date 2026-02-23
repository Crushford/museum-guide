'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { PageLayout, SectionCard } from '@/components/shared';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { Spinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ApiRequestError } from '@/lib/api-errors';

type UsageResponse = {
  usage: {
    dateKey: string;
    resetAt: string;
    usage: {
      llmCalls: number;
      wikiCalls: number;
      museumCreates: number;
      artifactCreates: number;
    };
    limits: {
      llmCalls: number | null;
      wikiCalls: number | null;
      museumCreates: number | null;
      artifactCreates: number | null;
    };
  };
};

type UserQuestion = {
  id: number;
  questionText: string;
  answerText: string | null;
  status: string;
  upvotes: number;
  askCount: number;
  createdAt: string;
  artifact: { slug: string; name: string };
  museum: { slug: string; name: string };
};

function limitLabel(limit: number | null) {
  return limit === null ? '∞' : String(limit);
}

export default function ActivityPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const authedApi = useAuthedApi();

  const [usageLoading, setUsageLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [questions, setQuestions] = useState<UserQuestion[] | null>(null);

  const loadData = useCallback(async () => {
    setUsageLoading(true);
    setQuestionsLoading(true);
    setError(null);

    try {
      const [usageRes, questionsRes] = await Promise.all([
        authedApi.get<UsageResponse>('/account/usage'),
        authedApi.get<UserQuestion[]>('/account/questions'),
      ]);
      setUsage(usageRes);
      setQuestions(questionsRes);
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        err.body?.code === 'SIGNUP_WAITLIST'
      ) {
        router.push('/waitlist');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load activity.');
    } finally {
      setUsageLoading(false);
      setQuestionsLoading(false);
    }
  }, [authedApi, router]);

  useEffect(() => {
    if (!authLoading && user) {
      void loadData();
    }
  }, [authLoading, loadData, user]);

  if (authLoading) {
    return (
      <PageLayout title="Activity" narrow>
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      </PageLayout>
    );
  }

  if (!user) {
    return (
      <PageLayout title="Activity" narrow>
        <SectionCard title="Not signed in">
          <p className="text-sm text-fg-subtle">
            Sign in to view your activity.
          </p>
        </SectionCard>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Activity" narrow>
      <div className="space-y-6">
        {/* Today's usage */}
        <SectionCard
          title={`Usage today${usage ? ` · ${usage.usage.dateKey}` : ''}`}
        >
          {usageLoading && (
            <div className="py-4">
              <Spinner size="sm" />
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          {usage && (
            <ul className="space-y-1 text-sm text-fg-subtle">
              <li>
                LLM requests:{' '}
                <span className="text-fg font-medium">
                  {usage.usage.usage.llmCalls}
                </span>
                {' / '}
                {limitLabel(usage.usage.limits.llmCalls)}
              </li>
              <li>
                Wikipedia requests:{' '}
                <span className="text-fg font-medium">
                  {usage.usage.usage.wikiCalls}
                </span>
                {' / '}
                {limitLabel(usage.usage.limits.wikiCalls)}
              </li>
              <li>
                Museum creates:{' '}
                <span className="text-fg font-medium">
                  {usage.usage.usage.museumCreates}
                </span>
                {' / '}
                {limitLabel(usage.usage.limits.museumCreates)}
              </li>
              <li>
                Artifact scans:{' '}
                <span className="text-fg font-medium">
                  {usage.usage.usage.artifactCreates}
                </span>
                {' / '}
                {limitLabel(usage.usage.limits.artifactCreates)}
              </li>
            </ul>
          )}
          {usage && (
            <p className="mt-3 text-xs text-fg-subtle">
              Resets at {new Date(usage.usage.resetAt).toLocaleString()}
            </p>
          )}
        </SectionCard>

        {/* Questions */}
        <SectionCard title="Your questions">
          {questionsLoading && (
            <div className="py-4">
              <Spinner size="sm" />
            </div>
          )}
          {questions && questions.length === 0 && (
            <p className="text-sm text-fg-subtle">No questions yet.</p>
          )}
          {questions && questions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-left">
                    <th className="pb-2 pr-4 font-medium text-fg-subtle">
                      Question
                    </th>
                    <th className="pb-2 pr-4 font-medium text-fg-subtle">
                      Artifact
                    </th>
                    <th className="pb-2 pr-4 font-medium text-fg-subtle">
                      Status
                    </th>
                    <th className="pb-2 font-medium text-fg-subtle">Asked</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q) => (
                    <tr
                      key={q.id}
                      className="border-b border-line-subtle last:border-0 hover:bg-surface/50"
                    >
                      <td className="py-2.5 pr-4 max-w-xs">
                        <p className="line-clamp-2">{q.questionText}</p>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <Link
                          href={`/${q.museum.slug}/artifacts/${q.artifact.slug}`}
                          className="inline-flex items-center gap-1 text-brand hover:underline"
                        >
                          {q.artifact.name}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <p className="text-xs text-fg-subtle">
                          {q.museum.name}
                        </p>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <Badge
                          variant={
                            q.status === 'ACTIVE'
                              ? 'default'
                              : q.status === 'ANONYMIZED'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {q.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-fg-subtle">
                        {new Date(q.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
}
