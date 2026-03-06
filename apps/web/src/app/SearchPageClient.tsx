'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ActionRow, SectionCard } from '@/components/shared';
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
import { api } from '@/lib/api';
import { APP_NAME } from '@/lib/constants';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { ApiRequestError, emitApiError } from '@/lib/api-errors';
import { reportError } from '@/lib/report-error';
import { useAuth } from '@/components/providers/AuthProvider';
import type {
  WikidataSearchResult,
  WikidataSearchResponse,
  LocationSearchResponse,
  MuseumSelectResponse,
  NearbyMuseumSearchResponse,
} from '@repo/types';

const NEARBY_RADIUS_STEPS_KM = [1, 5, 25] as const;
const MIN_SEARCH_LENGTH = 2;
const AUTH_STATUS_PENDING_MESSAGE =
  'Checking sign-in status. Please try again in a moment.';

interface LocalMuseum {
  id: number;
  name: string;
  slug: string;
  wikidataId?: string;
}

function ResultsContainer({
  className,
  scrollable = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { scrollable?: boolean }) {
  return (
    <div
      className={[
        'divide-y divide-line border border-line rounded-md',
        scrollable ? 'max-h-96 overflow-y-auto' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}

interface MuseumResultRowProps {
  label: string;
  description?: string;
  meta?: string;
  onClick: () => void;
  disabled: boolean;
  isSelecting: boolean;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
}

function MuseumResultRow({
  label,
  description,
  meta,
  onClick,
  disabled,
  isSelecting,
  icon: Icon,
  iconClassName,
}: MuseumResultRowProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left py-3 px-4 hover:bg-raised/50 transition-colors disabled:opacity-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={iconClassName} />
            <h3 className="font-medium truncate">{label}</h3>
          </div>
          {description && (
            <MutedText className="mt-1 line-clamp-2">{description}</MutedText>
          )}
          {meta && (
            <p className="text-xs text-muted-foreground/60 mt-1">{meta}</p>
          )}
        </div>
        <div className="flex-shrink-0">
          {isSelecting ? (
            <Spinner size="md" className="text-primary" />
          ) : (
            <ExternalLink className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </div>
    </button>
  );
}

function SearchLoadingCard({
  title,
  subtitle,
  message,
}: {
  title: string;
  subtitle: string;
  message: string;
}) {
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Spinner size="md" className="mr-2" />
        {message}
      </div>
    </SectionCard>
  );
}

export default function SearchPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const authedApi = useAuthedApi();
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

  const promptSignInRequired = useCallback(() => {
    emitApiError({
      code: 'AUTH_REQUIRED',
      message: 'Sign in required for this action.',
    });
  }, []);

  const canRunSearchAction = useCallback(() => {
    if (authLoading) {
      setSearchError(AUTH_STATUS_PENDING_MESSAGE);
      return false;
    }

    if (user) {
      return true;
    }

    promptSignInRequired();
    return false;
  }, [authLoading, user, promptSignInRequired]);

  // Load all local museums on mount
  useEffect(() => {
    async function loadLocalMuseums() {
      try {
        const response = await api<LocalMuseum[]>('/museums');
        setAllLocalMuseums(response);
      } catch (error) {
        console.error('Failed to load local museums:', error);
        reportError(error, {
          message: 'Failed to load local museums',
          tags: { feature: 'search', action: 'load-local-museums' },
        });
      } finally {
        setIsLoadingLocal(false);
      }
    }
    loadLocalMuseums();
  }, []);

  // Clear the temporary auth-loading message once auth state resolves.
  useEffect(() => {
    if (!authLoading && searchError === AUTH_STATUS_PENDING_MESSAGE) {
      setSearchError(null);
    }
  }, [authLoading, searchError]);

  // Filter local museums based on search query (client-side)
  const filteredLocalMuseums = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < MIN_SEARCH_LENGTH) {
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
    if (!searchQuery.trim() || searchQuery.trim().length < MIN_SEARCH_LENGTH) {
      return;
    }

    if (!canRunSearchAction()) {
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
        reportError(error, {
          message: 'Wikidata search failed',
          tags: { feature: 'search', action: 'wikidata-search' },
          extra: { query: term },
        });
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
        reportError(error, {
          message: 'Location search failed',
          tags: { feature: 'search', action: 'location-search' },
          extra: { query: term },
        });
      })
      .finally(() => setIsSearchingLocation(false));

    await Promise.allSettled([wikidataPromise, locationPromise]);
  }, [searchQuery, allLocalMuseums, canRunSearchAction]);

  const handleSelectLocal = useCallback(
    (museum: LocalMuseum) => {
      router.push(`/${museum.slug}`, { scroll: true });
    },
    [router]
  );

  const handleSelectWikidata = useCallback(
    async (result: { qid: string; label: string }) => {
      setIsSelecting(result.qid);
      setSelectError(null);

      try {
        const response = await authedApi.post<MuseumSelectResponse>(
          `/api/museums/select/${result.qid}`,
          {
            requireCreator: true,
            creatorErrorMessage:
              'Sign in with a premium or admin account to add museums from Wikidata.',
          }
        );

        console.log('Museum selected:', response);
        router.push(`/${response.museum.slug}`, { scroll: true });
      } catch (error) {
        console.error('Select error:', error);
        reportError(error, {
          message: 'Museum select from Wikidata failed',
          tags: { feature: 'search', action: 'select-museum' },
          extra: { qid: result.qid },
        });
        if (
          error instanceof ApiRequestError &&
          (error.status === 503 ||
            error.message.toLowerCase().includes('rate-limit') ||
            error.message.toLowerCase().includes('rate limit') ||
            error.message.toLowerCase().includes('wikidata'))
        ) {
          setSelectError(
            'Wikidata is temporarily rate-limiting requests. Please wait a moment and try again.'
          );
          setIsSelecting(null);
          return;
        }
        setSelectError(
          error instanceof Error ? error.message : 'Failed to add museum'
        );
        setIsSelecting(null);
      }
    },
    [router, authedApi]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSearchNearby = useCallback(async () => {
    if (!canRunSearchAction()) {
      return;
    }

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
      reportError(error, {
        message: 'Nearby museum search failed',
        tags: { feature: 'search', action: 'nearby-search' },
      });
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to fetch nearby museums';
      setSearchError(message);
      setNearbyStatus(null);
    } finally {
      setIsSearchingNearby(false);
    }
  }, [canRunSearchAction]);

  const showLocalResults = filteredLocalMuseums.length > 0;
  const showRecentlyViewedMuseums =
    !isLoadingLocal &&
    allLocalMuseums.length > 0 &&
    searchQuery.trim().length < MIN_SEARCH_LENGTH;
  const showWikidataResults =
    hasSearched && !isSearchingWikidata && wikidataResults.length > 0;
  const showLocationResults =
    hasSearched && locationInfo !== null && locationResults.length > 0;
  const showNearbyResults = !isSearchingNearby && nearbyResults.length > 0;
  const isSearching = isSearchingWikidata || isSearchingLocation;
  const isSearchDisabled =
    isSearching ||
    isSelecting !== null ||
    authLoading ||
    searchQuery.trim().length < MIN_SEARCH_LENGTH;
  const isNearbyDisabled =
    isSearchingNearby || isSelecting !== null || authLoading;

  return (
    <div className="bg-canvas">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header className="mb-8">
          <PageTitle>Find a Museum</PageTitle>
        </header>
        <SectionCard
          title="Search"
          subtitle="Start by finding the museum you would like to tour, you can sarch for the name (must be exact) the location or near you"
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:flex-1">
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
              <ActionRow
                mobileLayout="grid-2"
                desktopWrap={false}
                className="sm:shrink-0"
              >
                <Button
                  onClick={handleSearch}
                  disabled={isSearchDisabled}
                  className="w-full justify-center"
                >
                  {isSearching ? <Spinner /> : <Globe className="h-4 w-4" />}
                  <span>Search</span>
                </Button>
                <Button
                  onClick={handleSearchNearby}
                  disabled={isNearbyDisabled}
                  className="w-full min-w-0 justify-center sm:min-w-28"
                >
                  {isSearchingNearby ? (
                    <Spinner />
                  ) : (
                    <LocateFixed className="h-4 w-4" />
                  )}
                  <span>Near Me</span>
                </Button>
              </ActionRow>
            </div>
            {nearbyStatus && <MutedText>{nearbyStatus}</MutedText>}

            {searchError && <Alert>{searchError}</Alert>}

            {selectError && <Alert>{selectError}</Alert>}
          </div>
        </SectionCard>

        {showRecentlyViewedMuseums && (
          <SectionCard
            title="Recently Viewed Museums"
            subtitle={`${allLocalMuseums.length} museum${allLocalMuseums.length !== 1 ? 's' : ''} already in the database`}
          >
            <ResultsContainer scrollable={allLocalMuseums.length > 8}>
              {allLocalMuseums.map((museum) => (
                <MuseumResultRow
                  key={museum.id}
                  label={museum.name}
                  onClick={() => handleSelectLocal(museum)}
                  disabled={isSelecting !== null}
                  isSelecting={false}
                  icon={Database}
                  iconClassName="h-4 w-4 text-accent flex-shrink-0"
                />
              ))}
            </ResultsContainer>
          </SectionCard>
        )}

        {/* Local Results (instant autocomplete) */}
        {showLocalResults && (
          <SectionCard
            title={`In ${APP_NAME}`}
            subtitle={`${filteredLocalMuseums.length} museum${filteredLocalMuseums.length !== 1 ? 's' : ''} in your collection`}
          >
            <ResultsContainer>
              {filteredLocalMuseums.map((museum) => (
                <MuseumResultRow
                  key={museum.id}
                  label={museum.name}
                  onClick={() => handleSelectLocal(museum)}
                  disabled={isSelecting !== null}
                  isSelecting={false}
                  icon={Database}
                  iconClassName="h-4 w-4 text-accent flex-shrink-0"
                />
              ))}
            </ResultsContainer>
          </SectionCard>
        )}

        {/* Wikidata Name Results (after explicit search) */}
        {showWikidataResults && (
          <SectionCard
            title="Museum Name Matches"
            subtitle={`${wikidataResults.length} museum${wikidataResults.length !== 1 ? 's' : ''} found on Wikidata`}
          >
            <ResultsContainer>
              {wikidataResults.map((result) => (
                <MuseumResultRow
                  key={result.qid}
                  label={result.label}
                  description={result.description}
                  meta={result.qid}
                  onClick={() => handleSelectWikidata(result)}
                  disabled={isSelecting !== null}
                  isSelecting={isSelecting === result.qid}
                  icon={MapPin}
                  iconClassName="h-4 w-4 text-primary flex-shrink-0"
                />
              ))}
            </ResultsContainer>
          </SectionCard>
        )}

        {/* Location-based Results */}
        {isSearchingLocation && hasSearched && (
          <SearchLoadingCard
            title="Museums by Location"
            subtitle="Searching for museums in matching locations..."
            message="This may take a moment..."
          />
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
              <ResultsContainer scrollable>
                {filteredLocationResults.map((museum) => (
                  <MuseumResultRow
                    key={museum.qid}
                    label={museum.label}
                    meta={museum.qid}
                    onClick={() => handleSelectWikidata(museum)}
                    disabled={isSelecting !== null}
                    isSelecting={isSelecting === museum.qid}
                    icon={MapPin}
                    iconClassName="h-4 w-4 text-accent flex-shrink-0"
                  />
                ))}
                {filteredLocationResults.length === 0 && locationFilter && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No museums matching &quot;{locationFilter}&quot;
                  </div>
                )}
              </ResultsContainer>
            </div>
          </SectionCard>
        )}

        {isSearchingNearby && (
          <SearchLoadingCard
            title="Nearby Museums"
            subtitle={`Searching within ${nearbyRadiusKm} km of your location...`}
            message="Finding nearby museums..."
          />
        )}

        {showNearbyResults && (
          <SectionCard
            title="Museums Near You"
            subtitle={`${nearbyResults.length} museum${nearbyResults.length !== 1 ? 's' : ''} found within ${nearbyRadiusKm} km`}
          >
            <ResultsContainer scrollable>
              {nearbyResults.map((museum) => (
                <MuseumResultRow
                  key={museum.qid}
                  label={museum.label}
                  description={museum.description}
                  meta={`${museum.qid} · ${museum.distanceKm.toFixed(1)} km away`}
                  onClick={() => handleSelectWikidata(museum)}
                  disabled={isSelecting !== null}
                  isSelecting={isSelecting === museum.qid}
                  icon={MapPin}
                  iconClassName="h-4 w-4 text-accent flex-shrink-0"
                />
              ))}
            </ResultsContainer>
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
