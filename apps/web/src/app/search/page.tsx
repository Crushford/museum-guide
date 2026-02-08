'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SectionCard } from '@/components/shared';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, MapPin, ExternalLink, ArrowLeft } from 'lucide-react';
import { api, apiPost } from '../../lib/api';

interface SearchResult {
  qid: string;
  label: string;
  description?: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelecting, setIsSelecting] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setResults([]);
    setHasSearched(true);

    try {
      const response = await api<SearchResponse>(
        `/api/museums/search?q=${encodeURIComponent(searchQuery.trim())}`
      );
      setResults(response.results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchError(
        error instanceof Error ? error.message : 'Search failed'
      );
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleSelect = useCallback(
    async (result: SearchResult) => {
      setIsSelecting(result.qid);
      setSelectError(null);

      try {
        const response = await apiPost<SelectResponse>(
          `/api/museums/select/${result.qid}`
        );

        console.log('Museum selected:', response);

        // Redirect to the museum page using the slug
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
          subtitle="Search for a museum by name. We'll find it on Wikidata and add it to your collection."
        >
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter museum name (e.g., British Museum, Louvre, MoMA)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1"
                disabled={isSearching || isSelecting !== null}
              />
              <Button
                onClick={handleSearch}
                disabled={
                  isSearching ||
                  isSelecting !== null ||
                  searchQuery.trim().length < 2
                }
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
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

        {/* Results */}
        {(results.length > 0 || (hasSearched && !isSearching)) && (
          <SectionCard
            title="Results"
            subtitle={
              results.length > 0
                ? `Found ${results.length} museum${results.length !== 1 ? 's' : ''}`
                : undefined
            }
          >
            {isSearching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">
                  Searching Wikidata...
                </span>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No museums found matching your search.</p>
                <p className="text-sm mt-2">
                  Try a different spelling or a more specific name.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {results.map((result) => (
                  <button
                    key={result.qid}
                    onClick={() => handleSelect(result)}
                    disabled={isSelecting !== null}
                    className="w-full text-left py-4 px-2 hover:bg-muted/50 transition-colors disabled:opacity-50 first:pt-0 last:pb-0"
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
        {!hasSearched && (
          <SectionCard title="How it works">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>1. Search:</strong> Enter the name of any museum in the
                world. We search Wikidata&apos;s database of millions of entities.
              </p>
              <p>
                <strong>2. Select:</strong> Click on the museum you want to add.
                We&apos;ll fetch its details including images, coordinates, and
                Wikipedia links.
              </p>
              <p>
                <strong>3. Explore:</strong> You&apos;ll be redirected to the museum
                page where you can add rooms, artifacts, and content.
              </p>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
