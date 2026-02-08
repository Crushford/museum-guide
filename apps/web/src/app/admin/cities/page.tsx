'use client';

import { useState, useEffect } from 'react';
import { AdminPageLayout } from '@/components/shared';
import { SectionCard } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { api, apiPost } from '../../../lib/api';

interface CityStats {
  city: string;
  museumCount: number;
  lastSeeded: string | null;
}

interface SeedResult {
  city: string;
  inserted: number;
  updated: number;
  total: number;
}

export default function AdminCitiesPage() {
  const [cityStats, setCityStats] = useState<CityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seedingCity, setSeedingCity] = useState<string | null>(null);
  const [seedResults, setSeedResults] = useState<Record<string, SeedResult>>({});
  const [seedErrors, setSeedErrors] = useState<Record<string, string>>({});

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const stats = await api<CityStats[]>('/cities/stats');
      setCityStats(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load city stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleReseed = async (city: string) => {
    setSeedingCity(city);
    // Clear previous results/errors for this city
    setSeedResults((prev) => {
      const next = { ...prev };
      delete next[city];
      return next;
    });
    setSeedErrors((prev) => {
      const next = { ...prev };
      delete next[city];
      return next;
    });

    try {
      console.log(`[Admin] Starting reseed for ${city}...`);
      const result = await apiPost<SeedResult>(`/api/seed-museums/${city}`);
      console.log(`[Admin] Reseed complete for ${city}:`, result);

      setSeedResults((prev) => ({ ...prev, [city]: result }));

      // Update the stats to reflect new counts
      setCityStats((prev) =>
        prev.map((stat) =>
          stat.city === city ? { ...stat, museumCount: result.total } : stat
        )
      );
    } catch (err) {
      console.error(`[Admin] Reseed error for ${city}:`, err);
      setSeedErrors((prev) => ({
        ...prev,
        [city]: err instanceof Error ? err.message : 'Failed to seed',
      }));
    } finally {
      setSeedingCity(null);
    }
  };

  if (loading) {
    return (
      <AdminPageLayout title="Manage Cities">
        <SectionCard title="">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SectionCard>
      </AdminPageLayout>
    );
  }

  if (error) {
    return (
      <AdminPageLayout title="Manage Cities">
        <SectionCard title="">
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchStats}>Retry</Button>
          </div>
        </SectionCard>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Manage Cities"
      actions={
        <Button onClick={fetchStats} variant="secondary" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      }
    >
      <SectionCard
        title="Seeded Cities"
        subtitle="Cities with museums imported from Wikidata. Reseeding will add new museums and update existing ones (no duplicates)."
      >
        <div className="space-y-4">
          {cityStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No cities configured yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {cityStats.map((stat) => (
                <div
                  key={stat.city}
                  className="py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium capitalize">{stat.city}</h3>
                      <p className="text-sm text-muted-foreground">
                        {stat.museumCount} museum{stat.museumCount !== 1 ? 's' : ''} in database
                      </p>
                    </div>
                    <Button
                      onClick={() => handleReseed(stat.city)}
                      disabled={seedingCity !== null}
                      variant="outline"
                      size="sm"
                    >
                      {seedingCity === stat.city ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Seeding...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Reseed
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Show seed result */}
                  {seedResults[stat.city] && (
                    <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-green-800 dark:text-green-200">
                            Seeding complete
                          </p>
                          <p className="text-green-700 dark:text-green-300">
                            {seedResults[stat.city].inserted} new museum{seedResults[stat.city].inserted !== 1 ? 's' : ''} added,{' '}
                            {seedResults[stat.city].updated} updated.{' '}
                            Total: {seedResults[stat.city].total}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show seed error */}
                  {seedErrors[stat.city] && (
                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-red-800 dark:text-red-200">
                            Seeding failed
                          </p>
                          <p className="text-red-700 dark:text-red-300">
                            {seedErrors[stat.city]}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="How it works"
        subtitle="Understanding the seeding process"
      >
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>No duplicates:</strong> Each museum has a unique Wikidata ID. When reseeding,
            existing museums are updated (name changes, etc.) and only new museums are inserted.
          </p>
          <p>
            <strong>Districts included:</strong> The query finds museums in the city and all its
            districts/neighborhoods, following Wikidata's administrative hierarchy.
          </p>
          <p>
            <strong>Safe to run multiple times:</strong> You can reseed as often as you like to
            pick up newly added museums from Wikidata.
          </p>
        </div>
      </SectionCard>
    </AdminPageLayout>
  );
}
