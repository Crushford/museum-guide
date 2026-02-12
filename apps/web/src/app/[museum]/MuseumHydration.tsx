'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, MapPin, Globe } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { SectionCard } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/ui/error-text';
import { apiPost, API_URL } from '@/lib/api';
import Link from 'next/link';

interface HydratedMuseum {
  id: number;
  name: string;
  slug: string;
  description?: string;
  wikipediaSummary?: string;
  wikipediaUrl?: string;
  wikimediaImageUrl?: string;
  coordinates?: { lat: number; lng: number };
  officialWebsite?: string;
  museumHydratedAt?: string;
}

interface HydratedArtifact {
  id: number;
  name: string;
  slug: string;
  wikidataId?: string;
  wikipediaUrl?: string;
  wikimediaImageUrl?: string;
}

interface MuseumHydrationResponse {
  cached: boolean;
  museum: HydratedMuseum;
}

interface ArtifactHydrationResponse {
  cached: boolean;
  museumId: number;
  artifacts: HydratedArtifact[];
  newArtifacts?: number;
  artifactsHydratedAt?: string;
}

interface MuseumDetailsProps {
  museumSlug: string;
  initialImage?: string;
  initialWikipediaUrl?: string;
}

function resolveImageUrl(imageUrl?: string | null): string | undefined {
  if (!imageUrl) return undefined;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl.startsWith('/')) return `${API_URL}${imageUrl}`;
  return imageUrl;
}

export function MuseumDetailsHydration({
  museumSlug,
  initialImage,
  initialWikipediaUrl,
}: MuseumDetailsProps) {
  const [museum, setMuseum] = useState<HydratedMuseum | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiPost<MuseumHydrationResponse>(
        `/api/museums/${museumSlug}/hydrate`
      );
      setMuseum(response.museum);
    } catch (err) {
      console.error('Museum hydration error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load museum details'
      );
    } finally {
      setIsLoading(false);
    }
  }, [museumSlug]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (isLoading) {
    return (
      <SectionCard title="About">
        <div className="flex items-center gap-3 py-8">
          <Spinner size="md" className="text-primary" />
          <div>
            <p className="text-muted-foreground">
              Fetching museum information from Wikipedia...
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              This may take a moment on first load.
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="About">
        <div className="py-4">
          <ErrorText>{error}</ErrorText>
          <Button variant="secondary" size="sm" onClick={hydrate}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </SectionCard>
    );
  }

  const image = resolveImageUrl(museum?.wikimediaImageUrl || initialImage);
  const wikipediaUrl = museum?.wikipediaUrl || initialWikipediaUrl;

  return (
    <SectionCard title="About">
      <div className="space-y-4">
        {/* Image */}
        {image && (
          <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-lg bg-muted">
            <img
              src={image}
              alt={museum?.name || 'Museum'}
              className="object-cover w-full h-full"
            />
          </div>
        )}

        {/* Description */}
        {museum?.description && (
          <p className="text-muted-foreground italic">{museum.description}</p>
        )}

        {/* Wikipedia Summary */}
        {museum?.wikipediaSummary && (
          <p className="text-primary leading-relaxed">
            {museum.wikipediaSummary}
          </p>
        )}

        {/* Links */}
        <div className="flex flex-wrap gap-3 pt-2">
          {wikipediaUrl && (
            <a
              href={wikipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Globe className="h-4 w-4" />
              Wikipedia
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {museum?.officialWebsite && (
            <a
              href={museum.officialWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Globe className="h-4 w-4" />
              Official Website
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {museum?.coordinates && (
            <a
              href={`https://www.google.com/maps?q=${museum.coordinates.lat},${museum.coordinates.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <MapPin className="h-4 w-4" />
              View on Map
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

interface ArtifactHydrationProps {
  museumSlug: string;
  existingArtifacts: { id: number; name: string; slug: string }[];
}

export function ArtifactsHydration({
  museumSlug,
  existingArtifacts,
}: ArtifactHydrationProps) {
  const [artifacts, setArtifacts] = useState<HydratedArtifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);

  const hydrate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiPost<ArtifactHydrationResponse>(
        `/api/museums/${museumSlug}/hydrate-artifacts`
      );
      setArtifacts(response.artifacts);
      setNewCount(response.newArtifacts || 0);
    } catch (err) {
      console.error('Artifact hydration error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
      // Fall back to existing artifacts on error
      setArtifacts(existingArtifacts);
    } finally {
      setIsLoading(false);
    }
  }, [museumSlug, existingArtifacts]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (isLoading) {
    return (
      <SectionCard
        title="Notable Artifacts"
        subtitle="Items with Wikipedia pages"
      >
        <div className="flex items-center gap-3 py-8">
          <Spinner size="md" className="text-primary" />
          <div>
            <p className="text-muted-foreground">
              Fetching notable artifacts from Wikipedia...
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Looking for items in this museum that have Wikipedia entries.
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  if (error && artifacts.length === 0) {
    return (
      <SectionCard title="Notable Artifacts">
        <div className="py-4">
          <ErrorText>{error}</ErrorText>
          <Button variant="secondary" size="sm" onClick={hydrate}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </SectionCard>
    );
  }

  if (artifacts.length === 0) {
    return (
      <SectionCard
        title="Notable Artifacts"
        subtitle="Items with Wikipedia pages"
      >
        <p className="text-muted-foreground py-4">
          No artifacts with Wikipedia pages found for this museum.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Notable Artifacts"
      subtitle={
        newCount > 0
          ? `Found ${artifacts.length} artifacts (${newCount} new)`
          : `${artifacts.length} artifacts with Wikipedia pages`
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {artifacts.map((artifact) => (
          <Link
            key={artifact.id}
            href={`/${museumSlug}/artifacts/${artifact.slug}`}
            className="group block p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
          >
            {artifact.wikimediaImageUrl && (
              <div className="aspect-square w-full mb-2 overflow-hidden rounded-md bg-muted">
                <img
                  src={resolveImageUrl(artifact.wikimediaImageUrl)}
                  alt={artifact.name}
                  className="object-cover w-full h-full group-hover:scale-105 transition-transform"
                />
              </div>
            )}
            <h3 className="font-medium text-sm truncate group-hover:text-primary">
              {artifact.name}
            </h3>
            {artifact.wikipediaUrl && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Wikipedia
              </p>
            )}
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
