'use client';

import { useState, useEffect, useRef } from 'react';
import { AdminPageLayout, SectionCard } from '../../../components/shared';
import { Badge } from '@/components/ui/badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type ServiceSummary = {
  service: string;
  count: number;
  avgDurationMs: number;
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
  const [daily, setDaily] = useState<{
    totalCalls: number;
    services: ServiceSummary[];
  } | null>(null);
  const [rows, setRows] = useState<ApiCallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    fetch(`${API_URL}/admin/api-calls/daily`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
        return res.json();
      })
      .then((data) => setDaily(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = ++fetchIdRef.current;
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (serviceFilter) params.set('service', serviceFilter);

    fetch(`${API_URL}/admin/api-calls?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (id === fetchIdRef.current) {
          setRows(data.rows);
          setTotal(data.total);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (id === fetchIdRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load');
          setLoading(false);
        }
      });
  }, [page, serviceFilter]);

  const totalPages = Math.ceil(total / 50);

  const allServices = daily?.services.map((s) => s.service) ?? [];

  return (
    <AdminPageLayout
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

          {error && <p className="text-sm text-destructive">{error}</p>}
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
    </AdminPageLayout>
  );
}
