'use client';

import { useState, useEffect } from 'react';
import { PageLayout, SectionCard } from '../../../components/shared';
import { Badge } from '@/components/ui/badge';
import { API_URL } from '@/lib/api';

type SpendRow = {
  provider: string;
  totalEur: number;
};

export default function CostsPage() {
  const [spend, setSpend] = useState<SpendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/admin/llm-usage/monthly`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
        return res.json();
      })
      .then((data) => setSpend(data.spend ?? []))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load')
      )
      .finally(() => setLoading(false));
  }, []);

  const totalEur = spend.reduce((sum, r) => sum + r.totalEur, 0);

  return (
    <PageLayout
      title="LLM Costs"
      breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'LLM Costs' }]}
    >
      <div className="space-y-6">
        <SectionCard title="Monthly Spend">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && spend.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No usage recorded this month.
            </p>
          )}
          {!loading && !error && spend.length > 0 && (
            <div className="space-y-4">
              <div className="grid gap-3">
                {spend.map((row) => (
                  <div
                    key={row.provider}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{row.provider}</Badge>
                    </div>
                    <span className="font-mono text-sm font-medium">
                      {row.totalEur.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-medium">Total</span>
                <span className="font-mono text-sm font-bold">
                  {totalEur.toFixed(4)}
                </span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
}
