import dotenv from 'dotenv';
import { resolve } from 'path';
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
import { generateAudioForContent } from './lib/audio';
import {
  generateIntroduction,
  SpendLimitError,
} from './lib/llm/generate-content';
import { createProvider } from './lib/llm';
import { buildIntroductionPrompt } from './lib/llm/prompt-templates';
import { getMonthlySpendEur } from './lib/llm/cost-tracker';
import { initLangfuse } from './lib/telemetry/langfuse';
import {
  queryWikidata,
  buildMuseumQuery,
  buildArtifactsQuery,
  extractQId,
  SUPPORTED_CITIES,
  searchWikidata,
  fetchWikidataEntity,
  fetchWikipediaSummary,
  fetchWikipediaSummaryWithTranslation,
  parseArtifactResults,
  type WikidataArtifactBinding,
} from './lib/wikidata';

// Load environment variables - check multiple locations
dotenv.config({ path: resolve(__dirname, '../../../.env') });
dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(__dirname, '../../web/.env.local') });

function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

app.use(express.json());

// Serve static audio files
const audioDir = resolve(__dirname, '../public/audio');
if (!existsSync(audioDir)) {
  mkdir(audioDir, { recursive: true }).catch(() => {});
}
app.use('/audio', express.static(audioDir));

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
app.post('/artifacts/check-duplicates', async (req, res) => {
  try {
    const { name, knowledgeText, furtherReading } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    // Fetch all existing artifacts
    const existingArtifacts = await prisma.artifact.findMany({
      select: {
        id: true,
        name: true,
        knowledgeText: true,
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
      knowledgeText?: string | null;
      furtherReading: string[];
      roomName?: string | null;
      museumName?: string | null;
    }> = [];

    const normalizedNewUrls = (furtherReading || []).map(normalizeUrl);
    const newKnowledgeText = (knowledgeText || '').trim().toLowerCase();

    for (const artifact of existingArtifacts) {
      const artifactWithFields = artifact as typeof artifact & {
        knowledgeText: string | null;
        furtherReading: string[];
        room: {
          name: string;
          museum: { id: number; name: string } | null;
        } | null;
      };
      const matchReasons: string[] = [];
      let maxSimilarity = 0;

      // Check name similarity
      const nameSimilarity = stringSimilarity(name, artifact.name);
      if (nameSimilarity >= 0.7) {
        matchReasons.push(
          `Name similarity: ${Math.round(nameSimilarity * 100)}%`
        );
        maxSimilarity = Math.max(maxSimilarity, nameSimilarity);
      }

      // Check knowledgeText similarity
      if (newKnowledgeText && artifactWithFields.knowledgeText) {
        const knowledgeSimilarity = stringSimilarity(
          newKnowledgeText,
          artifactWithFields.knowledgeText.trim().toLowerCase()
        );
        if (knowledgeSimilarity >= 0.6) {
          matchReasons.push(
            `Knowledge text similarity: ${Math.round(knowledgeSimilarity * 100)}%`
          );
          maxSimilarity = Math.max(maxSimilarity, knowledgeSimilarity);
        }

        // Also check for substring matches (one contains significant portion of the other)
        const shorter =
          newKnowledgeText.length < artifactWithFields.knowledgeText.length
            ? newKnowledgeText
            : artifactWithFields.knowledgeText.trim().toLowerCase();
        const longer =
          newKnowledgeText.length >= artifactWithFields.knowledgeText.length
            ? newKnowledgeText
            : artifactWithFields.knowledgeText.trim().toLowerCase();

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
          name: artifact.name,
          similarity: maxSimilarity,
          matchReasons,
          knowledgeText: artifactWithFields.knowledgeText,
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
});

// GET /cities - Get list of available cities from SUPPORTED_CITIES
app.get('/cities', (_req, res) => {
  try {
    // Return the keys from SUPPORTED_CITIES, sorted alphabetically
    const cities = Object.keys(SUPPORTED_CITIES).sort();
    res.json(cities);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch cities';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /cities/stats - Get museum counts per city
app.get('/cities/stats', async (_req, res) => {
  try {
    const supportedCities = Object.keys(SUPPORTED_CITIES).sort();

    // Get counts for each city
    const stats = await Promise.all(
      supportedCities.map(async (city) => {
        const count = await prisma.museum.count({
          where: { citySlug: city },
        });
        return {
          city,
          museumCount: count,
          lastSeeded: null as string | null, // Could be added later with a separate table
        };
      })
    );

    res.json(stats);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch city stats';
    res.status(500).json({ error: errorMessage });
  }
});

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
    const filteredWikidataResults = wikidataResults
      .filter((r) => !localQids.has(r.qid))
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
    const wikidataResults = await searchWikidata(searchTerm, 10);

    res.json({
      query: searchTerm,
      results: wikidataResults,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to search Wikidata';
    res.status(500).json({ error: errorMessage });
  }
});

// POST /api/museums/select/:qid - Select and enrich a museum by QID
app.post('/api/museums/select/:qid', async (req, res) => {
  const { qid } = req.params;

  // Validate QID format
  if (!/^Q\d+$/.test(qid)) {
    return res.status(400).json({
      error: `Invalid QID format: ${qid}. Expected format: Q followed by numbers (e.g., Q33506)`,
    });
  }

  try {
    // Check if museum already exists in DB
    const existingMuseum = await prisma.museum.findUnique({
      where: { wikidataId: qid },
    });

    if (existingMuseum) {
      // Check if we need to enrich (missing key fields)
      const needsEnrichment =
        !existingMuseum.wikipediaUrl &&
        !existingMuseum.image &&
        !existingMuseum.coordinates;

      if (needsEnrichment) {
        const details = await fetchWikidataEntity(qid);

        if (details) {
          await prisma.museum.update({
            where: { wikidataId: qid },
            data: {
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
            },
          });
        }
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

    // Create the museum
    const museum = await prisma.museum.create({
      data: {
        name: details.label,
        wikidataId: qid,
        wikipediaUrl: details.wikipediaUrl || null,
        image: details.image || null,
        coordinates: details.coordinates ?? undefined,
        locationTags: details.locationLabels || [],
        knowledgeText: null,
        furtherReading: [],
      },
    });

    res.json({
      created: true,
      museum: {
        id: museum.id,
        qid,
        slug: museum.slug,
        name: museum.name,
      },
    });
  } catch (error: any) {
    // Handle slug collision
    if (error?.code === 'P2002' && error?.meta?.modelName === 'Museum') {
      return res.status(409).json({
        error: 'A museum with a similar name already exists',
      });
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to select museum';
    res.status(500).json({ error: errorMessage });
  }
});

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
app.post('/api/museums/:slug/hydrate', async (req, res) => {
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
});

// POST /api/museums/:slug/hydrate-artifacts - Hydrate artifacts from Wikidata
app.post('/api/museums/:slug/hydrate-artifacts', async (req, res) => {
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
    if (!force && isRecentlyHydrated(museum.artifactsHydratedAt)) {
      const artifacts = await prisma.artifact.findMany({
        where: { museumId: museum.id },
        select: {
          id: true,
          name: true,
          slug: true,
          wikidataId: true,
          wikipediaUrl: true,
          wikimediaImageUrl: true,
        },
        orderBy: { name: 'asc' },
      });

      return res.json({
        cached: true,
        museumId: museum.id,
        artifacts,
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
    const bindings = await queryWikidata<WikidataArtifactBinding>(sparqlQuery);
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
          const updated = await prisma.artifact.update({
            where: { wikidataId: artifact.qid },
            data: {
              name: artifact.label,
              wikipediaUrl: artifact.wikipediaUrl || existing.wikipediaUrl,
              wikimediaImageUrl: artifact.image || existing.wikimediaImageUrl,
            } as any,
          });
          artifactResults.push({
            id: updated.id,
            name: updated.name,
            slug: updated.slug,
            wikidataId: artifact.qid,
            wikipediaUrl: updated.wikipediaUrl,
            wikimediaImageUrl: updated.wikimediaImageUrl,
          });
        } else {
          // Create new artifact
          const created = await prisma.artifact.create({
            data: {
              name: artifact.label,
              museumId: museum.id,
              wikidataId: artifact.qid,
              wikipediaUrl: artifact.wikipediaUrl || null,
              wikimediaImageUrl: artifact.image || null,
              knowledgeText: artifact.description || null,
              furtherReading: artifact.wikipediaUrl
                ? [artifact.wikipediaUrl]
                : [],
            } as any,
          });
          artifactResults.push({
            id: created.id,
            name: created.name,
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
});

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
app.get('/admin/rooms', async (req, res) => {
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
app.get('/admin/artifacts', async (req, res) => {
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
        slug: string;
        knowledgeText: string | null;
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
        name: artifactWithRoom.name,
        slug: artifactWithRoom.slug,
        roomId: artifactWithRoom.roomId,
        roomName: artifactWithRoom.room?.name || null,
        museumId: museum?.id || artifactWithRoom.museumId,
        museumName: museum?.name || null,
        knowledgeText: artifactWithRoom.knowledgeText,
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

app.post('/museums', async (req, res) => {
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
  res.json(museum);
});

// DELETE /museums/:id - Delete a museum
app.delete('/museums/:id', async (req, res) => {
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
app.delete('/rooms/:id', async (req, res) => {
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
app.delete('/artifacts/:id', async (req, res) => {
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

app.post('/rooms', async (req, res) => {
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
        name: true,
        slug: true,
        roomId: true,
        createdAt: true,
      } as Prisma.ArtifactSelect,
      orderBy: {
        id: 'asc',
      },
    });

    res.json(artifacts);
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
        name: true,
        slug: true,
        roomId: true,
        createdAt: true,
      } as Prisma.ArtifactSelect,
      orderBy: {
        id: 'asc',
      },
    });

    res.json(artifacts);
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
      name: true,
      slug: true,
      createdAt: true,
    } as Prisma.ArtifactSelect,
    orderBy: {
      id: 'asc',
    },
  });

  res.json(artifacts);
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
app.patch('/rooms/:id', async (req, res) => {
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
        name: true,
        roomId: true,
        createdAt: true,
      } as Prisma.ArtifactSelect,
      orderBy: {
        id: 'asc',
      },
    });

    res.json(artifacts);
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to fetch recursive artifacts';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/artifacts', async (req, res) => {
  const { name, roomId, museumId, knowledgeText, furtherReading } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
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
      name,
      slug: generateSlug(name),
      roomId: roomId || null,
      museumId,
      knowledgeText: knowledgeText || null,
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
      name: a.name,
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
        name: true,
        slug: true,
        roomId: true,
        museumId: true,
        knowledgeText: true,
        furtherReading: true,
      } as Prisma.ArtifactSelect,
    });

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json(artifact);
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

    res.json(artifact);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch artifact';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/content', async (req, res) => {
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

// ============================================================================
// ADMIN CONTENT ENDPOINTS
// ============================================================================

// GET /admin/content/museums - Get all museums
app.get('/admin/content/museums', async (_req, res) => {
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
});

// GET /admin/content/rooms - Get all rooms
app.get('/admin/content/rooms', async (_req, res) => {
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
});

// GET /admin/content/artifacts - Get all artifacts (read-only) with enriched data
app.get('/admin/content/artifacts', async (_req, res) => {
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
        slug: string;
        knowledgeText: string | null;
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
        name: artifactWithRoom.name,
        slug: artifactWithRoom.slug,
        roomId: artifactWithRoom.roomId,
        roomName: artifactWithRoom.room?.name || null,
        museumId: museum?.id || artifactWithRoom.museumId,
        museumName: museum?.name || null,
        knowledgeText: artifactWithRoom.knowledgeText,
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
});

// GET /admin/content/content - Get all content rows
app.get('/admin/content/content', async (_req, res) => {
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
});

// ============================================================================
// CONTENT GENERATION ENDPOINT
// ============================================================================

type ContentProviderName = 'google' | 'openai';

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
    artifactName: artifact.name,
    plaqueText: artifact.knowledgeText,
    museumName: museum?.name ?? null,
    roomName: room?.name ?? null,
    parentRoomName: parentRoom?.name ?? null,
    museumSummary: museum?.wikipediaSummary ?? null,
  });

  return { artifact, room, museum, parentRoom, template };
}

// POST /generate-content/artefact/:artefactId - Generate content
app.post('/generate-content/artefact/:artefactId', async (req, res) => {
  try {
    const artefactId = Number(req.params.artefactId);
    if (Number.isNaN(artefactId)) {
      return res.status(400).json({ error: 'Invalid artefactId' });
    }

    const context = await fetchArtifactContext(artefactId);
    if (!context) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    const providerName = parseProvider(req.query.provider, 'google');
    const provider = createProvider(providerName);

    const result = await provider.generate({ prompt: context.template });

    const content = await prisma.content.create({
      data: {
        text: result.text,
        type: 'introduction',
        artifactId: artefactId,
        llmProvider: result.provider,
        model: result.model,
        prompt: context.template,
      },
    });

    let audioUrl: string | null = null;
    try {
      audioUrl = await generateAudioForContent(content.id, result.text, {
        outputDir: audioDir,
      });
      await prisma.content.update({
        where: { id: content.id },
        data: { audioUrl },
      });
    } catch {
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
});

// GET /generate-content/artefact/:artefactId/stream - Stream content generation using SSE
app.get('/generate-content/artefact/:artefactId/stream', async (req, res) => {
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
    const artefactId = Number(req.params.artefactId);
    if (Number.isNaN(artefactId)) {
      sendEvent('error', { error: 'Invalid artefactId' });
      res.end();
      return;
    }

    sendEvent('status', {
      step: 'loading',
      message: 'Loading artifact data...',
    });

    const context = await fetchArtifactContext(artefactId);
    if (!context) {
      sendEvent('error', { error: 'Artifact not found' });
      res.end();
      return;
    }

    const providerName = parseProvider(req.query.provider, 'google');

    sendEvent('status', {
      step: 'generating',
      message: `Sending prompt to ${providerName === 'google' ? 'Google' : 'OpenAI'}...`,
    });

    let fullText = '';
    let modelName = '';

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
        max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 1000),
        reasoning: { effort: 'minimal' },
      });

      stream.on('response.output_text.delta', (event) => {
        const delta = typeof event?.delta === 'string' ? event.delta : '';
        if (!delta) return;
        fullText += delta;
        sendEvent('chunk', { text: delta });
      });

      await stream.done();
    }

    sendEvent('status', { step: 'saving', message: 'Saving content...' });

    const content = await prisma.content.create({
      data: {
        text: fullText,
        type: 'introduction',
        artifactId: artefactId,
        llmProvider: providerName,
        model: modelName,
        prompt: context.template,
      },
    });

    sendEvent('status', {
      step: 'audio',
      message: 'Generating audio with text-to-speech...',
    });

    let audioUrl: string | null = null;
    try {
      audioUrl = await generateAudioForContent(content.id, fullText, {
        outputDir: audioDir,
      });
      await prisma.content.update({
        where: { id: content.id },
        data: { audioUrl },
      });
    } catch {
      // Continue without audio
    }

    const finalContent = await prisma.content.findUnique({
      where: { id: content.id },
    });

    sendEvent('complete', { content: finalContent });
    res.end();
  } catch (error) {
    sendEvent('error', {
      error:
        error instanceof Error ? error.message : 'Failed to generate content',
    });
    res.end();
  }
});

// GET /wikipedia/summary - Fetch Wikipedia summary for a given URL (with English preference and translation)
app.get('/wikipedia/summary', async (req, res) => {
  try {
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
app.post('/generate-audio/artefact/:artefactId', async (req, res) => {
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
      if (
        error.message.includes('GOOGLE_APPLICATION_CREDENTIALS') ||
        error.message.includes('credentials') ||
        error.message.includes('authentication')
      ) {
        errorMessage = `${error.message}

Make sure GOOGLE_APPLICATION_CREDENTIALS is configured or Google Cloud credentials are set up correctly.`;
      }
    }
    res.status(500).json({ error: errorMessage });
  }
});

// POST /generate-audio/content/:contentId - Generate audio for a specific content item
app.post('/generate-audio/content/:contentId', async (req, res) => {
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
      if (
        error.message.includes('GOOGLE_APPLICATION_CREDENTIALS') ||
        error.message.includes('credentials') ||
        error.message.includes('authentication')
      ) {
        errorMessage = `${error.message}

Make sure GOOGLE_APPLICATION_CREDENTIALS is configured or Google Cloud credentials are set up correctly.`;
      }
    }
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// WIKIDATA SEEDING ENDPOINT
// ============================================================================

const handleSeedMuseums = async (
  req: express.Request,
  res: express.Response
) => {
  const { city } = req.params;

  // Validate city slug
  if (!SUPPORTED_CITIES[city]) {
    return res.status(400).json({
      error: `City "${city}" is not supported. Supported cities: ${Object.keys(SUPPORTED_CITIES).join(', ')}`,
    });
  }

  const cityQId = SUPPORTED_CITIES[city];

  try {
    // Build and execute SPARQL query
    const sparqlQuery = buildMuseumQuery(cityQId);
    const results = await queryWikidata(sparqlQuery);

    let inserted = 0;
    let updated = 0;

    // Process each result
    for (const binding of results) {
      const museumUri = binding.museum?.value;
      const museumLabel = binding.museumLabel?.value;

      if (!museumUri || !museumLabel) {
        continue;
      }

      const wikidataId = extractQId(museumUri);
      if (!wikidataId) {
        continue;
      }

      // Upsert museum - preserve existing knowledgeText and furtherReading
      // Note: slug is a generated column in PostgreSQL, so we don't set it
      try {
        // Check if museum exists by wikidataId
        const existingByWikidataId = await prisma.museum.findUnique({
          where: { wikidataId } as any,
          select: { id: true },
        });

        if (existingByWikidataId) {
          // Museum exists, update it
          await prisma.museum.update({
            where: { wikidataId } as any,
            data: {
              name: museumLabel,
              citySlug: city,
            } as any,
          });
          updated++;
        } else {
          // Museum doesn't exist, try to create it
          try {
            await prisma.museum.create({
              data: {
                name: museumLabel,
                wikidataId,
                citySlug: city,
                knowledgeText: null,
                furtherReading: [],
              } as any,
            });
            inserted++;
          } catch (createError: any) {
            // Handle slug collision (P2002 = unique constraint violation)
            if (
              createError?.code === 'P2002' &&
              createError?.meta?.modelName === 'Museum'
            ) {
              // Slug collision - a museum with a similar name already exists
              // This can happen when Wikidata has multiple entries for similar museums
              // Skip this museum
            } else {
              throw createError;
            }
          }
        }
      } catch (error) {
        // Continue with other museums even if one fails
      }
    }

    // Get total count for this city
    const total = await prisma.museum.count({
      where: { citySlug: city } as any,
    });

    res.json({
      city,
      inserted,
      updated,
      total,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to seed museums from Wikidata';

    // Return 502 for Wikidata service errors
    if (
      errorMessage.includes('Wikidata') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('query')
    ) {
      return res.status(502).json({
        error: `Wikidata service error: ${errorMessage}`,
      });
    }

    res.status(500).json({ error: errorMessage });
  }
};

app.post('/api/seed-museums/:city', handleSeedMuseums);

// POST /admin/artifacts/:artifactId/generate-introduction
app.post(
  '/admin/artifacts/:artifactId/generate-introduction',
  async (req, res) => {
    try {
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

      const result = await generateIntroduction(
        artifactId,
        providerName,
        audioDir
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
app.get('/admin/llm-usage/monthly', async (_req, res) => {
  try {
    const spend = await getMonthlySpendEur();
    res.json({ spend });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

initLangfuse();

app.listen(PORT, () => {});
