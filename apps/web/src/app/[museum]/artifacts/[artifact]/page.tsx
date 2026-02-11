import Link from 'next/link';
import type { Metadata } from 'next';
import { api, API_URL } from '../../../../lib/api';
import { notFound } from 'next/navigation';
import type { MuseumResponse } from '@repo/types';
import { AdminPageLayout } from '../../../../components/shared';
import { SectionCard } from '../../../../components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Globe, ExternalLink } from 'lucide-react';
import { ArtifactIntroduction } from './ArtifactIntroduction';
import { WikipediaSummaryDisplay } from './WikipediaSummaryDisplay';
import { IncorrectMatchNotice } from './IncorrectMatchNotice';

type WikipediaSummary = {
  extract: string;
  title: string;
  translated?: boolean;
  originalLanguage?: string;
  originalExtract?: string;
};

type Room = {
  id: number;
  name: string;
  slug: string;
  museumId: number;
  parentRoomId: number | null;
};

type Artifact = {
  id: number;
  name: string;
  localTitle: string | null;
  localTitleLanguage: string | null;
  englishTitle: string | null;
  slug: string;
  roomId: number;
  museumId: number;
  rawPlaqueText: string | null;
  knowledgeTextEn: string | null;
  furtherReading: string[];
  wikimediaImageUrl: string | null;
  wikipediaUrl: string | null;
};

type Content = {
  id: number;
  text: string;
  type: string | null;
  isAdultContent: boolean;
  sensitiveTopics: string[];
  subjectTags: string[];
  audioUrl: string | null;
  updatedAt?: string;
};

function resolveImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl.startsWith('/')) return `${API_URL}${imageUrl}`;
  return imageUrl;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ museum: string; artifact: string }>;
}): Promise<Metadata> {
  const { museum: museumSlug, artifact: artifactSlug } = await params;

  try {
    const artifact = await api<Artifact>(
      `/artifacts/by-slug/${artifactSlug}?museumSlug=${museumSlug}`
    ).catch(() => null);
    if (artifact) {
      return {
        title: artifact.localTitle || artifact.name,
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    title: 'Artifact',
  };
}

export default async function ArtifactPage({
  params,
  searchParams,
}: {
  params: Promise<{ museum: string; artifact: string }>;
  searchParams: Promise<{ scanMatched?: string }>;
}) {
  const { museum: museumSlug, artifact: artifactSlug } = await params;
  const query = await searchParams;

  // Fetch museum by slug
  const museum = await api<MuseumResponse>(
    `/museums/by-slug/${museumSlug}`
  ).catch(() => null);

  if (!museum) {
    notFound();
  }

  // Fetch artifact by slug
  const artifact = await api<Artifact>(
    `/artifacts/by-slug/${artifactSlug}?museumSlug=${museumSlug}`
  ).catch(() => null);

  if (!artifact) {
    notFound();
  }

  // Validate artifact belongs to museum
  if (artifact.museumId !== museum.id) {
    notFound();
  }

  // Fetch room for back navigation
  const artifactRoom = await api<Room>(`/rooms/${artifact.roomId}`).catch(
    () => null
  );

  // Fetch content and Wikipedia summary in parallel
  const [content, wikipediaSummary] = await Promise.all([
    api<Content[]>(`/artifacts/${artifact.id}/content`).catch(() => []),
    artifact.wikipediaUrl
      ? api<WikipediaSummary>(
          `/wikipedia/summary?url=${encodeURIComponent(artifact.wikipediaUrl)}`
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Show the most recently updated introduction
  const introductions = content
    .filter((c) => c.type === 'introduction')
    .sort(
      (a, b) =>
        new Date(b.updatedAt ?? 0).getTime() -
        new Date(a.updatedAt ?? 0).getTime()
    );
  const artifactMain =
    introductions[0] ||
    content.find((c) => c.type === 'artifactMain') ||
    content[0];
  const qaItems = content.filter((c) => c.type === 'qa').slice(0, 3);
  const followups = content.filter((c) => c.type === 'followup').slice(0, 3);
  const artifactImageUrl = resolveImageUrl(artifact.wikimediaImageUrl);

  // Aggregate tags across all content
  const hasAdultContent = content.some((c) => c.isAdultContent);
  const allSensitiveTopics = [
    ...new Set(content.flatMap((c) => c.sensitiveTopics)),
  ];
  const allSubjectTags = [...new Set(content.flatMap((c) => c.subjectTags))];

  return (
    <AdminPageLayout
      title={artifact.localTitle || artifact.name}
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link
            href={
              artifactRoom
                ? `/${museumSlug}/rooms/${artifactRoom.slug}`
                : `/${museumSlug}`
            }
          >
            {artifactRoom ? 'Back to Room' : 'Back to Museum'}
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        {artifact.englishTitle &&
          artifact.englishTitle !== (artifact.localTitle || artifact.name) && (
            <p className="text-muted-foreground">
              {artifact.localTitle || artifact.name} ({artifact.englishTitle})
            </p>
          )}

        {query.scanMatched === '1' && <IncorrectMatchNotice />}

        {/* Content Tags */}
        {(hasAdultContent ||
          allSensitiveTopics.length > 0 ||
          allSubjectTags.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {hasAdultContent && (
              <Badge variant="destructive">Adult Content</Badge>
            )}
            {allSensitiveTopics.map((topic) => (
              <Badge
                key={topic}
                variant="outline"
                className="border-amber-500 text-amber-700"
              >
                {topic}
              </Badge>
            ))}
            {allSubjectTags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Two-column layout for About and Introduction */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Artifact Details - Left */}
          <SectionCard title="About">
            <div className="space-y-4">
              {/* Image */}
              {artifactImageUrl && (
                <div className="overflow-hidden rounded-lg bg-muted inline-block">
                  <img
                    src={artifactImageUrl}
                    alt={artifact.name}
                    className="max-w-sm max-h-96 object-contain"
                  />
                </div>
              )}

              {/* Wikipedia Summary */}
              {wikipediaSummary?.extract && (
                <WikipediaSummaryDisplay
                  extract={wikipediaSummary.extract}
                  translated={wikipediaSummary.translated}
                  originalLanguage={wikipediaSummary.originalLanguage}
                  originalExtract={wikipediaSummary.originalExtract}
                />
              )}

              {!wikipediaSummary?.extract && artifact.knowledgeTextEn && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Knowledge
                  </h4>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {artifact.knowledgeTextEn}
                  </p>
                </div>
              )}

              {/* Plaque Information */}
              {artifact.rawPlaqueText && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Plaque Information
                  </h4>
                  <p className="text-primary leading-relaxed whitespace-pre-wrap">
                    {artifact.rawPlaqueText}
                  </p>
                </div>
              )}

              {/* Wikipedia Link */}
              {artifact.wikipediaUrl && (
                <div className="pt-2">
                  <a
                    href={artifact.wikipediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Globe className="h-4 w-4" />
                    View on Wikipedia
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Introduction Section - Right */}
          <ArtifactIntroduction
            artifactId={artifact.id}
            initialContent={
              artifactMain && artifactMain.text.trim() ? artifactMain : null
            }
          />
        </div>

        {/* Q&A Items */}
        {qaItems.length > 0 && (
          <SectionCard title="Common Questions">
            <div className="space-y-4">
              {qaItems.map((qa) => {
                if (!qa.text.trim()) return null;
                return (
                  <div key={qa.id}>
                    <p className="text-primary leading-relaxed">{qa.text}</p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* Follow-up Content */}
        {followups.length > 0 && qaItems.length === 0 && (
          <SectionCard title="Learn More">
            <div className="space-y-4">
              {followups.map((followup) => {
                if (!followup.text.trim()) return null;
                return (
                  <div key={followup.id}>
                    <p className="text-primary leading-relaxed">
                      {followup.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}
      </div>
    </AdminPageLayout>
  );
}
