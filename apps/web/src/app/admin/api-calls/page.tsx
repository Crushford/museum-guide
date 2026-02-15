'use client';

import { useState, useEffect, useRef } from 'react';
import { PageLayout, SectionCard } from '../../../components/shared';
import { Badge } from '@/components/ui/badge';
import { ErrorText } from '@/components/ui/error-text';
import { useAuthedApi } from '@/lib/useAuthedApi';

type ServiceSummary = {
  service: string;
  count: number;
  avgDurationMs: number;
};

type GlobalLimitSummary = {
  llmCalls: number | null;
  wikiCalls: number | null;
  dbOps: number | null;
  museumCreates: number | null;
  artifactCreates: number | null;
};

type ApiCallRow = {
  id: number;
  service: string;
  endpoint: string;
  durationMs: number;
  status: string;
  statusCode: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  metadata: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
};

export default function ApiCallsPage() {
  const authedApi = useAuthedApi();
  const [daily, setDaily] = useState<{
    totalCalls: number;
    services: ServiceSummary[];
    globalLimits: GlobalLimitSummary;
  } | null>(null);
  const [rows, setRows] = useState<ApiCallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedApi.get<{
          totalCalls: number;
          services: ServiceSummary[];
          globalLimits: GlobalLimitSummary;
        }>('/admin/api-calls/daily');
        if (!cancelled) setDaily(data);
      } catch {
        // Non-blocking summary panel
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedApi]);

  useEffect(() => {
    let cancelled = false;
    const id = ++fetchIdRef.current;
    (async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: '50',
        });
        if (serviceFilter) params.set('service', serviceFilter);

        const data = await authedApi.get<{ rows: ApiCallRow[]; total: number }>(
          `/admin/api-calls?${params}`
        );
        if (!cancelled && id === fetchIdRef.current) {
          setRows(data.rows);
          setTotal(data.total);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled && id === fetchIdRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, serviceFilter, authedApi]);

  const totalPages = Math.ceil(total / 50);

  const allServices = daily?.services.map((s) => s.service) ?? [];
  const fmtLimit = (value: number | null) => (value === null ? 'Disabled' : value);

  return (
    <PageLayout
      title="API Calls"
      breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'API Calls' }]}
    >
      <div className="space-y-6">
        {daily && (
          <SectionCard title="Today's Summary">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Calls</p>
                <p className="text-2xl font-bold">{daily.totalCalls}</p>
              </div>
              {daily.services.map((s) => (
                <div key={s.service} className="rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{s.service}</Badge>
                  </div>
                  <p className="mt-1 text-lg font-semibold">{s.count} calls</p>
                  <p className="text-xs text-muted-foreground">
                    avg {s.avgDurationMs}ms
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border p-4">
              <p className="text-sm text-muted-foreground mb-2">Global Daily Limits</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-sm">
                <div>LLM: <span className="font-semibold">{fmtLimit(daily.globalLimits.llmCalls)}</span></div>
                <div>Wikipedia: <span className="font-semibold">{fmtLimit(daily.globalLimits.wikiCalls)}</span></div>
                <div>Museums: <span className="font-semibold">{fmtLimit(daily.globalLimits.museumCreates)}</span></div>
                <div>Artifacts: <span className="font-semibold">{fmtLimit(daily.globalLimits.artifactCreates)}</span></div>
                <div>DB ops: <span className="font-semibold">{fmtLimit(daily.globalLimits.dbOps)}</span></div>
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard title="Recent Calls">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => {
                setServiceFilter(null);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                serviceFilter === null
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              All
            </button>
            {allServices.map((svc) => (
              <button
                key={svc}
                onClick={() => {
                  setServiceFilter(svc);
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  serviceFilter === svc
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {svc}
              </button>
            ))}
          </div>

          {error && <ErrorText>{error}</ErrorText>}
          {loading && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}

          {!loading && !error && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Time</th>
                      <th className="pb-2 pr-4">Service</th>
                      <th className="pb-2 pr-4">Endpoint</th>
                      <th className="pb-2 pr-4 text-right">Duration</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4 text-right">Tokens</th>
                      <th className="pb-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="secondary">{row.service}</Badge>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {row.endpoint}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {row.durationMs}ms
                        </td>
                        <td className="py-2 pr-4">
                          <Badge
                            variant={
                              row.status === 'success'
                                ? 'default'
                                : 'destructive'
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {row.inputTokens || row.outputTokens
                            ? `${row.inputTokens ?? 0} / ${row.outputTokens ?? 0}`
                            : '-'}
                        </td>
                        <td className="py-2 max-w-[200px] truncate text-xs text-destructive">
                          {row.error || '-'}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No API calls recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {total} total calls
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="rounded-md px-3 py-1 text-sm border disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <span className="flex items-center text-sm text-muted-foreground">
                      {page} / {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page >= totalPages}
                      className="rounded-md px-3 py-1 text-sm border disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
}
