import dotenv from 'dotenv';
import { resolve } from 'path';
import { createHash } from 'crypto';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { prisma } from '@repo/db';
import type { Prisma } from '@repo/db';
import type {
  MuseumResponse,
  RoomResponse,
  ArtifactResponse,
} from '@repo/types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { mkdir } from 'fs/promises';
import { existsSync } from 'node:fs';
import {
  generateAudioForArtifactQuestion,
  generateAudioForContent,
  parseTtsProvider,
  getDefaultTtsProvider,
} from './lib/audio';
import {
  generateIntroduction,
  SpendLimitError,
} from './lib/llm/generate-content';
import { createProvider } from './lib/llm';
import {
  buildIntroductionPrompt,
  buildMuseumGuideSystemPrompt,
  buildQuestionAnswerPrompt,
} from './lib/llm/prompt-templates';
import {
  checkDailySpendLimit,
  checkSpendLimit,
  getMonthlySpendEur,
  recordUsage,
} from './lib/llm/cost-tracker';
import { sanitizeSensitiveTopics, sanitizeSubjectTags } from './lib/llm/types';
import {
  assertTextAllowedForLlm,
  moderateTextForLlm,
} from './lib/llm/moderation';
import { initLangfuse } from './lib/telemetry/langfuse';
import { recordApiCall } from './lib/telemetry/api-call-tracker';
import {
  queryWikidata,
  buildMuseumQuery,
  buildNearbyMuseumsQuery,
  buildArtifactsQuery,
  extractQId,
  searchWikidata,
  searchWikidataLocations,
  fetchWikidataEntity,
  fetchWikipediaSummary,
  fetchWikipediaSummaryWithTranslation,
  parseArtifactResults,
  type WikidataArtifactBinding,
} from './lib/wikidata';
import type { WikidataSearchResult } from '@repo/types';
import {
  extractTextFromImage,
  parseOcrProvider,
  getDefaultOcrProvider,
  searchDuplicatesFromRawText,
  extractArtifactDraft,
  searchDuplicatesFromDraft,
  createArtifactAndAssets,
  buildArtifactDisplayTitle,
} from './lib/artifact-scan';
import { generateSlug } from './lib/slug';
import { buildUniqueArtifactSlug } from './lib/artifact-slug';
import {
  authVerificationRateLimit,
  attachActorIfPresent,
  requireAuth,
  requireAdmin,
} from './middleware/auth';
import {
  enforceUsageLimits,
  enforceSignupPolicy,
  getUserUsageForToday,
  enforcePlaqueScanLimit,
} from './lib/usage-limits';
import { GLOBAL_DAILY_LIMITS } from './lib/usage-limit-constants';

// Load environment variables - check multiple locations
dotenv.config({ path: resolve(__dirname, '../../../.env') });
dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(__dirname, '../../web/.env.local') });

const app = express();
const PORT = process.env.PORT || 3001;
const ENABLE_DB_QUERY_BILLING_LOGS = process.env.DB_QUERY_BILLING_LOGS !== '0';
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS ?? 0);

if (Number.isFinite(TRUST_PROXY_HOPS) && TRUST_PROXY_HOPS > 0) {
  app.set('trust proxy', TRUST_PROXY_HOPS);
}

function shouldLogDbQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  if (normalized.includes('"apicall"')) return false;
  if (normalized.includes('_prisma_migrations')) return false;
  return true;
}

// Enable CORS for all routes
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

app.use(express.json({ limit: '20mb' }));
app.use(authVerificationRateLimit);
app.use(attachActorIfPresent);

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const path = req.path;
    if (path.startsWith('/admin/api-calls')) {
      return;
    }

    recordApiCall({
      service: 'API',
      endpoint: `${req.method} ${path}`,
      durationMs: Date.now() - startedAt,
      status: res.statusCode >= 400 ? 'error' : 'success',
      statusCode: res.statusCode,
      metadata: {
        userUid: req.actor?.uid ?? null,
        isAdmin: req.actor?.isAdmin ?? null,
        usageDelta:
          (res.locals as { usageDelta?: Record<string, number> }).usageDelta ??
          null,
      },
    });
  });

  next();
});

// Serve static audio files
const audioDir = resolve(__dirname, '../public/audio');
if (!existsSync(audioDir)) {
  mkdir(audioDir, { recursive: true }).catch(() => {});
}
app.use('/audio', express.static(audioDir));

const uploadsDir = resolve(__dirname, '../public/uploads');
if (!existsSync(uploadsDir)) {
  mkdir(uploadsDir, { recursive: true }).catch(() => {});
}
app.use('/uploads', express.static(uploadsDir));

if (ENABLE_DB_QUERY_BILLING_LOGS) {
  (prisma as any).$on('query', (event: any) => {
    const query = typeof event?.query === 'string' ? event.query : '';
    if (!query || !shouldLogDbQuery(query)) {
      return;
    }

    const firstWord = query.trim().split(/\s+/)[0]?.toUpperCase() || 'QUERY';
    const target = typeof event?.target === 'string' ? event.target : 'prisma';
    const durationMs = typeof event?.duration === 'number' ? event.duration : 0;

    recordApiCall({
      service: 'Database',
      endpoint: `prisma.${firstWord.toLowerCase()}`,
      durationMs,
      status: 'success',
      metadata: {
        target,
      },
    });
  });
}

app.get('/auth/status', requireAuth, async (req, res) => {
  if (!req.actor) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const allowed = await enforceSignupPolicy({ actor: req.actor, res });
  if (!allowed) {
    return;
  }

  const usage = await getUserUsageForToday(req.actor.uid);
  res.json({
    uid: req.actor.uid,
    email: req.actor.email ?? null,
    displayName: req.actor.displayName ?? null,
    isAdmin: req.actor.isAdmin,
    usage,
  });
});

app.get('/account/usage', requireAuth, async (req, res) => {
  if (!req.actor) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const allowed = await enforceSignupPolicy({ actor: req.actor, res });
  if (!allowed) {
    return;
  }

  const usage = await getUserUsageForToday(req.actor.uid);
  res.json({
    user: {
      uid: req.actor.uid,
      email: req.actor.email ?? null,
      displayName: req.actor.displayName ?? null,
      isAdmin: req.actor.isAdmin,
    },
    usage,
  });
});

app.get('/account/questions', requireAuth, async (req, res) => {
  if (!req.actor) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const questions = await prisma.artifactQuestion.findMany({
    where: { askedByUsername: req.actor.uid },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      artifact: { select: { slug: true, displayTitle: true } },
      museum: { select: { slug: true, name: true } },
    },
  });

  res.json(
    questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      answerText: q.answerText,
      status: q.status,
      upvotes: q.upvotes,
      askCount: q.askCount,
      createdAt: q.createdAt,
      artifact: { slug: q.artifact.slug, name: q.artifact.displayTitle },
      museum: { slug: q.museum.slug, name: q.museum.name },
    }))
  );
});

// ============================================================================
// MUSEUM, ROOM, AND ARTIFACT ENDPOINTS
// ============================================================================

// Helper function to calculate string similarity (Levenshtein distance ratio)
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // Use longest common subsequence ratio for better text similarity
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  // Check for substring match (one contains the other)
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  // Calculate Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= shorter.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= longer.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= shorter.length; i++) {
    for (let j = 1; j <= longer.length; j++) {
      if (shorter[i - 1] === longer[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[shorter.length][longer.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - distance / maxLength;
}

// Helper function to normalize URL for comparison
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove trailing slashes and normalize
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.replace(/\/$/, '')}`;
  } catch {
    return url.toLowerCase().trim();
  }
}

// POST /artifacts/check-duplicates - Check for potential duplicate artifacts
app.post(
  '/artifacts/check-duplicates',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { name, knowledgeText, furtherReading } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required' });
      }

      // Fetch all existing artifacts
      const existingArtifacts = await prisma.artifact.findMany({
        select: {
          id: true,
          displayTitle: true,
          rawPlaqueText: true,
          knowledgeTextEn: true,
          furtherReading: true,
          room: {
            select: {
              name: true,
              museum: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        } as Prisma.ArtifactSelect,
      });

      const duplicates: Array<{
        id: number;
        name: string;
        similarity: number;
        matchReasons: string[];
        rawPlaqueText?: string | null;
        knowledgeTextEn?: string | null;
        furtherReading: string[];
        roomName?: string | null;
        museumName?: string | null;
      }> = [];

      const normalizedNewUrls = (furtherReading || []).map(normalizeUrl);
      const newKnowledgeText = (knowledgeText || '').trim().toLowerCase();

      for (const artifact of existingArtifacts) {
        const artifactWithFields = artifact as typeof artifact & {
          rawPlaqueText: string | null;
          knowledgeTextEn: string | null;
          furtherReading: string[];
          room: {
            name: string;
            museum: { id: number; name: string } | null;
          } | null;
        };
        const matchReasons: string[] = [];
        let maxSimilarity = 0;

        // Check name similarity
        const nameSimilarity = stringSimilarity(name, artifact.displayTitle);
        if (nameSimilarity >= 0.7) {
          matchReasons.push(
            `Name similarity: ${Math.round(nameSimilarity * 100)}%`
          );
          maxSimilarity = Math.max(maxSimilarity, nameSimilarity);
        }

        // Check plaque/knowledge text similarity
        const existingText =
          artifactWithFields.rawPlaqueText ||
          artifactWithFields.knowledgeTextEn;
        if (newKnowledgeText && existingText) {
          const knowledgeSimilarity = stringSimilarity(
            newKnowledgeText,
            existingText.trim().toLowerCase()
          );
          if (knowledgeSimilarity >= 0.6) {
            matchReasons.push(
              `Knowledge text similarity: ${Math.round(knowledgeSimilarity * 100)}%`
            );
            maxSimilarity = Math.max(maxSimilarity, knowledgeSimilarity);
          }

          // Also check for substring matches (one contains significant portion of the other)
          const shorter =
            newKnowledgeText.length < existingText.length
              ? newKnowledgeText
              : existingText.trim().toLowerCase();
          const longer =
            newKnowledgeText.length >= existingText.length
              ? newKnowledgeText
              : existingText.trim().toLowerCase();

          if (shorter.length > 50 && longer.includes(shorter)) {
            const substringRatio = shorter.length / longer.length;
            if (substringRatio >= 0.5) {
              matchReasons.push(
                `Knowledge text contains significant overlap: ${Math.round(substringRatio * 100)}%`
              );
              maxSimilarity = Math.max(maxSimilarity, substringRatio);
            }
          }
        }

        // Check furtherReading URL matches
        const artifactUrls = (artifactWithFields.furtherReading || []).map(
          normalizeUrl
        );
        const matchingUrls = normalizedNewUrls.filter((url: string) =>
          artifactUrls.some((artifactUrl: string) => {
            // Exact match
            if (url === artifactUrl) return true;
            // Similar URLs (same domain and similar path)
            try {
              const url1 = new URL(url);
              const url2 = new URL(artifactUrl);
              if (url1.host === url2.host) {
                const path1 = url1.pathname.toLowerCase();
                const path2 = url2.pathname.toLowerCase();
                return stringSimilarity(path1, path2) >= 0.8;
              }
            } catch {
              // If URL parsing fails, use string similarity
              return stringSimilarity(url, artifactUrl) >= 0.9;
            }
            return false;
          })
        );

        if (matchingUrls.length > 0) {
          matchReasons.push(
            `Shared ${matchingUrls.length} further reading URL${matchingUrls.length > 1 ? 's' : ''}`
          );
          // Boost similarity score for URL matches
          maxSimilarity = Math.max(maxSimilarity, 0.6);
        }

        // If we found any matches, add to duplicates list
        if (matchReasons.length > 0 && maxSimilarity >= 0.5) {
          duplicates.push({
            id: artifact.id,
            name: artifact.displayTitle,
            similarity: maxSimilarity,
            matchReasons,
            rawPlaqueText: artifactWithFields.rawPlaqueText,
            knowledgeTextEn: artifactWithFields.knowledgeTextEn,
            furtherReading: artifactWithFields.furtherReading || [],
            roomName: artifactWithFields.room?.name || null,
            museumName: artifactWithFields.room?.museum?.name || null,
          });
        }
      }

      // Sort by similarity (highest first)
      duplicates.sort((a, b) => b.similarity - a.similarity);

      res.json({
        duplicates,
        totalChecked: existingArtifacts.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to check duplicates';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// ============================================================================
// MUSEUM SEARCH API - Search-first flow
// ============================================================================

// GET /api/museums/search - Search both database and Wikidata for museums
app.get('/api/museums/search', async (req, res) => {
  try {
    const query = req.query.q as string;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters',
      });
    }

    const searchTerm = query.trim();

    // Search database first (case-insensitive)
    const localMuseums = await prisma.museum.findMany({
      where: {
        name: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      },
      take: 5,
      orderBy: { name: 'asc' },
    });

    const localResults = localMuseums.map((museum) => ({
      qid: museum.wikidataId || `local-${museum.id}`,
      label: museum.name,
      description: museum.citySlug
        ? `Museum in ${museum.citySlug}`
        : 'Museum in your collection',
      isLocal: true,
      slug: museum.slug,
    }));

    // Search Wikidata
    const wikidataResults = await searchWikidata(searchTerm, 10);

    // Filter out Wikidata results that are already in local results
    const localQids = new Set(
      localMuseums.map((m) => m.wikidataId).filter(Boolean)
    );
    const filteredByLocalQid = wikidataResults.filter(
      (r) => !localQids.has(r.qid)
    );
    const resultsWithWikipedia = await Promise.all(
      filteredByLocalQid.map(async (result) => {
        try {
          const details = await fetchWikidataEntity(result.qid);
          return details?.wikipediaUrl ? result : null;
        } catch {
          return null;
        }
      })
    );

    const filteredWikidataResults = resultsWithWikipedia
      .filter((result): result is WikidataSearchResult => result !== null)
      .map((r) => ({ ...r, isLocal: false }));

    res.json({
      query: searchTerm,
      local: localResults,
      wikidata: filteredWikidataResults,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to search museums';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /api/museums/search/wikidata - Search Wikidata only (for explicit search button)
app.get('/api/museums/search/wikidata', async (req, res) => {
  try {
    const query = req.query.q as string;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters',
      });
    }

    const searchTerm = query.trim();

    // Search Wikidata only
    const wikidataResults = await searchWikidata(searchTerm, 100);
    const withWikipedia = await Promise.all(
      wikidataResults.map(async (result) => {
        try {
          const details = await fetchWikidataEntity(result.qid);
          return details?.wikipediaUrl ? result : null;
        } catch {
          return null;
        }
      })
    );
    const filteredResults = withWikipedia.filter(
      (result): result is WikidataSearchResult => result !== null
    );

    res.json({
      query: searchTerm,
      results: filteredResults,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to search Wikidata';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /api/museums/search/location - Search for museums by location/city name
app.get('/api/museums/search/location', async (req, res) => {
  try {
    const query = req.query.q as string;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters',
      });
    }

    const searchTerm = query.trim();

    // Find matching locations
    const locations = await searchWikidataLocations(searchTerm, 3);

    if (locations.length === 0) {
      return res.json({
        query: searchTerm,
        location: null,
        museums: [],
      });
    }

    // Take the first (best) match and find museums in that location
    const location = locations[0];
    const sparqlQuery = buildMuseumQuery(location.qid);
    const results = await queryWikidata(sparqlQuery);

    const museums = results
      .map((binding) => {
        const museumUri = binding.museum?.value;
        const museumLabel = binding.museumLabel?.value;
        if (!museumUri || !museumLabel) return null;
        const wikidataId = extractQId(museumUri);
        if (!wikidataId) return null;
        return { qid: wikidataId, label: museumLabel };
      })
      .filter((m): m is { qid: string; label: string } => m !== null);

    res.json({
      query: searchTerm,
      location: {
        qid: location.qid,
        label: location.label,
        description: location.description,
      },
      museums,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to search museums by location';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /api/museums/search/nearby - Search for museums near coordinates
app.get('/api/museums/search/nearby', async (req, res) => {
  const requestStartNs = process.hrtime.bigint();
  let lastMarkNs = requestStartNs;
  const elapsedMs = (startNs: bigint, endNs: bigint) =>
    Number(endNs - startNs) / 1_000_000;
  const markStage = (label: string) => {
    const nowNs = process.hrtime.bigint();
    const stageMs = elapsedMs(lastMarkNs, nowNs);
    const totalMs = elapsedMs(requestStartNs, nowNs);
    lastMarkNs = nowNs;
    console.log(
      `[Nearby Search] ${label} stage=${stageMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms`
    );
  };

  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKmRaw = Number(req.query.radiusKm ?? 5);
    const limitRaw = Number(req.query.limit ?? 20);

    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({
        error:
          'Invalid coordinates. Expected lat in [-90, 90] and lng in [-180, 180].',
      });
    }

    const radiusKm = Math.min(Math.max(radiusKmRaw || 5, 1), 100);
    const limit = Math.min(Math.max(limitRaw || 20, 1), 100);
    console.log(
      `[Nearby Search] Start lat=${lat} lng=${lng} radiusKm=${radiusKm} limit=${limit}`
    );
    markStage('validated-input');

    const sparqlQuery = buildNearbyMuseumsQuery(lat, lng, radiusKm, limit);
    type NearbyBinding = {
      museum?: { value: string };
      museumLabel?: { value: string };
      museumDescription?: { value: string };
      distance?: { value: string };
      location?: { value: string };
    };
    const results = await queryWikidata<NearbyBinding>(sparqlQuery);
    console.log(`[Nearby Search] SPARQL returned ${results.length} rows`);
    markStage('sparql-finished');
    type NearbyMuseumItem = {
      qid: string;
      label: string;
      description?: string;
      distanceKm: number;
      coordinates?: { lat: number; lng: number };
    };

    const parseWktPoint = (
      wkt: string | undefined
    ): { lat: number; lng: number } | null => {
      if (!wkt) return null;
      const match = /^Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/.exec(wkt);
      if (!match) return null;
      const lngVal = Number(match[1]);
      const latVal = Number(match[2]);
      if (Number.isNaN(latVal) || Number.isNaN(lngVal)) return null;
      return { lat: latVal, lng: lngVal };
    };

    const museums = results
      .map((binding): NearbyMuseumItem | null => {
        const museumUri = binding.museum?.value;
        const museumLabel = binding.museumLabel?.value;
        if (!museumUri || !museumLabel) return null;
        const qid = extractQId(museumUri);
        if (!qid) return null;

        const distance = Number(binding.distance?.value);
        const coordinates = parseWktPoint(binding.location?.value) ?? undefined;
        return {
          qid,
          label: museumLabel,
          description: binding.museumDescription?.value,
          distanceKm: Number.isNaN(distance)
            ? Number.POSITIVE_INFINITY
            : distance,
          coordinates,
        };
      })
      .filter((museum): museum is NearbyMuseumItem => museum !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    console.log(`[Nearby Search] Parsed ${museums.length} museums`);

    // Deduplicate by QID; keep the closest row when a museum has multiple coordinates.
    const dedupedByQid = new Map<string, NearbyMuseumItem>();
    for (const museum of museums) {
      const existing = dedupedByQid.get(museum.qid);
      if (!existing || museum.distanceKm < existing.distanceKm) {
        dedupedByQid.set(museum.qid, museum);
      }
    }
    const dedupedMuseums = Array.from(dedupedByQid.values()).sort(
      (a, b) => a.distanceKm - b.distanceKm
    );
    console.log(
      `[Nearby Search] Deduped to ${dedupedMuseums.length} museums by QID`
    );
    markStage('parsed-results');

    res.json({
      center: { lat, lng },
      radiusKm,
      results: dedupedMuseums,
    });
    markStage('response-sent');
  } catch (error) {
    console.error('[Nearby Search] Failed:', error);
    markStage('error');
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to search nearby museums';
    res.status(500).json({ error: errorMessage });
  }
});

// POST /api/museums/select/:qid - Select and enrich a museum by QID
app.post(
  '/api/museums/select/:qid',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (!req.actor) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const signupAllowed = await enforceSignupPolicy({ actor: req.actor, res });
    if (!signupAllowed) {
      return;
    }

    const allowed = await enforceUsageLimits({
      res,
      actor: req.actor,
      globalIncrements: { dbOps: 1, wikiCalls: 1 },
      userIncrements: { wikiCalls: 1 },
    });
    if (!allowed) {
      return;
    }

    const { qid } = req.params;

    // Validate QID format
    if (!/^Q\d+$/.test(qid)) {
      return res.status(400).json({
        error: `Invalid QID format: ${qid}. Expected format: Q followed by numbers (e.g., Q33506)`,
      });
    }

    try {
      const missingWikipediaError =
        'This Wikidata result has no linked Wikipedia article, so it is likely not a real museum record. Please select a different result.';
      const getMuseumUpdateData = (
        existingMuseum: {
          wikipediaUrl: string | null;
          image: string | null;
          coordinates: unknown;
          locationTags: string[];
        },
        details: {
          wikipediaUrl?: string;
          image?: string;
          coordinates?: { lat: number; lng: number };
          locationLabels: string[];
        }
      ) => ({
        wikipediaUrl: details.wikipediaUrl || existingMuseum.wikipediaUrl,
        image: details.image || existingMuseum.image,
        coordinates: details.coordinates
          ? details.coordinates
          : ((existingMuseum.coordinates as {
              lat: number;
              lng: number;
            } | null) ?? undefined),
        locationTags:
          existingMuseum.locationTags.length > 0
            ? existingMuseum.locationTags
            : details.locationLabels,
      });

      // Check if museum already exists in DB
      const existingMuseum = await prisma.museum.findUnique({
        where: { wikidataId: qid },
      });

      if (existingMuseum) {
        const needsEnrichment =
          !existingMuseum.wikipediaUrl ||
          !existingMuseum.image ||
          !existingMuseum.coordinates ||
          existingMuseum.locationTags.length === 0;

        const details = needsEnrichment ? await fetchWikidataEntity(qid) : null;

        // Existing records must have a Wikipedia URL to be considered valid museum selections
        if (!existingMuseum.wikipediaUrl && !details?.wikipediaUrl) {
          return res.status(422).json({
            error: missingWikipediaError,
          });
        }

        if (details) {
          await prisma.museum.update({
            where: { wikidataId: qid },
            data: getMuseumUpdateData(existingMuseum, details),
          });
        }

        return res.json({
          created: false,
          museum: {
            id: existingMuseum.id,
            qid,
            slug: existingMuseum.slug,
            name: existingMuseum.name,
          },
        });
      }

      // Museum doesn't exist - fetch details from Wikidata and create
      const details = await fetchWikidataEntity(qid);

      if (!details) {
        return res.status(404).json({
          error: `Museum not found on Wikidata: ${qid}`,
        });
      }

      if (!details.wikipediaUrl) {
        return res.status(422).json({
          error: missingWikipediaError,
        });
      }

      const museumName =
        typeof details.label === 'string' && details.label.trim().length > 0
          ? details.label.trim()
          : qid;
      const rawSlug = generateSlug(museumName);
      const museumSlug =
        rawSlug.length > 0 ? rawSlug : `museum-${qid.toLowerCase()}`;

      // Create the museum
      const createAllowed = await enforceUsageLimits({
        res,
        actor: req.actor,
        globalIncrements: { museumCreates: 1 },
        userIncrements: { museumCreates: 1 },
      });
      if (!createAllowed) {
        return;
      }

      const museum = await prisma.museum.create({
        data: {
          name: museumName,
          slug: museumSlug,
          wikidataId: qid,
          wikipediaUrl: details.wikipediaUrl,
          image: details.image || null,
          coordinates: details.coordinates ?? undefined,
          locationTags: details.locationLabels || [],
          knowledgeText: null,
          furtherReading: [],
          updatedAt: new Date(),
        },
      });

      (res.locals as { usageDelta?: Record<string, number> }).usageDelta = {
        museumCreates: 1,
        wikiCalls: 1,
      };

      res.json({
        created: true,
        museum: {
          id: museum.id,
          qid,
          slug: museum.slug,
          name: museum.name,
        },
      });
    } catch (error: unknown) {
      // Handle slug collision
      const prismaError = error as {
        code?: string;
        meta?: { modelName?: string };
      };
      if (
        prismaError.code === 'P2002' &&
        prismaError.meta?.modelName === 'Museum'
      ) {
        // If creation failed due to uniqueness, try resolving a now-existing row
        // without making another Wikidata request (which may be rate-limited).
        const existingByQid = await prisma.museum.findUnique({
          where: { wikidataId: qid },
        });

        if (existingByQid) {
          return res.json({
            created: false,
            museum: {
              id: existingByQid.id,
              qid: existingByQid.wikidataId || qid,
              slug: existingByQid.slug,
              name: existingByQid.name,
            },
          });
        }

        return res.status(409).json({
          error: 'A museum with a similar name already exists',
        });
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to select museum';
      if (
        errorMessage.includes('Wikidata entity fetch failed: 429') ||
        errorMessage.includes('Wikidata search failed: 429')
      ) {
        return res.status(503).json({
          error:
            'Wikidata is rate-limiting requests right now. Please wait a moment and try again.',
        });
      }

      res.status(500).json({ error: errorMessage });
    }
  }
);

// ============================================================================
// MUSEUM HYDRATION ENDPOINTS
// ============================================================================

const HYDRATION_CACHE_DAYS = 7;

function isRecentlyHydrated(timestamp: Date | null): boolean {
  if (!timestamp) return false;
  const daysSince = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince < HYDRATION_CACHE_DAYS;
}

// POST /api/museums/:slug/hydrate - Hydrate museum details from Wikidata/Wikipedia
app.post(
  '/api/museums/:slug/hydrate',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { slug } = req.params;
    const force = req.query.force === '1';

    try {
      // Find museum by slug
      const museum = await prisma.museum.findFirst({
        where: { slug },
      });

      if (!museum) {
        return res.status(404).json({
          error: 'Museum not found. Use /search to find and add museums.',
        });
      }

      // Check cache unless force refresh
      if (!force && isRecentlyHydrated(museum.museumHydratedAt)) {
        return res.json({
          cached: true,
          museum: {
            id: museum.id,
            name: museum.name,
            slug: museum.slug,
            description: museum.description,
            wikipediaSummary: museum.wikipediaSummary,
            wikipediaUrl: museum.wikipediaUrl,
            image: museum.image,
            coordinates: museum.coordinates,
            officialWebsite: museum.officialWebsite,
            museumHydratedAt: museum.museumHydratedAt,
          },
        });
      }

      // Require wikidataId to hydrate
      if (!museum.wikidataId) {
        return res.status(400).json({
          error: 'Museum missing wikidataId. Cannot hydrate from Wikidata.',
        });
      }

      // Fetch details from Wikidata
      const details = await fetchWikidataEntity(museum.wikidataId);
      if (!details) {
        return res.status(502).json({
          error: 'Failed to fetch museum details from Wikidata',
        });
      }

      // Fetch Wikipedia summary if we have a URL
      let wikipediaSummary: string | null = null;
      const wikipediaUrl = details.wikipediaUrl || museum.wikipediaUrl;
      if (wikipediaUrl) {
        const summary = await fetchWikipediaSummary(wikipediaUrl);
        if (summary) {
          wikipediaSummary = summary.extract;
        }
      }

      // Update museum with hydrated data
      const updatedMuseum = await prisma.museum.update({
        where: { id: museum.id },
        data: {
          description: details.description || museum.description,
          wikipediaSummary: wikipediaSummary || museum.wikipediaSummary,
          wikipediaUrl: wikipediaUrl || museum.wikipediaUrl,
          image: details.image || museum.image,
          coordinates: details.coordinates ?? museum.coordinates ?? undefined,
          officialWebsite: details.officialWebsite || museum.officialWebsite,
          locationTags:
            details.locationLabels.length > 0
              ? details.locationLabels
              : museum.locationTags,
          museumHydratedAt: new Date(),
        } as any,
      });

      res.json({
        cached: false,
        museum: {
          id: updatedMuseum.id,
          name: updatedMuseum.name,
          slug: updatedMuseum.slug,
          description: updatedMuseum.description,
          wikipediaSummary: updatedMuseum.wikipediaSummary,
          wikipediaUrl: updatedMuseum.wikipediaUrl,
          image: updatedMuseum.image,
          coordinates: updatedMuseum.coordinates,
          officialWebsite: updatedMuseum.officialWebsite,
          museumHydratedAt: updatedMuseum.museumHydratedAt,
        },
      });
    } catch (error) {
      // Return 502 for Wikidata/Wikipedia service errors
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to hydrate museum';
      if (
        errorMessage.includes('Wikidata') ||
        errorMessage.includes('Wikipedia') ||
        errorMessage.includes('timeout')
      ) {
        return res.status(502).json({ error: errorMessage });
      }

      res.status(500).json({ error: errorMessage });
    }
  }
);

// POST /api/museums/:slug/hydrate-artifacts - Hydrate artifacts from Wikidata
app.post(
  '/api/museums/:slug/hydrate-artifacts',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { slug } = req.params;
    const force = req.query.force === '1';

    try {
      if (!req.actor) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const signupAllowed = await enforceSignupPolicy({
        actor: req.actor,
        res,
      });
      if (!signupAllowed) {
        return;
      }

      // Find museum by slug
      const museum = await prisma.museum.findFirst({
        where: { slug },
      });

      if (!museum) {
        return res.status(404).json({
          error: 'Museum not found. Use /search to find and add museums.',
        });
      }

      // Check cache unless force refresh
      if (!force && isRecentlyHydrated(museum.artifactsHydratedAt)) {
        const artifacts = await prisma.artifact.findMany({
          where: { museumId: museum.id },
          select: {
            id: true,
            displayTitle: true,
            slug: true,
            wikidataId: true,
            wikipediaUrl: true,
            wikimediaImageUrl: true,
          },
          orderBy: { displayTitle: 'asc' },
        });

        return res.json({
          cached: true,
          museumId: museum.id,
          artifacts: artifacts.map((artifact) => ({
            id: artifact.id,
            name: artifact.displayTitle,
            slug: artifact.slug,
            wikidataId: artifact.wikidataId,
            wikipediaUrl: artifact.wikipediaUrl,
            wikimediaImageUrl: artifact.wikimediaImageUrl,
          })),
          artifactsHydratedAt: museum.artifactsHydratedAt,
        });
      }

      // Require wikidataId to hydrate
      if (!museum.wikidataId) {
        return res.status(400).json({
          error:
            'Museum missing wikidataId. Cannot hydrate artifacts from Wikidata.',
        });
      }

      // Query Wikidata for artifacts
      const sparqlQuery = buildArtifactsQuery(museum.wikidataId);
      const bindings =
        await queryWikidata<WikidataArtifactBinding>(sparqlQuery);
      const artifactsFromWikidata = parseArtifactResults(bindings);

      // Upsert artifacts
      let upserted = 0;
      const artifactResults: any[] = [];

      for (const artifact of artifactsFromWikidata) {
        try {
          // Check if artifact exists by wikidataId
          const existing = await prisma.artifact.findUnique({
            where: { wikidataId: artifact.qid },
          });

          if (existing) {
            // Update existing artifact
            const artifactSlug = await buildUniqueArtifactSlug({
              museumId: museum.id,
              museumSlugOrName: museum.slug || museum.name,
              artifactName: artifact.label,
              currentArtifactId: existing.id,
            });
            const updated = await prisma.artifact.update({
              where: { wikidataId: artifact.qid },
              data: {
                displayTitle: artifact.label,
                slug: artifactSlug,
                wikipediaUrl: artifact.wikipediaUrl || existing.wikipediaUrl,
                wikimediaImageUrl: artifact.image || existing.wikimediaImageUrl,
              } as any,
            });
            artifactResults.push({
              id: updated.id,
              name: updated.displayTitle,
              slug: updated.slug,
              wikidataId: artifact.qid,
              wikipediaUrl: updated.wikipediaUrl,
              wikimediaImageUrl: updated.wikimediaImageUrl,
            });
          } else {
            // Create new artifact
            const artifactSlug = await buildUniqueArtifactSlug({
              museumId: museum.id,
              museumSlugOrName: museum.slug || museum.name,
              artifactName: artifact.label,
            });
            const created = await prisma.artifact.create({
              data: {
                displayTitle: artifact.label,
                slug: artifactSlug,
                museumId: museum.id,
                wikidataId: artifact.qid,
                wikipediaUrl: artifact.wikipediaUrl || null,
                wikimediaImageUrl: artifact.image || null,
                knowledgeTextEn: artifact.description || null,
                furtherReading: artifact.wikipediaUrl
                  ? [artifact.wikipediaUrl]
                  : [],
              } as any,
            });
            artifactResults.push({
              id: created.id,
              name: created.displayTitle,
              slug: created.slug,
              wikidataId: artifact.qid,
              wikipediaUrl: created.wikipediaUrl,
              wikimediaImageUrl: created.wikimediaImageUrl,
            });
            upserted++;
          }
        } catch (artifactError: any) {
          // Handle slug collision - skip this artifact
          if (artifactError?.code === 'P2002') {
            // Skip duplicates
          } else {
            throw artifactError;
          }
        }
      }

      // Update museum's artifactsHydratedAt timestamp
      await prisma.museum.update({
        where: { id: museum.id },
        data: { artifactsHydratedAt: new Date() } as any,
      });

      (res.locals as { usageDelta?: Record<string, number> }).usageDelta = {
        wikiCalls: 1,
      };

      res.json({
        cached: false,
        museumId: museum.id,
        artifacts: artifactResults,
        newArtifacts: upserted,
        artifactsHydratedAt: new Date(),
      });
    } catch (error) {
      // Return 502 for Wikidata service errors
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to hydrate artifacts';
      if (
        errorMessage.includes('Wikidata') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('query')
      ) {
        return res.status(502).json({ error: errorMessage });
      }

      res.status(500).json({ error: errorMessage });
    }
  }
);

// GET /museums - List all museums
app.get('/museums', async (req, res) => {
  try {
    const citySlug = req.query.citySlug as string | undefined;

    let museums: MuseumResponse[];
    if (citySlug) {
      // Use raw SQL query until Prisma client is regenerated with citySlug field
      museums = (await prisma.$queryRaw`
        SELECT * FROM "Museum" 
        WHERE "citySlug" = ${citySlug}
        ORDER BY id ASC
      `) as MuseumResponse[];
    } else {
      museums = await prisma.museum.findMany({
        orderBy: {
          id: 'asc',
        },
      });
    }
    res.json(museums);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch museums';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /museums/:id - Get a single museum by ID
app.get('/museums/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid museum ID' });
    }

    const museum = await prisma.museum.findUnique({
      where: { id },
    });

    if (!museum) {
      return res.status(404).json({ error: 'Museum not found' });
    }

    res.json(museum);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch museum';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /museums/by-slug/:slug - Get a single museum by slug
app.get('/museums/by-slug/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;

    // Use findFirst since Prisma doesn't recognize dbgenerated fields in WhereUniqueInput
    // The slug field has a unique constraint, so this will return at most one result
    const museum = await prisma.museum.findFirst({
      where: { slug } as Prisma.MuseumWhereInput,
    });

    if (!museum) {
      return res.status(404).json({ error: 'Museum not found' });
    }

    res.json(museum);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch museum';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /admin/rooms - List all rooms with museum info
app.get('/admin/rooms', requireAuth, requireAdmin, async (req, res) => {
  try {
    const museumId = req.query.museumId
      ? Number(req.query.museumId)
      : undefined;

    const where: any = {};

    if (museumId && !Number.isNaN(museumId)) {
      where.museumId = museumId;
    }

    const rooms: RoomResponse[] = await prisma.room.findMany({
      where,
      include: {
        museum: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    res.json(rooms);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch rooms';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /admin/artifacts - List all artifacts with room and museum info
app.get('/admin/artifacts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const museumId = req.query.museumId
      ? Number(req.query.museumId)
      : undefined;
    const roomId = req.query.roomId ? Number(req.query.roomId) : undefined;

    const where: any = {};

    if (roomId && !Number.isNaN(roomId)) {
      where.roomId = roomId;
    } else if (museumId && !Number.isNaN(museumId)) {
      // Get all rooms for this museum, then get their artifacts
      const rooms = await prisma.room.findMany({
        where: {
          museumId: museumId,
        },
        select: { id: true },
      });
      const roomIds = rooms.map((r) => r.id);
      // If no rooms, return empty array instead of querying with empty 'in'
      if (roomIds.length === 0) {
        return res.json([]);
      }
      where.roomId = {
        in: roomIds,
      };
    }

    // Fetch all rooms with their museum and parentRoom info to build a lookup map
    const allRooms = await prisma.room.findMany({
      select: {
        id: true,
        name: true,
        museumId: true,
        parentRoomId: true,
        museum: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Fetch all museums for direct lookup
    const allMuseums = await prisma.museum.findMany({
      select: {
        id: true,
        name: true,
      },
    });
    const museumMap = new Map(allMuseums.map((m) => [m.id, m]));

    // Build a map for quick lookup
    const roomMap = new Map(allRooms.map((room) => [room.id, room]));

    // Helper function to find museum by traversing up parent room chain
    const findMuseumForRoom = (
      roomId: number | null
    ): { id: number; name: string } | null => {
      if (!roomId) return null;
      const room = roomMap.get(roomId);
      if (!room) return null;

      // If room has museum directly, return it
      if (room.museum) {
        return room.museum;
      }

      // Otherwise, traverse up parent room chain
      if (room.parentRoomId) {
        return findMuseumForRoom(room.parentRoomId);
      }

      return null;
    };

    const artifacts = await prisma.artifact.findMany({
      where,
      include: {
        room: {
          select: {
            id: true,
            name: true,
            parentRoomId: true,
          },
        },
      } as Prisma.ArtifactInclude,
      orderBy: {
        id: 'asc',
      },
    });

    const response: ArtifactResponse[] = artifacts.map((artifact) => {
      // Type assertion to work around Prisma type inference issue
      const artifactWithRoom = artifact as typeof artifact & {
        roomId: number | null;
        museumId: number;
        displayTitle: string;
        slug: string;
        rawPlaqueText: string | null;
        furtherReading: string[];
        room: {
          id: number;
          name: string;
          parentRoomId: number | null;
        } | null;
      };

      // Find museum - use direct museumId if available, otherwise traverse room chain
      let museum: { id: number; name: string } | null = null;
      if (artifactWithRoom.museumId) {
        // Use direct museumId from artifact
        museum = museumMap.get(artifactWithRoom.museumId) || null;
      } else if (artifactWithRoom.room) {
        // Fallback to room chain traversal if no direct museumId
        museum = findMuseumForRoom(artifactWithRoom.room.id);
      }

      // Get parent room name
      const parentRoom = artifactWithRoom.room?.parentRoomId
        ? roomMap.get(artifactWithRoom.room.parentRoomId)
        : null;

      return {
        id: artifactWithRoom.id,
        name: artifactWithRoom.displayTitle,
        slug: artifactWithRoom.slug,
        roomId: artifactWithRoom.roomId,
        roomName: artifactWithRoom.room?.name || null,
        museumId: museum?.id || artifactWithRoom.museumId,
        museumName: museum?.name || null,
        rawPlaqueText: artifactWithRoom.rawPlaqueText,
        furtherReading: artifactWithRoom.furtherReading,
        parentRoomId: artifactWithRoom.room?.parentRoomId || null,
        parentRoomName: parentRoom?.name || null,
      };
    });
    res.json(response);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch artifacts';
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// CREATE AND UPDATE ENDPOINTS
// ============================================================================

app.post('/museums', requireAuth, requireAdmin, async (req, res) => {
  if (!req.actor) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const signupAllowed = await enforceSignupPolicy({ actor: req.actor, res });
  if (!signupAllowed) {
    return;
  }

  const limitsAllowed = await enforceUsageLimits({
    res,
    actor: req.actor,
    globalIncrements: { dbOps: 1, museumCreates: 1 },
    userIncrements: { museumCreates: 1 },
  });
  if (!limitsAllowed) {
    return;
  }

  const { name, knowledgeText, furtherReading } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const museum = await prisma.museum.create({
    data: {
      name,
      slug: generateSlug(name),
      knowledgeText: knowledgeText || null,
      furtherReading: furtherReading || [],
    } as Prisma.MuseumCreateInput,
  });

  (res.locals as { usageDelta?: Record<string, number> }).usageDelta = {
    museumCreates: 1,
  };

  res.json(museum);
});

// DELETE /museums/:id - Delete a museum
app.delete('/museums/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid museum ID' });
    }

    // Check if museum exists
    const museum = await prisma.museum.findUnique({
      where: { id },
    });

    if (!museum) {
      return res.status(404).json({ error: 'Museum not found' });
    }

    // Delete the museum (cascade will handle related rooms and artifacts)
    await prisma.museum.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to delete museum';
    res.status(500).json({ error: errorMessage });
  }
});

// DELETE /rooms/:id - Delete a room
app.delete('/rooms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid room ID' });
    }

    // Check if room exists
    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Delete the room (cascade will handle related child rooms and artifacts)
    await prisma.room.delete({
      where: { id },
    });

    res.status(204).send(); // No Content
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to delete room';
    res.status(500).json({ error: errorMessage });
  }
});

// DELETE /artifacts/:id - Delete an artifact
app.delete('/artifacts/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid artifact ID' });
    }

    // Check if artifact exists
    const artifact = await prisma.artifact.findUnique({
      where: { id },
    });

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    // Delete the artifact
    await prisma.artifact.delete({
      where: { id },
    });

    res.status(204).send(); // No Content
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to delete artifact';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/rooms', requireAuth, requireAdmin, async (req, res) => {
  const { name, museumId, parentRoomId, knowledgeText, furtherReading } =
    req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (!museumId) {
    return res.status(400).json({ error: 'museumId is required' });
  }

  const roomData: {
    name: string;
    slug: string;
    museumId: number;
    parentRoomId?: number | null;
    knowledgeText?: string | null;
    furtherReading?: string[];
  } = {
    name,
    slug: generateSlug(name),
    museumId,
  };

  if (parentRoomId) {
    roomData.parentRoomId = parentRoomId;
  }
  if (knowledgeText) {
    roomData.knowledgeText = knowledgeText;
  }
  if (furtherReading) {
    roomData.furtherReading = furtherReading;
  }

  const room = await prisma.room.create({
    data: roomData as any,
  });

  res.json(room);
});

app.get('/museums/:museumId/rooms', async (req, res) => {
  const museumId = Number(req.params.museumId);

  if (Number.isNaN(museumId)) {
    return res.status(400).json({ error: 'Invalid museumId' });
  }

  const rooms = await prisma.room.findMany({
    where: {
      museumId: museumId,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      museumId: true,
      createdAt: true,
    } as Prisma.RoomSelect,
    orderBy: {
      id: 'asc',
    },
  });

  res.json(rooms);
});

// GET /museums/:museumId/artifacts - Get all artifacts from all rooms in a museum (including child rooms) with slug
app.get('/museums/:museumId/artifacts', async (req, res) => {
  try {
    const museumId = Number(req.params.museumId);

    if (Number.isNaN(museumId)) {
      return res.status(400).json({ error: 'Invalid museumId' });
    }

    // Get all rooms directly attached to the museum
    const topLevelRooms = await prisma.room.findMany({
      where: {
        museumId: museumId,
      },
      select: { id: true },
    });

    // Get all child room IDs recursively for each top-level room
    const getAllChildRoomIds = async (parentId: number): Promise<number[]> => {
      const children = await prisma.room.findMany({
        where: { parentRoomId: parentId } as Prisma.RoomWhereInput,
        select: { id: true },
      });

      const childIds = children.map((c) => c.id);
      const allChildIds = [...childIds];

      // Recursively get children of children
      for (const childId of childIds) {
        const grandChildren = await getAllChildRoomIds(childId);
        allChildIds.push(...grandChildren);
      }

      return allChildIds;
    };

    // Collect all room IDs (top-level + all child rooms)
    const allRoomIds: number[] = [];
    for (const room of topLevelRooms) {
      allRoomIds.push(room.id);
      const childRoomIds = await getAllChildRoomIds(room.id);
      allRoomIds.push(...childRoomIds);
    }

    // If no rooms, return empty array
    if (allRoomIds.length === 0) {
      return res.json([]);
    }

    // Get all artifacts from all rooms
    const artifacts = await prisma.artifact.findMany({
      where: {
        roomId: {
          in: allRoomIds,
        },
      } as Prisma.ArtifactWhereInput,
      select: {
        id: true,
        displayTitle: true,
        slug: true,
        roomId: true,
        wikipediaUrl: true,
        wikimediaImageUrl: true,
        createdAt: true,
      } as Prisma.ArtifactSelect,
      orderBy: {
        id: 'asc',
      },
    });

    res.json(
      artifacts.map((artifact) => ({
        ...artifact,
        name: artifact.displayTitle,
      }))
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch artifacts';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /museums/:museumId/artifacts-recursive - Get all artifacts in a museum
app.get('/museums/:museumId/artifacts-recursive', async (req, res) => {
  try {
    const museumId = Number(req.params.museumId);

    if (Number.isNaN(museumId)) {
      return res.status(400).json({ error: 'Invalid museumId' });
    }

    const artifacts = await prisma.artifact.findMany({
      where: { museumId },
      select: {
        id: true,
        displayTitle: true,
        slug: true,
        roomId: true,
        wikipediaUrl: true,
        wikimediaImageUrl: true,
        createdAt: true,
      } as Prisma.ArtifactSelect,
      orderBy: {
        id: 'asc',
      },
    });

    res.json(
      artifacts.map((artifact) => ({
        ...artifact,
        name: artifact.displayTitle,
      }))
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to fetch artifacts for museum';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /rooms/:id - Get a single room by ID
app.get('/rooms/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid room ID' });
    }

    const room = await prisma.room.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        museumId: true,
        parentRoomId: true,
        knowledgeText: true,
        furtherReading: true,
      } as Prisma.RoomSelect,
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json(room);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch room';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /rooms/by-slug/:slug - Get a single room by slug (scoped by museumSlug query param)
app.get('/rooms/by-slug/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const museumSlug = req.query.museumSlug as string | undefined;

    const where: any = { slug };
    if (museumSlug) {
      where.museum = { slug: museumSlug };
    }

    const room = await prisma.room.findFirst({ where });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json(room);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch room';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/rooms/:roomId/artifacts', async (req, res) => {
  const roomId = Number(req.params.roomId);

  if (Number.isNaN(roomId)) {
    return res.status(400).json({ error: 'Invalid roomId' });
  }

  const artifacts = await prisma.artifact.findMany({
    where: {
      roomId: roomId,
    } as Prisma.ArtifactWhereInput,
    select: {
      id: true,
      displayTitle: true,
      slug: true,
      createdAt: true,
    } as Prisma.ArtifactSelect,
    orderBy: {
      id: 'asc',
    },
  });

  res.json(
    artifacts.map((artifact) => ({
      ...artifact,
      name: artifact.displayTitle,
    }))
  );
});

// GET /rooms/:id/children - Get child rooms for a parent room
app.get('/rooms/:id/children', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid room ID' });
    }

    const childRooms = await prisma.room.findMany({
      where: {
        parentRoomId: id,
      } as Prisma.RoomWhereInput,
      select: {
        id: true,
        name: true,
        slug: true,
        museumId: true,
        parentRoomId: true,
      } as Prisma.RoomSelect,
      orderBy: {
        id: 'asc',
      },
    });

    res.json(childRooms);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch child rooms';
    res.status(500).json({ error: errorMessage });
  }
});

// PATCH /rooms/:id - Update a room
app.patch('/rooms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid room ID' });
    }

    const { name, museumId, parentRoomId, knowledgeText, furtherReading } =
      req.body;

    // Validate that only one parent type is set
    if (museumId !== undefined && parentRoomId !== undefined) {
      if (museumId !== null && parentRoomId !== null) {
        return res.status(400).json({
          error: 'Cannot set both museumId and parentRoomId',
        });
      }
    }

    const updateData: {
      name?: string;
      museumId?: number | null;
      parentRoomId?: number | null;
      knowledgeText?: string | null;
      furtherReading?: string[];
    } = {};

    if (name !== undefined) {
      updateData.name = name;
    }
    if (museumId !== undefined) {
      updateData.museumId = museumId;
      // If setting museumId, clear parentRoomId
      if (museumId !== null) {
        updateData.parentRoomId = null;
      }
    }
    if (parentRoomId !== undefined) {
      updateData.parentRoomId = parentRoomId;
      // If setting parentRoomId, clear museumId
      if (parentRoomId !== null) {
        updateData.museumId = null;
      }
    }
    if (knowledgeText !== undefined) {
      updateData.knowledgeText = knowledgeText;
    }
    if (furtherReading !== undefined) {
      updateData.furtherReading = furtherReading;
    }

    const room = await prisma.room.update({
      where: { id },
      data: updateData as Prisma.RoomUpdateInput,
      select: {
        id: true,
        name: true,
        museumId: true,
        parentRoomId: true,
        knowledgeText: true,
        furtherReading: true,
      } as Prisma.RoomSelect,
    });

    res.json(room);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to update room';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /rooms/:id/artifacts-recursive - Get all artifacts from room and all child rooms
app.get('/rooms/:id/artifacts-recursive', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid room ID' });
    }

    // Get all child room IDs recursively
    const getAllChildRoomIds = async (parentId: number): Promise<number[]> => {
      const children = await prisma.room.findMany({
        where: { parentRoomId: parentId } as Prisma.RoomWhereInput,
        select: { id: true },
      });

      const childIds = children.map((c) => c.id);
      const allChildIds = [...childIds];

      // Recursively get children of children
      for (const childId of childIds) {
        const grandChildren = await getAllChildRoomIds(childId);
        allChildIds.push(...grandChildren);
      }

      return allChildIds;
    };

    const childRoomIds = await getAllChildRoomIds(id);
    const allRoomIds = [id, ...childRoomIds];

    // Get all artifacts from this room and all child rooms
    const artifacts = await prisma.artifact.findMany({
      where: {
        roomId: {
          in: allRoomIds,
        },
      } as Prisma.ArtifactWhereInput,
      select: {
        id: true,
        displayTitle: true,
        roomId: true,
        createdAt: true,
      } as Prisma.ArtifactSelect,
      orderBy: {
        id: 'asc',
      },
    });

    res.json(
      artifacts.map((artifact) => ({
        ...artifact,
        name: artifact.displayTitle,
      }))
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to fetch recursive artifacts';
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// PLAQUE SCAN PIPELINE ENDPOINTS
// ============================================================================

function parseMuseumId(value: string): number | null {
  const museumId = Number(value);
  if (Number.isNaN(museumId)) return null;
  return museumId;
}

app.post(
  '/museums/:museumId/scan/ocr',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      if (!req.actor) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const signupAllowed = await enforceSignupPolicy({
        actor: req.actor,
        res,
      });
      if (!signupAllowed) {
        return;
      }

      const scanAllowed = await enforcePlaqueScanLimit({
        res,
        actor: req.actor,
      });
      if (!scanAllowed) {
        return;
      }

      const museumId = parseMuseumId(req.params.museumId);
      const imageBase64 =
        typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : '';

      if (!museumId) {
        return res.status(400).json({ error: 'Invalid museumId' });
      }
      if (!imageBase64) {
        return res.status(400).json({ error: 'imageBase64 is required' });
      }
      const ocrProvider = parseOcrProvider(
        req.body?.provider,
        getDefaultOcrProvider()
      );

      const museum = await prisma.museum.findUnique({
        where: { id: museumId },
      });
      if (!museum) {
        return res.status(404).json({ error: 'Museum not found' });
      }

      const ocr = await extractTextFromImage(imageBase64, ocrProvider);
      if (!ocr.rawText.trim()) {
        return res.status(422).json({
          error:
            'Could not read text from plaque image. Try taking another photo.',
        });
      }

      res.json({
        museumId,
        rawText: ocr.rawText,
        ocr,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to read plaque text';
      res.status(500).json({ error: errorMessage });
    }
  }
);

app.post(
  '/museums/:museumId/scan/duplicates-raw',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const museumId = parseMuseumId(req.params.museumId);
      const rawText =
        typeof req.body?.rawText === 'string' ? req.body.rawText : '';

      if (!museumId) {
        return res.status(400).json({ error: 'Invalid museumId' });
      }
      if (!rawText.trim()) {
        return res.status(400).json({ error: 'rawText is required' });
      }

      const duplicates = await searchDuplicatesFromRawText(museumId, rawText);
      res.json(duplicates);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to search duplicates';
      res.status(500).json({ error: errorMessage });
    }
  }
);

app.post(
  '/museums/:museumId/scan/draft',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const museumId = parseMuseumId(req.params.museumId);
      const rawText =
        typeof req.body?.rawText === 'string' ? req.body.rawText : '';

      if (!museumId) {
        return res.status(400).json({ error: 'Invalid museumId' });
      }
      if (!rawText.trim()) {
        return res.status(400).json({ error: 'rawText is required' });
      }

      const museum = await prisma.museum.findUnique({
        where: { id: museumId },
        select: { id: true, name: true },
      });
      if (!museum) {
        return res.status(404).json({ error: 'Museum not found' });
      }

      const draft = await extractArtifactDraft(rawText, museum.name);
      res.json({ draft });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to extract artifact draft';
      res.status(500).json({ error: errorMessage });
    }
  }
);

app.post(
  '/museums/:museumId/scan/duplicates-draft',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const museumId = parseMuseumId(req.params.museumId);
      const draft = req.body?.draft;

      if (!museumId) {
        return res.status(400).json({ error: 'Invalid museumId' });
      }
      if (!draft || typeof draft !== 'object') {
        return res.status(400).json({ error: 'draft is required' });
      }

      const duplicates = await searchDuplicatesFromDraft(museumId, {
        localTitle:
          typeof draft.localTitle === 'string' ? draft.localTitle : '',
        localTitleLanguage:
          typeof draft.localTitleLanguage === 'string'
            ? draft.localTitleLanguage
            : 'und',
        englishTitle:
          typeof draft.englishTitle === 'string' ? draft.englishTitle : '',
        knowledgeText:
          typeof draft.knowledgeText === 'string' ? draft.knowledgeText : '',
        museumConfidence:
          typeof draft.museumConfidence === 'number'
            ? draft.museumConfidence
            : 90,
      });
      res.json(duplicates);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to search duplicates';
      res.status(500).json({ error: errorMessage });
    }
  }
);

app.post(
  '/museums/:museumId/scan/create',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      if (!req.actor) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const signupAllowed = await enforceSignupPolicy({
        actor: req.actor,
        res,
      });
      if (!signupAllowed) {
        return;
      }

      const createAllowed = await enforceUsageLimits({
        res,
        actor: req.actor,
        globalIncrements: { artifactCreates: 1, dbOps: 1 },
        userIncrements: { artifactCreates: 1 },
      });
      if (!createAllowed) {
        return;
      }

      const museumId = parseMuseumId(req.params.museumId);
      const imageBase64 =
        typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : '';
      const rawText =
        typeof req.body?.rawText === 'string' ? req.body.rawText : '';
      const draft = req.body?.draft;
      const ocr = req.body?.ocr;
      const enrichment = req.body?.enrichment ?? null;

      if (!museumId) {
        return res.status(400).json({ error: 'Invalid museumId' });
      }
      if (!imageBase64 || !rawText.trim() || !draft || !ocr) {
        const missing: string[] = [];
        if (!imageBase64) missing.push('imageBase64');
        if (!rawText.trim()) missing.push('rawText');
        if (!draft) missing.push('draft');
        if (!ocr) missing.push('ocr');
        return res.status(400).json({
          error: `Invalid scan create payload. Missing: ${missing.join(', ')}.`,
        });
      }

      const created = await createArtifactAndAssets({
        museumId,
        imageBase64,
        plaqueText: rawText,
        ocr: {
          rawText,
          languageHints: Array.isArray(ocr.languageHints)
            ? ocr.languageHints
            : [],
          confidence:
            typeof ocr.confidence === 'number' ? ocr.confidence : null,
          blocks: Array.isArray(ocr.blocks) ? ocr.blocks : [],
          provider: parseOcrProvider(ocr.provider, getDefaultOcrProvider()),
        },
        draft: {
          localTitle:
            typeof draft.localTitle === 'string'
              ? draft.localTitle
              : 'Untitled artefact',
          localTitleLanguage:
            typeof draft.localTitleLanguage === 'string'
              ? draft.localTitleLanguage
              : 'und',
          englishTitle:
            typeof draft.englishTitle === 'string'
              ? draft.englishTitle
              : draft.localTitle || 'Untitled artefact',
          knowledgeText:
            typeof draft.knowledgeText === 'string'
              ? draft.knowledgeText
              : 'An English description is not available yet for this artefact.',
          museumConfidence:
            typeof draft.museumConfidence === 'number'
              ? draft.museumConfidence
              : 90,
        },
        enrichment: {
          wikipediaUrl:
            typeof enrichment?.wikipediaUrl === 'string'
              ? enrichment.wikipediaUrl
              : null,
          wikipediaSummary:
            typeof enrichment?.wikipediaSummary === 'string'
              ? enrichment.wikipediaSummary
              : null,
          wikipediaSummaryLang:
            typeof enrichment?.wikipediaSummaryLang === 'string'
              ? enrichment.wikipediaSummaryLang
              : null,
          wikimediaImageUrl:
            typeof enrichment?.wikimediaImageUrl === 'string'
              ? enrichment.wikimediaImageUrl
              : null,
        },
      });

      res.json(created);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create artifact';
      res.status(500).json({ error: errorMessage });
    }
  }
);

app.post('/artifacts', requireAuth, requireAdmin, async (req, res) => {
  if (!req.actor) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const signupAllowed = await enforceSignupPolicy({ actor: req.actor, res });
  if (!signupAllowed) {
    return;
  }

  const limitsAllowed = await enforceUsageLimits({
    res,
    actor: req.actor,
    globalIncrements: { dbOps: 1 },
  });
  if (!limitsAllowed) {
    return;
  }

  const {
    name,
    displayTitle,
    roomId,
    museumId,
    knowledgeText,
    furtherReading,
    localTitle,
    localTitleLanguage,
    englishTitle,
    rawPlaqueText,
    knowledgeTextEn,
  } = req.body;

  const fallbackName =
    (typeof displayTitle === 'string' && displayTitle.trim()) ||
    (typeof name === 'string' && name.trim());

  if (!fallbackName) {
    return res.status(400).json({ error: 'name or displayTitle is required' });
  }

  if (!museumId) {
    return res.status(400).json({ error: 'museumId is required' });
  }

  // Validate museum exists
  const museum = await prisma.museum.findUnique({ where: { id: museumId } });
  if (!museum) {
    return res.status(400).json({ error: 'Museum not found' });
  }

  // If roomId is provided, validate it exists and belongs to the same museum
  if (roomId) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return res.status(400).json({ error: 'Room not found' });
    }
    // Verify room belongs to the specified museum (check directly or via parent chain)
    if (room.museumId !== museumId) {
      // Check if room is a child room of a room in this museum
      let currentRoom: typeof room | null = room;
      let foundMuseum = false;
      while (currentRoom) {
        if (currentRoom.museumId === museumId) {
          foundMuseum = true;
          break;
        }
        if (currentRoom.parentRoomId) {
          currentRoom = await prisma.room.findUnique({
            where: { id: currentRoom.parentRoomId },
          });
        } else {
          break;
        }
      }
      if (!foundMuseum) {
        return res.status(400).json({
          error: 'Room does not belong to the specified museum',
        });
      }
    }
  }

  const artifact = await prisma.artifact.create({
    data: {
      displayTitle: buildArtifactDisplayTitle({
        localTitle: localTitle || fallbackName,
        localTitleLanguage: localTitleLanguage || null,
        englishTitle: englishTitle || fallbackName,
      }),
      slug: await buildUniqueArtifactSlug({
        museumId,
        museumSlugOrName: museum.slug || museum.name,
        artifactName: localTitle || fallbackName,
      }),
      roomId: roomId || null,
      museumId,
      localTitle: localTitle || fallbackName,
      localTitleLanguage: localTitleLanguage || null,
      englishTitle: englishTitle || null,
      rawPlaqueText: rawPlaqueText || knowledgeText || null,
      knowledgeTextEn: knowledgeTextEn || null,
      furtherReading: furtherReading || [],
    } as Prisma.ArtifactUncheckedCreateInput,
  });

  res.json(artifact);
});

app.get('/artifacts', async (_req, res) => {
  const artifacts = await prisma.artifact.findMany({
    orderBy: {
      id: 'asc',
    },
  });
  res.json(
    artifacts.map((a) => ({
      id: a.id,
      name: a.displayTitle,
      createdAt: a.createdAt,
    }))
  );
});

// GET /artifacts/:id - Get a single artifact by ID
app.get('/artifacts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid artifact ID' });
    }

    const artifact = await prisma.artifact.findUnique({
      where: { id },
      select: {
        id: true,
        displayTitle: true,
        localTitle: true,
        localTitleLanguage: true,
        englishTitle: true,
        rawPlaqueText: true,
        knowledgeTextEn: true,
        slug: true,
        roomId: true,
        museumId: true,
        furtherReading: true,
      } as Prisma.ArtifactSelect,
    });

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json({
      ...artifact,
      name: artifact.displayTitle,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch artifact';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /artifacts/by-slug/:slug - Get a single artifact by slug (scoped by museumSlug query param)
app.get('/artifacts/by-slug/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const museumSlug = req.query.museumSlug as string | undefined;

    const where: any = { slug };
    if (museumSlug) {
      where.museum = { slug: museumSlug };
    }

    const artifact = await prisma.artifact.findFirst({ where });

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json({
      ...artifact,
      name: artifact.displayTitle,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch artifact';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/content', requireAuth, requireAdmin, async (req, res) => {
  const {
    text,
    type,
    museumId,
    roomId,
    artifactId,
    llmProvider,
    model,
    prompt,
  } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  const parentCount =
    Number(!!museumId) + Number(!!roomId) + Number(!!artifactId);

  if (parentCount !== 1) {
    return res.status(400).json({
      error: 'Exactly one of museumId, roomId, or artifactId must be provided',
    });
  }

  const content = await prisma.content.create({
    data: {
      text,
      type,
      museumId,
      roomId,
      artifactId,
      llmProvider: llmProvider || 'manual',
      model: model || 'manual',
      prompt: prompt || '',
    },
  });

  res.json(content);
});

app.get('/museums/:museumId/content', async (req, res) => {
  const museumId = Number(req.params.museumId);

  if (Number.isNaN(museumId)) {
    return res.status(400).json({ error: 'Invalid museumId' });
  }

  const content = await prisma.content.findMany({
    where: { museumId: museumId },
    orderBy: { id: 'asc' },
  });

  res.json(content);
});

app.get('/rooms/:roomId/content', async (req, res) => {
  const roomId = Number(req.params.roomId);

  if (Number.isNaN(roomId)) {
    return res.status(400).json({ error: 'Invalid roomId' });
  }

  const content = await prisma.content.findMany({
    where: { roomId: roomId },
    orderBy: { id: 'asc' },
  });

  res.json(content);
});

app.get('/artifacts/:artifactId/content', async (req, res) => {
  const artifactId = Number(req.params.artifactId);

  if (Number.isNaN(artifactId)) {
    return res.status(400).json({ error: 'Invalid artifactId' });
  }

  const content = await prisma.content.findMany({
    where: { artifactId: artifactId },
    orderBy: { id: 'asc' },
  });

  res.json(content);
});

app.get('/artifacts/:artifactId/questions', async (req, res) => {
  const artifactId = Number(req.params.artifactId);
  if (Number.isNaN(artifactId)) {
    return res.status(400).json({ error: 'Invalid artifactId' });
  }

  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
  const sort = req.query.sort === 'new' ? 'new' : 'top';

  const questions = await prisma.artifactQuestion.findMany({
    where: {
      artifactId,
      status: { in: ['ACTIVE', 'ANONYMIZED'] },
      moderationBlocked: false,
      answerText: { not: null },
    },
    orderBy:
      sort === 'new'
        ? [{ createdAt: 'desc' }]
        : [{ upvotes: 'desc' }, { askCount: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: {
      _count: {
        select: {
          listenEvents: true,
        },
      },
    },
  });

  const questionIds = questions.map((q) => q.id);
  const viewerUsername = req.actor?.uid ?? PROTOTYPE_USERNAME;
  const userVoteRecords = await prisma.artifactQuestionVote.findMany({
    where: { questionId: { in: questionIds }, username: viewerUsername },
    select: { questionId: true, value: true },
  });
  const userVoteMap = new Map(
    userVoteRecords.map((v) => [v.questionId, v.value])
  );

  res.json(
    questions.map((question) => ({
      id: question.id,
      artifactId: question.artifactId,
      museumId: question.museumId,
      roomId: question.roomId,
      questionText: question.questionText,
      questionLanguage: question.questionLanguage,
      askedByUsername:
        question.status === 'ANONYMIZED' ? null : question.askedByUsername,
      status: question.status,
      askCount: question.askCount,
      upvotes: question.upvotes,
      downvotes: question.downvotes,
      currentUserVote: userVoteMap.get(question.id) ?? 0,
      similarToQuestionId: question.similarToQuestionId,
      answerText: question.answerText,
      answerLanguage: question.answerLanguage,
      answerAudioUrl: question.answerAudioUrl,
      isAdultContent: question.isAdultContent,
      sensitiveTopics: question.sensitiveTopics,
      subjectTags: question.subjectTags,
      listenCount: question._count.listenEvents,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    }))
  );
});

app.post('/artifacts/:artifactId/questions/ask', async (req, res) => {
  try {
    const artifactId = Number(req.params.artifactId);
    if (Number.isNaN(artifactId)) {
      return res.status(400).json({ error: 'Invalid artifactId' });
    }

    const limitsAllowed = await enforceUsageLimits({
      res,
      actor: req.actor,
      globalIncrements: { llmCalls: 1 },
      userIncrements: req.actor ? { llmCalls: 1 } : undefined,
    });
    if (!limitsAllowed) {
      return;
    }

    const questionRaw = req.body?.question;
    const forceCreate = req.body?.forceCreate === true;
    const previewOnly = req.body?.previewOnly === true;
    const publishAnonymously = req.body?.publishAnonymously === true;
    const approvedQuestionTextRaw = req.body?.approvedQuestionText;
    if (typeof questionRaw !== 'string') {
      return res.status(400).json({ error: 'question is required' });
    }

    const questionText = questionRaw.trim();
    if (questionText.length < 8) {
      return res
        .status(400)
        .json({ error: 'Question is too short (minimum 8 characters).' });
    }
    if (questionText.length > 280) {
      return res
        .status(400)
        .json({ error: 'Question is too long (maximum 280 characters).' });
    }

    const providerName = parseProvider(req.query.provider, 'google');
    const ttsProvider = parseTtsProvider(
      req.query.ttsProvider,
      getDefaultTtsProvider()
    );
    let approvedQuestionText: string | null = null;
    if (typeof approvedQuestionTextRaw === 'string') {
      const trimmed = approvedQuestionTextRaw.trim();
      if (trimmed.length > 0) {
        approvedQuestionText = trimmed;
      }
    }

    const correctedQuestion =
      approvedQuestionText ??
      (await suggestQuestionCorrection(questionText, providerName));

    if (previewOnly) {
      return res.json({
        previewOnly: true,
        originalQuestion: questionText,
        correctedQuestion,
        hasCorrections: correctedQuestion !== questionText,
      });
    }

    const publishQuestion = (approvedQuestionText ?? correctedQuestion).trim();
    if (publishQuestion.length < 8) {
      return res
        .status(400)
        .json({ error: 'Question is too short (minimum 8 characters).' });
    }
    if (publishQuestion.length > 280) {
      return res
        .status(400)
        .json({ error: 'Question is too long (maximum 280 characters).' });
    }

    const context = await fetchArtifactQuestionContext(artifactId);
    if (!context) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    const normalizedQuestion = normalizeQuestionText(publishQuestion);
    const questionHash = hashText(normalizedQuestion);
    const existing = await prisma.artifactQuestion.findMany({
      where: {
        artifactId,
        status: { in: ['ACTIVE', 'ANONYMIZED'] },
      },
      select: {
        id: true,
        questionText: true,
        answerText: true,
        upvotes: true,
        downvotes: true,
      },
      take: 200,
      orderBy: { updatedAt: 'desc' },
    });

    let mostSimilar: {
      id: number;
      questionText: string;
      answerText: string | null;
      similarity: number;
      upvotes: number;
      downvotes: number;
    } | null = null;

    for (const row of existing) {
      const similarity = stringSimilarity(
        normalizedQuestion,
        normalizeQuestionText(row.questionText)
      );
      if (!mostSimilar || similarity > mostSimilar.similarity) {
        mostSimilar = {
          id: row.id,
          questionText: row.questionText,
          answerText: row.answerText,
          similarity,
          upvotes: row.upvotes,
          downvotes: row.downvotes,
        };
      }
    }

    if (
      mostSimilar &&
      mostSimilar.similarity >= SIMILARITY_THRESHOLD &&
      !forceCreate
    ) {
      return res.json({
        requiresConfirmation: true,
        similarQuestion: mostSimilar,
      });
    }

    let moderation;
    try {
      moderation = await moderateTextForLlm(
        publishQuestion,
        'artifact-question-submit'
      );
    } catch (error) {
      return res.status(503).json({
        error:
          error instanceof Error
            ? error.message
            : 'Moderation unavailable, cannot publish question right now.',
      });
    }
    if (moderation.blocked) {
      const blockedQuestion = await prisma.artifactQuestion.create({
        data: {
          artifactId: context.artifact.id,
          museumId: context.artifact.museumId,
          roomId: context.artifact.roomId ?? null,
          questionText: publishQuestion,
          normalizedQuestion,
          questionHash,
          askedByUsername: req.actor?.uid ?? PROTOTYPE_USERNAME,
          status: 'HIDDEN',
          moderationBlocked: true,
          moderationCategories: moderation.categories,
          moderationPayload: {
            source: moderation.source,
            categories: moderation.categories,
          } as Prisma.InputJsonValue,
          similarToQuestionId:
            mostSimilar && mostSimilar.similarity >= SIMILARITY_THRESHOLD
              ? mostSimilar.id
              : null,
        },
      });

      return res.status(403).json({
        error:
          'This question could not be posted because it violates community safety rules.',
        blocked: true,
        questionId: blockedQuestion.id,
      });
    }

    const spendMonthly = await checkSpendLimit(providerName);
    if (!spendMonthly.allowed) {
      return res.status(429).json({
        error: `Monthly ${providerName} spend limit reached (€${spendMonthly.currentSpendEur.toFixed(2)} / €${spendMonthly.limitEur?.toFixed(2)}).`,
      });
    }
    const spendDaily = await checkDailySpendLimit(providerName);
    if (!spendDaily.allowed) {
      return res.status(429).json({
        error: `Daily ${providerName} spend limit reached (€${spendDaily.currentSpendEur.toFixed(2)} / €${spendDaily.limitEur?.toFixed(2)}).`,
      });
    }

    const prompt = buildQuestionAnswerPrompt({
      artifactName: context.artifact.displayTitle,
      plaqueText:
        context.artifact.wikipediaSummary ||
        context.artifact.knowledgeTextEn ||
        context.artifact.rawPlaqueText,
      museumName: context.museum?.name ?? null,
      roomName: context.room?.name ?? null,
      parentRoomName: context.parentRoom?.name ?? null,
      museumSummary: context.museum?.wikipediaSummary ?? null,
      introductionText: context.introductionText,
      userQuestion: publishQuestion,
    });

    const provider = createProvider(providerName);
    const result = await provider.generate({
      prompt,
      systemInstruction: buildMuseumGuideSystemPrompt(),
    });

    const answerText = result.text.trim();
    if (!answerText) {
      throw new Error('LLM provider returned an empty answer text.');
    }

    const question = await prisma.artifactQuestion.create({
      data: {
        artifactId: context.artifact.id,
        museumId: context.artifact.museumId,
        roomId: context.artifact.roomId ?? null,
        questionText: publishQuestion,
        normalizedQuestion,
        questionHash,
        questionLanguage: null,
        askedByUsername: req.actor?.uid ?? PROTOTYPE_USERNAME,
        status: publishAnonymously ? 'ANONYMIZED' : 'ACTIVE',
        similarToQuestionId:
          mostSimilar && mostSimilar.similarity >= SIMILARITY_THRESHOLD
            ? mostSimilar.id
            : null,
        answerText,
        answerLanguage: null,
        isAdultContent: result.isAdultContent === true,
        sensitiveTopics: sanitizeSensitiveTopics(result.sensitiveTopics),
        subjectTags: sanitizeSubjectTags(result.subjectTags),
        moderationBlocked: false,
        llmProvider: result.provider,
        model: result.model,
        prompt,
        promptVersion: QUESTION_PROMPT_VERSION,
      },
    });

    // Auto-upvote from the question asker.
    // BUG: The vote record is stored correctly, but the client doesn't reliably
    // reflect it as active on first render — the upvote arrow may not highlight
    // and clicking upvote may not toggle it off. The create response includes
    // `upvotes: 1` but doesn't include `currentUserVote: 1`, so the frontend
    // can't seed its userVotes state from this response. See TODO.md for fix.
    const askerUsername = req.actor?.uid ?? PROTOTYPE_USERNAME;
    await prisma.artifactQuestionVote.create({
      data: { questionId: question.id, username: askerUsername, value: 1 },
    });
    await prisma.artifactQuestion.update({
      where: { id: question.id },
      data: { upvotes: 1 },
    });

    let answerAudioUrl: string | null = null;
    try {
      answerAudioUrl = await generateAudioForArtifactQuestion(
        question.id,
        answerText,
        { outputDir: audioDir, provider: ttsProvider }
      );
      await prisma.artifactQuestion.update({
        where: { id: question.id },
        data: { answerAudioUrl },
      });
    } catch (audioError) {
      console.error('[questions.ask] Audio generation failed', {
        artifactId,
        questionId: question.id,
        ttsProvider,
        error: audioError instanceof Error ? audioError.message : audioError,
      });
      // Audio is optional.
    }

    await recordUsage({
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      apiCallId: result.apiCallId ?? null,
      artifactId: artifactId,
    });

    res.json({
      requiresConfirmation: false,
      question: {
        ...question,
        upvotes: 1,
        answerAudioUrl: answerAudioUrl ?? question.answerAudioUrl,
      },
    });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to answer question',
    });
  }
});

app.post('/artifact-questions/:questionId/vote', async (req, res) => {
  const questionId = Number(req.params.questionId);
  if (Number.isNaN(questionId)) {
    return res.status(400).json({ error: 'Invalid questionId' });
  }

  const vote = req.body?.vote;
  if (vote !== 'up' && vote !== 'down') {
    return res.status(400).json({ error: 'vote must be "up" or "down"' });
  }

  const username = req.actor?.uid ?? PROTOTYPE_USERNAME;
  const value = vote === 'up' ? 1 : -1;
  const existing = await prisma.artifactQuestionVote.findUnique({
    where: { questionId_username: { questionId, username } },
  });

  if (existing && existing.value === value) {
    await prisma.artifactQuestionVote.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.artifactQuestionVote.update({
      where: { id: existing.id },
      data: { value },
    });
  } else {
    await prisma.artifactQuestionVote.create({
      data: { questionId, username, value },
    });
  }

  const [upvotes, downvotes] = await Promise.all([
    prisma.artifactQuestionVote.count({ where: { questionId, value: 1 } }),
    prisma.artifactQuestionVote.count({ where: { questionId, value: -1 } }),
  ]);

  const currentVote = await prisma.artifactQuestionVote.findUnique({
    where: { questionId_username: { questionId, username } },
  });

  await prisma.artifactQuestion.update({
    where: { id: questionId },
    data: { upvotes, downvotes },
  });

  res.json({
    questionId,
    upvotes,
    downvotes,
    currentUserVote: currentVote?.value ?? 0,
  });
});

app.post('/artifact-questions/:questionId/use', async (req, res) => {
  const questionId = Number(req.params.questionId);
  if (Number.isNaN(questionId)) {
    return res.status(400).json({ error: 'Invalid questionId' });
  }

  const question = await prisma.artifactQuestion.update({
    where: { id: questionId },
    data: {
      askCount: { increment: 1 },
    },
  });

  res.json({
    id: question.id,
    askCount: question.askCount,
  });
});

app.post('/artifact-questions/:questionId/listen', async (req, res) => {
  const questionId = Number(req.params.questionId);
  if (Number.isNaN(questionId)) {
    return res.status(400).json({ error: 'Invalid questionId' });
  }

  const durationSecondsRaw = Number(req.body?.durationSeconds ?? 0);
  const durationSeconds =
    Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0
      ? durationSecondsRaw
      : 0;

  const completed = req.body?.completed === true;
  const sessionId =
    typeof req.body?.sessionId === 'string' ? req.body.sessionId : null;
  const source = typeof req.body?.source === 'string' ? req.body.source : null;

  await prisma.artifactQuestionListenEvent.create({
    data: {
      questionId,
      username: PROTOTYPE_USERNAME,
      sessionId,
      durationSeconds,
      completed,
      source,
    },
  });

  res.json({ ok: true });
});

// ============================================================================
// ADMIN CONTENT ENDPOINTS
// ============================================================================

// GET /admin/content/museums - Get all museums
app.get(
  '/admin/content/museums',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      const museums = await prisma.museum.findMany({
        orderBy: { id: 'asc' },
      });
      res.set('Cache-Control', 'no-store');
      res.json(museums);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch museums';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// GET /admin/content/rooms - Get all rooms
app.get(
  '/admin/content/rooms',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      const rooms = await prisma.room.findMany({
        orderBy: { id: 'asc' },
      });
      res.set('Cache-Control', 'no-store');
      res.json(rooms);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch rooms';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// GET /admin/content/artifacts - Get all artifacts (read-only) with enriched data
app.get(
  '/admin/content/artifacts',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      // Fetch all rooms with their museum and parentRoom info to build a lookup map
      const allRooms = await prisma.room.findMany({
        select: {
          id: true,
          name: true,
          museumId: true,
          parentRoomId: true,
          museum: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Fetch all museums for direct lookup
      const allMuseums = await prisma.museum.findMany({
        select: {
          id: true,
          name: true,
        },
      });
      const museumMap = new Map(allMuseums.map((m) => [m.id, m]));

      // Build a map for quick lookup
      const roomMap = new Map(allRooms.map((room) => [room.id, room]));

      // Helper function to find museum by traversing up parent room chain
      const findMuseumForRoom = (
        roomId: number | null
      ): { id: number; name: string } | null => {
        if (!roomId) return null;
        const room = roomMap.get(roomId);
        if (!room) return null;

        // If room has museum directly, return it
        if (room.museum) {
          return room.museum;
        }

        // Otherwise, traverse up parent room chain
        if (room.parentRoomId) {
          return findMuseumForRoom(room.parentRoomId);
        }

        return null;
      };

      const artifacts = await prisma.artifact.findMany({
        include: {
          room: {
            select: {
              id: true,
              name: true,
              parentRoomId: true,
            },
          },
        } as Prisma.ArtifactInclude,
        orderBy: {
          id: 'asc',
        },
      });

      const response: ArtifactResponse[] = artifacts.map((artifact) => {
        // Type assertion to work around Prisma type inference issue
        const artifactWithRoom = artifact as typeof artifact & {
          roomId: number | null;
          museumId: number;
          displayTitle: string;
          slug: string;
          rawPlaqueText: string | null;
          furtherReading: string[];
          room: {
            id: number;
            name: string;
            parentRoomId: number | null;
          } | null;
        };

        // Find museum - use direct museumId if available, otherwise traverse room chain
        let museum: { id: number; name: string } | null = null;
        if (artifactWithRoom.museumId) {
          // Use direct museumId from artifact
          museum = museumMap.get(artifactWithRoom.museumId) || null;
        } else if (artifactWithRoom.room) {
          // Fallback to room chain traversal if no direct museumId
          museum = findMuseumForRoom(artifactWithRoom.room.id);
        }

        // Get parent room name
        const parentRoom = artifactWithRoom.room?.parentRoomId
          ? roomMap.get(artifactWithRoom.room.parentRoomId)
          : null;

        return {
          id: artifactWithRoom.id,
          name: artifactWithRoom.displayTitle,
          slug: artifactWithRoom.slug,
          roomId: artifactWithRoom.roomId,
          roomName: artifactWithRoom.room?.name || null,
          museumId: museum?.id || artifactWithRoom.museumId,
          museumName: museum?.name || null,
          rawPlaqueText: artifactWithRoom.rawPlaqueText,
          furtherReading: artifactWithRoom.furtherReading,
          parentRoomId: artifactWithRoom.room?.parentRoomId || null,
          parentRoomName: parentRoom?.name || null,
        };
      });

      res.set('Cache-Control', 'no-store');
      res.json(response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch artifacts';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// GET /admin/content/content - Get all content rows
app.get(
  '/admin/content/content',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      const content = await prisma.content.findMany({
        select: {
          id: true,
          type: true,
          text: true,
          createdAt: true,
          museumId: true,
          roomId: true,
          artifactId: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.setHeader('Cache-Control', 'no-store');
      res.json(content);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch content';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// ============================================================================
// CONTENT GENERATION ENDPOINT
// ============================================================================

type ContentProviderName = 'google' | 'openai';
const PROTOTYPE_USERNAME = 'prototype-tester';
const QUESTION_PROMPT_VERSION = '1.0';
const SIMILARITY_THRESHOLD = 0.75;

function parseProvider(
  value: unknown,
  fallback: ContentProviderName
): ContentProviderName {
  if (value === 'openai') return 'openai';
  if (value === 'google') return 'google';
  return fallback;
}

async function fetchArtifactContext(artifactId: number) {
  const artifact = await prisma.artifact.findUnique({
    where: { id: artifactId },
    include: {
      museum: {
        select: {
          id: true,
          name: true,
          wikipediaSummary: true,
        },
      },
      room: {
        include: {
          parentRoom: {
            select: {
              id: true,
              name: true,
              museumId: true,
            },
          },
        },
      },
    },
  });

  if (!artifact) return null;

  const room = artifact.room;
  const museum = artifact.museum || null;
  const parentRoom = room?.parentRoom || null;

  const template = buildIntroductionPrompt({
    artifactName: artifact.displayTitle,
    plaqueText: artifact.rawPlaqueText ?? artifact.knowledgeTextEn,
    museumName: museum?.name ?? null,
    roomName: room?.name ?? null,
    parentRoomName: parentRoom?.name ?? null,
    museumSummary: museum?.wikipediaSummary ?? null,
  });

  return { artifact, room, museum, parentRoom, template };
}

function normalizeQuestionText(question: string): string {
  return question
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function fetchArtifactQuestionContext(artifactId: number) {
  const artifact = await prisma.artifact.findUnique({
    where: { id: artifactId },
    include: {
      museum: {
        select: {
          id: true,
          name: true,
          wikipediaSummary: true,
        },
      },
      room: {
        include: {
          parentRoom: {
            select: {
              id: true,
              name: true,
              museumId: true,
            },
          },
        },
      },
      content: {
        where: { type: 'introduction' },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!artifact) return null;

  return {
    artifact,
    room: artifact.room,
    parentRoom: artifact.room?.parentRoom ?? null,
    museum: artifact.museum ?? null,
    introductionText: artifact.content[0]?.text ?? null,
  };
}

async function suggestQuestionCorrection(
  question: string,
  providerName: ContentProviderName
): Promise<string> {
  const provider = createProvider(providerName);
  const result = await provider.generate({
    systemInstruction: [
      buildMuseumGuideSystemPrompt(),
      'Task: clean up a visitor question for public display.',
      'Only correct obvious spelling, punctuation, and capitalization mistakes.',
      'Preserve meaning and tone.',
      'Do not switch UK vs US spelling if both are correct.',
      'Return only the cleaned question in the text field.',
    ].join('\n'),
    prompt: `Original visitor question:\n${question}`,
  });

  const cleaned = result.text.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return question;
  if (cleaned.length > 280) return question;
  return cleaned;
}

// POST /generate-content/artefact/:artefactId - Generate content
app.post(
  '/generate-content/artefact/:artefactId',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      if (!req.actor) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const signupAllowed = await enforceSignupPolicy({
        actor: req.actor,
        res,
      });
      if (!signupAllowed) {
        return;
      }

      const limitsAllowed = await enforceUsageLimits({
        res,
        actor: req.actor,
        globalIncrements: { llmCalls: 1, dbOps: 1 },
        userIncrements: { llmCalls: 1 },
      });
      if (!limitsAllowed) {
        return;
      }

      const artefactId = Number(req.params.artefactId);
      if (Number.isNaN(artefactId)) {
        return res.status(400).json({ error: 'Invalid artefactId' });
      }

      const context = await fetchArtifactContext(artefactId);
      if (!context) {
        return res.status(404).json({ error: 'Artifact not found' });
      }

      const providerName = parseProvider(req.query.provider, 'google');
      const ttsProvider = parseTtsProvider(
        req.body?.ttsProvider,
        getDefaultTtsProvider()
      );
      const provider = createProvider(providerName);

      const result = await provider.generate({
        prompt: context.template,
        systemInstruction: buildMuseumGuideSystemPrompt(),
      });

      const content = await prisma.content.create({
        data: {
          text: result.text,
          type: 'introduction',
          artifactId: artefactId,
          llmProvider: result.provider,
          model: result.model,
          prompt: context.template,
          suggestedQuestions: result.suggestedQuestions ?? [],
        },
      });

      let audioUrl: string | null = null;
      try {
        audioUrl = await generateAudioForContent(content.id, result.text, {
          outputDir: audioDir,
          provider: ttsProvider,
        });
        await prisma.content.update({
          where: { id: content.id },
          data: { audioUrl },
        });
      } catch (audioError) {
        console.error('[generate-content.post] Audio generation failed', {
          artifactId: artefactId,
          contentId: content.id,
          ttsProvider,
          error: audioError instanceof Error ? audioError.message : audioError,
        });
        // Audio is optional
      }

      const updatedContent = await prisma.content.findUnique({
        where: { id: content.id },
      });

      res.json(updatedContent);
    } catch (error) {
      let errorMessage = 'Failed to generate content';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (
          error.message.includes('prisma') ||
          error.message.includes('Invalid')
        ) {
          errorMessage = `Database error: ${error.message}

This usually means the Prisma client needs to be regenerated. Run: yarn prisma generate`;
        }
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

// GET /generate-content/artefact/:artefactId/stream - Stream content generation using SSE
app.get(
  '/generate-content/artefact/:artefactId/stream',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (!req.actor) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const signupAllowed = await enforceSignupPolicy({ actor: req.actor, res });
    if (!signupAllowed) {
      return;
    }

    const limitsAllowed = await enforceUsageLimits({
      res,
      actor: req.actor,
      globalIncrements: { llmCalls: 1, dbOps: 1 },
      userIncrements: { llmCalls: 1 },
    });
    if (!limitsAllowed) {
      return;
    }

    const artefactId = Number(req.params.artefactId);
    if (Number.isNaN(artefactId)) {
      return res.status(400).json({ error: 'Invalid artefactId' });
    }

    const context = await fetchArtifactContext(artefactId);
    if (!context) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    const providerName = parseProvider(req.query.provider, 'google');
    const ttsProvider = parseTtsProvider(
      req.query.ttsProvider,
      getDefaultTtsProvider()
    );

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}
`);
      res.write(`data: ${JSON.stringify(data)}

`);
    };

    try {
      sendEvent('status', {
        step: 'loading',
        message: 'Loading artifact data...',
      });

      sendEvent('status', {
        step: 'generating',
        message: `Sending prompt to ${providerName === 'google' ? 'Google' : 'OpenAI'}...`,
      });

      await assertTextAllowedForLlm(context.template, 'introduction-stream');

      let fullText = '';
      let modelName = '';
      let inputTokens = 0;
      let outputTokens = 0;
      const streamStart = Date.now();

      if (providerName === 'google') {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          sendEvent('error', { error: 'GEMINI_API_KEY not configured' });
          res.end();
          return;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        modelName = 'gemini-2.5-flash';
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContentStream(context.template);

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          fullText += chunkText;
          sendEvent('chunk', { text: chunkText });
        }

        const finalResponse = await result.response;
        const usage = finalResponse.usageMetadata;
        inputTokens = usage?.promptTokenCount ?? 0;
        outputTokens = usage?.candidatesTokenCount ?? 0;

        recordApiCall({
          service: 'Gemini',
          endpoint: 'generateContentStream',
          durationMs: Date.now() - streamStart,
          status: 'success',
          inputTokens,
          outputTokens,
          model: modelName,
        });
      } else {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          sendEvent('error', { error: 'OPENAI_API_KEY not configured' });
          res.end();
          return;
        }

        const client = new OpenAI({ apiKey });
        modelName = process.env.OPENAI_MODEL_INTRODUCTION || 'gpt-5-nano';

        const stream = client.responses.stream({
          model: modelName,
          input: [{ role: 'user', content: context.template }],
          max_output_tokens: Number(
            process.env.OPENAI_MAX_OUTPUT_TOKENS || 1000
          ),
          reasoning: { effort: 'minimal' },
        });

        stream.on('response.output_text.delta', (event) => {
          const delta = typeof event?.delta === 'string' ? event.delta : '';
          if (!delta) return;
          fullText += delta;
          sendEvent('chunk', { text: delta });
        });

        await stream.done();
        const finalResponse = await stream.finalResponse();
        const usage = finalResponse.usage;
        inputTokens = usage?.input_tokens ?? 0;
        outputTokens = usage?.output_tokens ?? 0;

        recordApiCall({
          service: 'OpenAI',
          endpoint: 'responses.stream',
          durationMs: Date.now() - streamStart,
          status: 'success',
          inputTokens,
          outputTokens,
          model: modelName,
        });
      }

      await recordUsage({
        provider: providerName,
        model: modelName,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - streamStart,
        apiCallId: null,
        artifactId: artefactId,
      });

      sendEvent('status', { step: 'saving', message: 'Saving content...' });

      const content = await prisma.content.create({
        data: {
          text: fullText,
          type: 'introduction',
          artifactId: artefactId,
          llmProvider: providerName,
          model: modelName,
          prompt: context.template,
          isAdultContent: false,
          sensitiveTopics: [],
          subjectTags: [],
          suggestedQuestions: [],
        },
      });

      sendEvent('status', {
        step: 'audio',
        message: 'Generating audio with text-to-speech...',
      });

      let audioUrl: string | null = null;
      let audioErrorMessage: string | null = null;
      try {
        audioUrl = await generateAudioForContent(content.id, fullText, {
          outputDir: audioDir,
          provider: ttsProvider,
        });
        await prisma.content.update({
          where: { id: content.id },
          data: { audioUrl },
        });
      } catch (audioError) {
        audioErrorMessage =
          audioError instanceof Error ? audioError.message : String(audioError);
        console.error('[generate-content.stream] Audio generation failed', {
          artifactId: artefactId,
          contentId: content.id,
          ttsProvider,
          error: audioErrorMessage,
        });
        // Continue without audio
      }

      const finalContent = await prisma.content.findUnique({
        where: { id: content.id },
      });

      sendEvent('complete', {
        content: finalContent,
        audioError: audioErrorMessage,
      });
      res.end();
    } catch (error) {
      sendEvent('error', {
        error:
          error instanceof Error ? error.message : 'Failed to generate content',
      });
      res.end();
    }
  }
);

// GET /wikipedia/summary - Fetch Wikipedia summary for a given URL (with English preference and translation)
app.get('/wikipedia/summary', async (req, res) => {
  try {
    const limitsAllowed = await enforceUsageLimits({
      res,
      actor: req.actor,
      globalIncrements: { wikiCalls: 1 },
      userIncrements: req.actor ? { wikiCalls: 1 } : undefined,
    });
    if (!limitsAllowed) {
      return;
    }

    const url = req.query.url as string;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Use the version that prefers English and translates if needed
    const summary = await fetchWikipediaSummaryWithTranslation(url);

    if (!summary) {
      return res.status(404).json({ error: 'Summary not found' });
    }

    res.json(summary);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch summary',
    });
  }
});

// POST /generate-audio/artefact/:artefactId - Generate audio for artifact's content
app.post(
  '/generate-audio/artefact/:artefactId',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const artefactId = Number(req.params.artefactId);
      if (Number.isNaN(artefactId)) {
        return res.status(400).json({ error: 'Invalid artefactId' });
      }

      const content = await prisma.content.findFirst({
        where: { artifactId: artefactId },
        orderBy: { createdAt: 'desc' },
      });

      if (!content) {
        return res
          .status(404)
          .json({ error: 'No content found for this artifact' });
      }

      if (!content.text) {
        return res
          .status(400)
          .json({ error: 'Content has no text to generate audio from' });
      }

      const audioUrl = await generateAudioForContent(content.id, content.text, {
        outputDir: audioDir,
        provider: parseTtsProvider(
          req.body?.ttsProvider,
          getDefaultTtsProvider()
        ),
      });

      const updatedContent = await prisma.content.update({
        where: { id: content.id },
        data: { audioUrl },
      });

      res.json(updatedContent);
    } catch (error) {
      let errorMessage = 'Failed to generate audio';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

// POST /generate-audio/content/:contentId - Generate audio for a specific content item
app.post(
  '/generate-audio/content/:contentId',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const contentId = Number(req.params.contentId);
      if (Number.isNaN(contentId)) {
        return res.status(400).json({ error: 'Invalid contentId' });
      }

      const content = await prisma.content.findUnique({
        where: { id: contentId },
      });

      if (!content) {
        return res.status(404).json({ error: 'Content not found' });
      }

      if (!content.text) {
        return res
          .status(400)
          .json({ error: 'Content has no text to generate audio from' });
      }

      const audioUrl = await generateAudioForContent(content.id, content.text, {
        outputDir: audioDir,
        provider: parseTtsProvider(
          req.body?.ttsProvider,
          getDefaultTtsProvider()
        ),
      });

      const updatedContent = await prisma.content.update({
        where: { id: content.id },
        data: { audioUrl },
      });

      res.json(updatedContent);
    } catch (error) {
      let errorMessage = 'Failed to generate audio';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

// POST /admin/artifacts/:artifactId/generate-introduction
app.post(
  '/admin/artifacts/:artifactId/generate-introduction',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      if (!req.actor) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const signupAllowed = await enforceSignupPolicy({
        actor: req.actor,
        res,
      });
      if (!signupAllowed) {
        return;
      }

      const limitsAllowed = await enforceUsageLimits({
        res,
        actor: req.actor,
        globalIncrements: { llmCalls: 1, dbOps: 1 },
        userIncrements: { llmCalls: 1 },
      });
      if (!limitsAllowed) {
        return;
      }

      const artifactId = Number(req.params.artifactId);
      if (Number.isNaN(artifactId)) {
        return res.status(400).json({ error: 'Invalid artifactId' });
      }

      const providerName = req.body?.provider;
      if (providerName !== 'google' && providerName !== 'openai') {
        return res
          .status(400)
          .json({ error: 'provider must be "google" or "openai"' });
      }
      const ttsProvider = parseTtsProvider(
        req.body?.ttsProvider,
        getDefaultTtsProvider()
      );

      const result = await generateIntroduction(
        artifactId,
        providerName,
        audioDir,
        ttsProvider
      );
      res.json(result);
    } catch (error) {
      if (error instanceof SpendLimitError) {
        return res.status(429).json({
          error: error.message,
          currentSpendEur: error.currentSpendEur,
          limitEur: error.limitEur,
        });
      }
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate introduction',
      });
    }
  }
);

// GET /admin/llm-usage/monthly
app.get(
  '/admin/llm-usage/monthly',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      const spend = await getMonthlySpendEur();
      res.json({ spend });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch usage data' });
    }
  }
);

// GET /admin/openai-usage/daily - Get today's OpenAI token usage by model tier
app.get(
  '/admin/openai-usage/daily',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const PREMIUM_MODELS = new Set([
        'gpt-5.2',
        'gpt-5.1',
        'gpt-5.1-codex',
        'gpt-5',
        'gpt-5-codex',
        'gpt-5-chat-latest',
        'gpt-4.1',
        'gpt-4o',
        'o1',
        'o3',
      ]);

      const MINI_MODELS = new Set([
        'gpt-5.1-codex-mini',
        'gpt-5-mini',
        'gpt-5-nano',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
        'gpt-4o-mini',
        'o1-mini',
        'o3-mini',
        'o4-mini',
        'codex-mini-latest',
      ]);

      const rows = await prisma.apiCall.findMany({
        where: {
          service: 'OpenAI',
          createdAt: { gte: startOfDay },
        },
        select: {
          model: true,
          inputTokens: true,
          outputTokens: true,
        },
      });

      let premiumTokens = 0;
      let miniTokens = 0;

      for (const row of rows) {
        const total = (row.inputTokens ?? 0) + (row.outputTokens ?? 0);
        if (row.model && PREMIUM_MODELS.has(row.model)) {
          premiumTokens += total;
        } else if (row.model && MINI_MODELS.has(row.model)) {
          miniTokens += total;
        } else {
          // Unknown model - count as premium to be safe
          premiumTokens += total;
        }
      }

      res.json({
        premium: {
          used: premiumTokens,
          limit: 250_000,
        },
        mini: {
          used: miniTokens,
          limit: 2_500_000,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch daily usage data' });
    }
  }
);

// GET /admin/api-calls/daily - Summary of today's API calls by service
app.get(
  '/admin/api-calls/daily',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const rows = await prisma.apiCall.findMany({
        where: { createdAt: { gte: startOfDay } },
        select: { service: true, durationMs: true },
      });

      const totalCalls = rows.length;

      const byService = new Map<
        string,
        { count: number; totalDurationMs: number }
      >();
      for (const row of rows) {
        const entry = byService.get(row.service) ?? {
          count: 0,
          totalDurationMs: 0,
        };
        entry.count++;
        entry.totalDurationMs += row.durationMs;
        byService.set(row.service, entry);
      }

      const services = Array.from(byService.entries()).map(
        ([service, data]) => ({
          service,
          count: data.count,
          avgDurationMs: Math.round(data.totalDurationMs / data.count),
        })
      );

      res.json({ totalCalls, services, globalLimits: GLOBAL_DAILY_LIMITS });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch daily API call data' });
    }
  }
);

// GET /admin/api-calls - Paginated recent API calls
app.get('/admin/api-calls', requireAuth, requireAdmin, async (req, res) => {
  try {
    const service = req.query.service as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize) || 50)
    );
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (service) {
      where.service = service;
    }

    const [rows, total] = await Promise.all([
      prisma.apiCall.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
      prisma.apiCall.count({ where }),
    ]);

    res.json({ rows, total, page, pageSize });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch API calls' });
  }
});

initLangfuse();

if (require.main === module) {
  app.listen(PORT, () => {});
}

export { app };
