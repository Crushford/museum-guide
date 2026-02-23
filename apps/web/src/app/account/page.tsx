'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageLayout, SectionCard } from '@/components/shared';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { ApiRequestError } from '@/lib/api-errors';
import { useTheme } from '@/hooks/useTheme';

type AccountUsageResponse = {
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    isAdmin: boolean;
  };
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

function limitLabel(limit: number | null): string {
  return limit === null ? 'No cap configured' : String(limit);
}

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: authLoading, signIn, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const authedApi = useAuthedApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AccountUsageResponse | null>(null);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response =
        await authedApi.get<AccountUsageResponse>('/account/usage');
      setData(response);
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        err.body?.code === 'SIGNUP_WAITLIST'
      ) {
        router.push('/waitlist');
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Failed to load account usage.'
      );
    } finally {
      setLoading(false);
    }
  }, [authedApi, router]);

  useEffect(() => {
    if (!authLoading && user) {
      void loadUsage();
    }
  }, [authLoading, loadUsage, user]);

  return (
    <PageLayout title="Account" narrow>
      <div className="space-y-6">
        <SectionCard title="Appearance">
          <div className="flex gap-2">
            <Button
              variant={preference === 'system' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setPreference('system')}
            >
              System
            </Button>
            <Button
              variant={preference === 'light' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setPreference('light')}
            >
              Light
            </Button>
            <Button
              variant={preference === 'dark' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setPreference('dark')}
            >
              Dark
            </Button>
          </div>
        </SectionCard>

        {!authLoading && !user && (
          <SectionCard
            title="Not signed in"
            subtitle="Sign in to view your account."
          >
            <Button onClick={() => void signIn()}>Sign in with Google</Button>
          </SectionCard>
        )}

        {authLoading && (
          <SectionCard title="Account" subtitle="Loading your session.">
            <div className="py-8 flex items-center justify-center">
              <Spinner size="md" />
            </div>
          </SectionCard>
        )}

        {user && (
          <SectionCard
            title="Profile"
            subtitle="Current login status and usage for today."
          >
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-fg-subtle">Email</p>
                <p>{data?.user.email || user.email || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-fg-subtle">UID</p>
                <p className="font-mono break-all">
                  {data?.user.uid || user.uid}
                </p>
              </div>

              {error && <Alert>{error}</Alert>}

              {loading && (
                <div className="py-4">
                  <Spinner size="sm" />
                </div>
              )}

              {data && (
                <div className="space-y-3">
                  <p className="font-medium">
                    Usage today ({data.usage.dateKey})
                  </p>
                  <ul className="space-y-1 text-fg-subtle">
                    <li>
                      LLM requests: {data.usage.usage.llmCalls} /{' '}
                      {limitLabel(data.usage.limits.llmCalls)}
                    </li>
                    <li>
                      Wikipedia requests: {data.usage.usage.wikiCalls} /{' '}
                      {limitLabel(data.usage.limits.wikiCalls)}
                    </li>
                    <li>
                      Museum creates: {data.usage.usage.museumCreates} /{' '}
                      {limitLabel(data.usage.limits.museumCreates)}
                    </li>
                    <li>
                      Scanned artifact creates:{' '}
                      {data.usage.usage.artifactCreates} /{' '}
                      {limitLabel(data.usage.limits.artifactCreates)}
                    </li>
                  </ul>
                  <p className="text-xs text-fg-subtle">
                    Resets at {new Date(data.usage.resetAt).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => void loadUsage()}
                  disabled={loading}
                >
                  Refresh usage
                </Button>
                <Button variant="secondary" onClick={() => void signOut()}>
                  Log out
                </Button>
                <Button variant="secondary" asChild>
                  <Link href="/">Back to homepage</Link>
                </Button>
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </PageLayout>
  );
}
