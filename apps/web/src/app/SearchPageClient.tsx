'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/shared';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { PageTitle } from '@/components/ui/page-title';
import { Button } from '@/components/ui/button';
import { MutedText } from '@/components/ui/muted-text';
import {
  Search,
  MapPin,
  LocateFixed,
  ExternalLink,
  Database,
  Globe,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { api, apiPost } from '@/lib/api';
import { APP_NAME } from '@/lib/constants';
import type {
  WikidataSearchResult,
  WikidataSearchResponse,
  LocationSearchResponse,
  MuseumSelectResponse,
  NearbyMuseumSearchResponse,
} from '@repo/types';

const NEARBY_RADIUS_STEPS_KM = [1, 5, 25] as const;

interface LocalMuseum {
  id: number;
  name: string;
  slug: string;
  wikidataId?: string;
}

export default function SearchPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [allLocalMuseums, setAllLocalMuseums] = useState<LocalMuseum[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(true);
  const [wikidataResults, setWikidataResults] = useState<
    WikidataSearchResult[]
  >([]);
  const [isSearchingWikidata, setIsSearchingWikidata] = useState(false);
  const [locationResults, setLocationResults] = useState<
    LocationSearchResponse['museums']
  >([]);
  const [locationInfo, setLocationInfo] = useState<{
    qid: string;
    label: string;
    description?: string;
  } | null>(null);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [nearbyResults, setNearbyResults] = useState<
    NearbyMuseumSearchResponse['results']
  >([]);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState(1);
  const [isSearchingNearby, setIsSearchingNearby] = useState(false);
  const [nearbyStatus, setNearbyStatus] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState('');
  const [isSelecting, setIsSelecting] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Load all local museums on mount
  useEffect(() => {
    async function loadLocalMuseums() {
      try {
        const response = await api<LocalMuseum[]>('/museums');
        setAllLocalMuseums(response);
      } catch (error) {
        console.error('Failed to load local museums:', error);
      } finally {
        setIsLoadingLocal(false);
      }
    }
    loadLocalMuseums();
  }, []);

  // Filter local museums based on search query (client-side)
  const filteredLocalMuseums = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      return [];
    }
    const query = searchQuery.toLowerCase().trim();
    return allLocalMuseums.filter((museum) =>
      museum.name.toLowerCase().includes(query)
    );
  }, [searchQuery, allLocalMuseums]);

  // Filter location results client-side
  const filteredLocationResults = useMemo(() => {
    if (!locationFilter.trim()) {
      return locationResults;
    }
    const filter = locationFilter.toLowerCase().trim();
    return locationResults.filter((m) =>
      m.label.toLowerCase().includes(filter)
    );
  }, [locationResults, locationFilter]);

  // Search both Wikidata name and location in parallel
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      return;
    }

    const term = searchQuery.trim();
    setSearchError(null);
    setHasSearched(true);
    setIsSearchingWikidata(true);
    setIsSearchingLocation(true);
    setLocationFilter('');

    // Fire both searches in parallel
    const wikidataPromise = api<WikidataSearchResponse>(
      `/api/museums/search/wikidata?q=${encodeURIComponent(term)}`
    )
      .then((response) => {
        const localQids = new Set(
          allLocalMuseums.map((m) => m.wikidataId).filter(Boolean)
        );
        const filtered = response.results.filter((r) => !localQids.has(r.qid));
        setWikidataResults(filtered);
      })
      .catch((error) => {
        console.error('Wikidata search error:', error);
        setSearchError(
          error instanceof Error ? error.message : 'Search failed'
        );
      })
      .finally(() => setIsSearchingWikidata(false));

    const locationPromise = api<LocationSearchResponse>(
      `/api/museums/search/location?q=${encodeURIComponent(term)}`
    )
      .then((response) => {
        setLocationInfo(response.location);
        setLocationResults(response.museums);
      })
      .catch((error) => {
        console.error('Location search error:', error);
      })
      .finally(() => setIsSearchingLocation(false));

    await Promise.allSettled([wikidataPromise, locationPromise]);
  }, [searchQuery, allLocalMuseums]);

  const handleSelectLocal = useCallback(
    (museum: LocalMuseum) => {
      router.push(`/${museum.slug}`);
    },
    [router]
  );

  const handleSelectWikidata = useCallback(
    async (result: { qid: string; label: string }) => {
      setIsSelecting(result.qid);
      setSelectError(null);

      try {
        const response = await apiPost<MuseumSelectResponse>(
          `/api/museums/select/${result.qid}`
        );

        console.log('Museum selected:', response);
        router.push(`/${response.museum.slug}`);
      } catch (error) {
        console.error('Select error:', error);
        setSelectError(
          error instanceof Error ? error.message : 'Failed to add museum'
        );
        setIsSelecting(null);
      }
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSearchNearby = useCallback(async () => {
    if (!navigator.geolocation) {
      setSearchError('Geolocation is not supported in this browser.');
      return;
    }

    setSearchError(null);
    setIsSearchingNearby(true);
    setNearbyResults([]);
    setNearbyStatus('Getting your location...');

    const getCurrentPosition = () =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        });
      });

    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      let foundResults: NearbyMuseumSearchResponse['results'] = [];
      let foundRadius: number | null = null;

      for (const radiusKm of NEARBY_RADIUS_STEPS_KM) {
        setNearbyRadiusKm(radiusKm);
        setNearbyStatus(
          `No museums found yet. Searching within ${radiusKm} km...`
        );
        const response = await api<NearbyMuseumSearchResponse>(
          `/api/museums/search/nearby?lat=${encodeURIComponent(String(latitude))}&lng=${encodeURIComponent(String(longitude))}&radiusKm=${radiusKm}&limit=20`
        );

        if (response.results.length > 0) {
          foundResults = response.results;
          foundRadius = radiusKm;
          break;
        }

        setNearbyStatus(
          `No museums found within ${radiusKm} km. Expanding search radius...`
        );
      }

      setNearbyResults(foundResults);
      if (foundRadius !== null) {
        setNearbyStatus(
          `Found ${foundResults.length} museum${foundResults.length !== 1 ? 's' : ''} within ${foundRadius} km.`
        );
      } else {
        setNearbyStatus('No museums found within 25 km of your location.');
      }
    } catch (error) {
      console.error('Nearby search error:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to fetch nearby museums';
      setSearchError(message);
      setNearbyStatus(null);
    } finally {
      setIsSearchingNearby(false);
    }
  }, []);

  const showLocalResults = filteredLocalMuseums.length > 0;
  const showWikidataResults =
    hasSearched && !isSearchingWikidata && wikidataResults.length > 0;
  const showLocationResults =
    hasSearched && locationInfo !== null && locationResults.length > 0;
  const showNearbyResults = !isSearchingNearby && nearbyResults.length > 0;
  const isSearching = isSearchingWikidata || isSearchingLocation;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header className="mb-8">
          <PageTitle>Find a Museum</PageTitle>
        </header>
        <SectionCard
          title="Search"
          subtitle="Start by finding the museum you would like to tour, you can sarch for the name (must be exact) the location or near you"
        >
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by museum name or city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-10"
                  disabled={isSelecting !== null}
                  autoFocus
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={
                  isSearching ||
                  isSelecting !== null ||
                  searchQuery.trim().length < 2
                }
              >
                {isSearching ? (
                  <Spinner />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                <span className="ml-2">Search</span>
              </Button>
              <Button
                onClick={handleSearchNearby}
                disabled={isSearchingNearby || isSelecting !== null}
                className="min-w-28"
              >
                {isSearchingNearby ? (
                  <Spinner />
                ) : (
                  <LocateFixed className="h-4 w-4" />
                )}
                <span className="ml-2">Near Me</span>
              </Button>
            </div>
            {nearbyStatus && <MutedText>{nearbyStatus}</MutedText>}

            {searchError && <Alert>{searchError}</Alert>}

            {selectError && <Alert>{selectError}</Alert>}
          </div>
        </SectionCard>

        {/* Local Results (instant autocomplete) */}
        {showLocalResults && (
          <SectionCard
            title={`In ${APP_NAME}`}
            subtitle={`${filteredLocalMuseums.length} museum${filteredLocalMuseums.length !== 1 ? 's' : ''} in your collection`}
          >
            <div className="divide-y divide-border border border-border rounded-md">
              {filteredLocalMuseums.map((museum) => (
                <button
                  key={museum.id}
                  onClick={() => handleSelectLocal(museum)}
                  disabled={isSelecting !== null}
                  className="w-full text-left py-3 px-4 hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-accent flex-shrink-0" />
                        <h3 className="font-medium truncate">{museum.name}</h3>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <ExternalLink className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Wikidata Name Results (after explicit search) */}
        {showWikidataResults && (
          <SectionCard
            title="Museum Name Matches"
            subtitle={`${wikidataResults.length} museum${wikidataResults.length !== 1 ? 's' : ''} found on Wikidata`}
          >
            <div className="divide-y divide-border border border-border rounded-md">
              {wikidataResults.map((result) => (
                <button
                  key={result.qid}
                  onClick={() => handleSelectWikidata(result)}
                  disabled={isSelecting !== null}
                  className="w-full text-left py-3 px-4 hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                        <h3 className="font-medium truncate">{result.label}</h3>
                      </div>
                      {result.description && (
                        <MutedText className="mt-1 line-clamp-2">
                          {result.description}
                        </MutedText>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {result.qid}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {isSelecting === result.qid ? (
                        <Spinner size="md" className="text-primary" />
                      ) : (
                        <ExternalLink className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Location-based Results */}
        {isSearchingLocation && hasSearched && (
          <SectionCard
            title="Museums by Location"
            subtitle="Searching for museums in matching locations..."
          >
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Spinner size="md" className="mr-2" />
              This may take a moment...
            </div>
          </SectionCard>
        )}

        {showLocationResults && !isSearchingLocation && (
          <SectionCard
            title={`Museums in ${locationInfo.label}`}
            subtitle={`${locationResults.length} museum${locationResults.length !== 1 ? 's' : ''} found${locationInfo.description ? ` — ${locationInfo.description}` : ''}`}
          >
            <div className="space-y-3">
              {locationResults.length > 10 && (
                <Input
                  type="text"
                  placeholder="Filter results..."
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                />
              )}
              <div className="divide-y divide-border border border-border rounded-md max-h-96 overflow-y-auto">
                {filteredLocationResults.map((museum) => (
                  <button
                    key={museum.qid}
                    onClick={() => handleSelectWikidata(museum)}
                    disabled={isSelecting !== null}
                    className="w-full text-left py-3 px-4 hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-accent flex-shrink-0" />
                          <h3 className="font-medium truncate">
                            {museum.label}
                          </h3>
                        </div>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          {museum.qid}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {isSelecting === museum.qid ? (
                          <Spinner size="md" className="text-primary" />
                        ) : (
                          <ExternalLink className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                {filteredLocationResults.length === 0 && locationFilter && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No museums matching &quot;{locationFilter}&quot;
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        {isSearchingNearby && (
          <SectionCard
            title="Nearby Museums"
            subtitle={`Searching within ${nearbyRadiusKm} km of your location...`}
          >
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Spinner size="md" className="mr-2" />
              Finding nearby museums...
            </div>
          </SectionCard>
        )}

        {showNearbyResults && (
          <SectionCard
            title="Museums Near You"
            subtitle={`${nearbyResults.length} museum${nearbyResults.length !== 1 ? 's' : ''} found within ${nearbyRadiusKm} km`}
          >
            <div className="divide-y divide-border border border-border rounded-md max-h-96 overflow-y-auto">
              {nearbyResults.map((museum) => (
                <button
                  key={museum.qid}
                  onClick={() => handleSelectWikidata(museum)}
                  disabled={isSelecting !== null}
                  className="w-full text-left py-3 px-4 hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-accent flex-shrink-0" />
                        <h3 className="font-medium truncate">{museum.label}</h3>
                      </div>
                      {museum.description && (
                        <MutedText className="mt-1 line-clamp-2">
                          {museum.description}
                        </MutedText>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {museum.qid} · {museum.distanceKm.toFixed(1)} km away
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {isSelecting === museum.qid ? (
                        <Spinner size="md" className="text-primary" />
                      ) : (
                        <ExternalLink className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* No results message */}
        {hasSearched &&
          !isSearching &&
          wikidataResults.length === 0 &&
          locationResults.length === 0 && (
            <SectionCard title="No Results">
              <div className="text-center py-8 text-muted-foreground">
                <p>No museums found matching your search.</p>
                <p className="text-sm mt-2">
                  Try a different spelling, a more specific name, or search by
                  city.
                </p>
              </div>
            </SectionCard>
          )}

        {/* Loading indicator for initial load */}
        {isLoadingLocal && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Spinner className="mr-2" />
            Loading museums...
          </div>
        )}
      </div>
    </div>
  );
}
