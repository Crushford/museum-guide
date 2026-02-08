'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SectionCard } from '@/components/shared';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Search,
  MapPin,
  ExternalLink,
  ArrowLeft,
  Database,
  Globe,
} from 'lucide-react';
import { api, apiPost } from '../../lib/api';
import { APP_NAME } from '../../lib/constants';

interface LocalMuseum {
  id: number;
  name: string;
  slug: string;
  wikidataId?: string;
}

interface WikidataResult {
  qid: string;
  label: string;
  description?: string;
}

interface WikidataSearchResponse {
  query: string;
  results: WikidataResult[];
}

interface SelectResponse {
  created: boolean;
  museum: {
    id: number;
    qid: string;
    slug: string;
    name: string;
  };
}

export default function SearchPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [allLocalMuseums, setAllLocalMuseums] = useState<LocalMuseum[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(true);
  const [wikidataResults, setWikidataResults] = useState<WikidataResult[]>([]);
  const [isSearchingWikidata, setIsSearchingWikidata] = useState(false);
  const [isSelecting, setIsSelecting] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [hasSearchedWikidata, setHasSearchedWikidata] = useState(false);

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

  // Search Wikidata (only when user clicks search button)
  const searchWikidata = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      return;
    }

    setIsSearchingWikidata(true);
    setSearchError(null);
    setHasSearchedWikidata(true);

    try {
      const response = await api<WikidataSearchResponse>(
        `/api/museums/search/wikidata?q=${encodeURIComponent(searchQuery.trim())}`
      );
      // Filter out museums that are already in our local database
      const localQids = new Set(
        allLocalMuseums.map((m) => m.wikidataId).filter(Boolean)
      );
      const filtered = response.results.filter((r) => !localQids.has(r.qid));
      setWikidataResults(filtered);
    } catch (error) {
      console.error('Wikidata search error:', error);
      setSearchError(
        error instanceof Error ? error.message : 'Search failed'
      );
    } finally {
      setIsSearchingWikidata(false);
    }
  }, [searchQuery, allLocalMuseums]);

  const handleSelectLocal = useCallback(
    (museum: LocalMuseum) => {
      router.push(`/${museum.slug}`);
    },
    [router]
  );

  const handleSelectWikidata = useCallback(
    async (result: WikidataResult) => {
      setIsSelecting(result.qid);
      setSelectError(null);

      try {
        const response = await apiPost<SelectResponse>(
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
      searchWikidata();
    }
  };

  const showLocalResults = filteredLocalMuseums.length > 0;
  const showWikidataResults = hasSearchedWikidata && !isSearchingWikidata;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <h1 className="text-3xl font-bold text-primary">Find a Museum</h1>
        </header>
        <SectionCard
          title="Search"
          subtitle={`Search for a museum by name to add it to ${APP_NAME}.`}
        >
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Start typing a museum name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-10"
                  disabled={isSelecting !== null}
                  autoFocus
                />
              </div>
              <Button
                onClick={searchWikidata}
                disabled={
                  isSearchingWikidata ||
                  isSelecting !== null ||
                  searchQuery.trim().length < 2
                }
              >
                {isSearchingWikidata ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                <span className="ml-2">Search Wikidata</span>
              </Button>
            </div>

            {searchError && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
                {searchError}
              </div>
            )}

            {selectError && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
                {selectError}
              </div>
            )}
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
                        <Database className="h-4 w-4 text-green-600 flex-shrink-0" />
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

        {/* Wikidata Results (after explicit search) */}
        {showWikidataResults && (
          <SectionCard
            title="Add from Wikidata"
            subtitle={
              wikidataResults.length > 0
                ? `${wikidataResults.length} museum${wikidataResults.length !== 1 ? 's' : ''} found`
                : undefined
            }
          >
            {wikidataResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No museums found on Wikidata matching your search.</p>
                <p className="text-sm mt-2">
                  Try a different spelling or a more specific name.
                </p>
              </div>
            ) : (
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
                          <h3 className="font-medium truncate">
                            {result.label}
                          </h3>
                        </div>
                        {result.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {result.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          {result.qid}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {isSelecting === result.qid ? (
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        ) : (
                          <ExternalLink className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* How it works */}
        {!showLocalResults && !hasSearchedWikidata && (
          <SectionCard title="How it works">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>1. Type:</strong> Start typing a museum name. Museums
                already in {APP_NAME} will appear instantly.
              </p>
              <p>
                <strong>2. Search Wikidata:</strong> Click the button to search
                Wikidata&apos;s database of millions of museums worldwide.
              </p>
              <p>
                <strong>3. Select:</strong> Click on a museum to add it. We&apos;ll
                fetch its details including images, coordinates, and Wikipedia
                links.
              </p>
            </div>
          </SectionCard>
        )}

        {/* Loading indicator for initial load */}
        {isLoadingLocal && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading museums...
          </div>
        )}
      </div>
    </div>
  );
}
