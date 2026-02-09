'use client';

import { useState, useMemo, useEffect } from 'react';
import { api, apiPost } from '../../lib/api';
import { AdminPageLayout } from '../../components/shared';
import { SectionCard } from '../../components/shared';
import { EntityList } from '../../components/shared';
import { EmptyState } from '../../components/shared';
import { Input } from '@/components/ui/input';
import type { MuseumResponse } from '@repo/types';
import { useSearchParams } from 'next/navigation';

export default function BrowsePage() {
  const searchParams = useSearchParams();
  const [selectedCity, setSelectedCity] = useState<string | null>(
    searchParams.get('city')
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [museums, setMuseums] = useState<MuseumResponse[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingMuseums, setLoadingMuseums] = useState(false);
  const [seedingCity, setSeedingCity] = useState<string | null>(null);
  const [seedingStatus, setSeedingStatus] = useState<string>('');

  // Fetch cities on mount
  useEffect(() => {
    api<string[]>('/cities')
      .then(setCities)
      .catch(() => setCities([]))
      .finally(() => setLoadingCities(false));
  }, []);

  // Fetch museums when city changes, auto-seed if none found
  useEffect(() => {
    if (!selectedCity) {
      setMuseums([]);
      setSeedingCity(null);
      setSeedingStatus('');
      return;
    }

    let cancelled = false;

    const fetchMuseums = async () => {
      setLoadingMuseums(true);
      setSeedingStatus('Checking for existing museums...');
      console.log(`[Browse] Fetching museums for city: ${selectedCity}`);

      try {
        let fetchedMuseums = await api<MuseumResponse[]>(
          `/museums?citySlug=${selectedCity}`
        );
        console.log(`[Browse] Found ${fetchedMuseums.length} existing museums`);

        if (cancelled) return;

        if (fetchedMuseums.length === 0) {
          // No museums found, trigger seeding
          setSeedingCity(selectedCity);
          setSeedingStatus(
            'Querying Wikidata for museums (this may take up to 60 seconds)...'
          );
          console.log(
            `[Browse] No museums found, starting Wikidata seed for ${selectedCity}`
          );

          const result = await apiPost<{
            city: string;
            inserted: number;
            updated: number;
            total: number;
          }>(`/api/seed-museums/${selectedCity}`);

          if (cancelled) return;

          console.log(`[Browse] Seeding complete:`, result);
          setSeedingStatus(`Added ${result.inserted} museums. Loading...`);

          // After seeding, fetch museums again
          fetchedMuseums = await api<MuseumResponse[]>(
            `/museums?citySlug=${selectedCity}`
          );
        }

        if (!cancelled) {
          setMuseums(fetchedMuseums);
        }
      } catch (error) {
        console.error('[Browse] Error fetching/seeding museums:', error);
        if (!cancelled) {
          setSeedingStatus(
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          setMuseums([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingMuseums(false);
          setSeedingCity(null);
        }
      }
    };

    fetchMuseums();

    return () => {
      cancelled = true;
    };
  }, [selectedCity]);

  // Filter cities by search query
  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) {
      return cities;
    }
    const query = searchQuery.toLowerCase();
    return cities.filter((city) => city.toLowerCase().includes(query));
  }, [cities, searchQuery]);

  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    setSearchQuery('');
    // Update URL without page reload
    const url = new URL(window.location.href);
    url.searchParams.set('city', city);
    window.history.pushState({}, '', url.toString());
  };

  const handleClear = () => {
    setSelectedCity(null);
    setSearchQuery('');
    const url = new URL(window.location.href);
    url.searchParams.delete('city');
    window.history.pushState({}, '', url.toString());
  };

  return (
    <AdminPageLayout
      title="Browse Museums"
      actions={
        <div className="flex items-center gap-2">
          {selectedCity && (
            <button
              onClick={handleClear}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <SectionCard
          title="Select a City"
          subtitle="Choose a city to browse its museums"
        >
          <div className="space-y-4">
            <Input
              type="text"
              placeholder="Search cities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />

            {loadingCities ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading cities...
              </div>
            ) : filteredCities.length > 0 ? (
              <div className="border border-border rounded-md max-h-64 overflow-y-auto">
                {filteredCities.map((city) => (
                  <button
                    key={city}
                    onClick={() => handleCitySelect(city)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-b-0 ${
                      selectedCity === city ? 'bg-muted font-semibold' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="capitalize">{city}</span>
                      {selectedCity === city && (
                        <span className="text-primary text-sm">✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery
                  ? `No cities found matching "${searchQuery}"`
                  : 'No cities available'}
              </div>
            )}
          </div>
        </SectionCard>

        {selectedCity && (
          <SectionCard
            title={`Museums in ${selectedCity.charAt(0).toUpperCase() + selectedCity.slice(1)}`}
            subtitle={
              seedingCity
                ? 'Seeding museums from Wikidata...'
                : loadingMuseums
                  ? 'Loading...'
                  : `${museums.length} museum${museums.length !== 1 ? 's' : ''} found`
            }
          >
            {loadingMuseums || seedingCity ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                <div className="text-muted-foreground">
                  {seedingStatus || 'Loading museums...'}
                </div>
              </div>
            ) : (
              <EntityList
                title=""
                items={museums.map((museum) => {
                  const museumWithSlug = museum as MuseumResponse & {
                    slug: string;
                  };
                  return {
                    id: museum.id,
                    name: museum.name,
                    href: `/${museumWithSlug.slug || museum.id}`,
                    typePill: 'MUSEUM' as const,
                  };
                })}
                emptyState={
                  <EmptyState
                    title="No museums found"
                    message={`There are no museums in ${selectedCity} yet.`}
                  />
                }
              />
            )}
          </SectionCard>
        )}

        {!selectedCity && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Select a city above to view its museums</p>
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}
