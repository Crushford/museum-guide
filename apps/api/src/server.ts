import dotenv from 'dotenv';
import { resolve } from 'path';
import express from 'express';
import cors from 'cors';
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
  queryWikidata,
  buildMuseumQuery,
  buildArtifactsQuery,
  extractQId,
  SUPPORTED_CITIES,
  searchWikidata,
  fetchWikidataEntity,
  fetchWikipediaSummary,
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
  mkdir(audioDir, { recursive: true }).catch(console.error);
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
    console.error('Error checking duplicates:', error);
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
    console.error('Error fetching cities:', error);
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
    console.error('Error fetching city stats:', error);
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
    console.log(`[Museum Search] Searching for: "${searchTerm}"`);

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

    console.log(`[Museum Search] Found ${localResults.length} local results`);

    // Search Wikidata
    const wikidataResults = await searchWikidata(searchTerm, 10);

    // Filter out Wikidata results that are already in local results
    const localQids = new Set(
      localMuseums.map((m) => m.wikidataId).filter(Boolean)
    );
    const filteredWikidataResults = wikidataResults
      .filter((r) => !localQids.has(r.qid))
      .map((r) => ({ ...r, isLocal: false }));

    console.log(
      `[Museum Search] Found ${filteredWikidataResults.length} Wikidata results (after filtering)`
    );

    res.json({
      query: searchTerm,
      local: localResults,
      wikidata: filteredWikidataResults,
    });
  } catch (error) {
    console.error('Error searching museums:', error);
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
    console.log(`[Wikidata Search] Searching for: "${searchTerm}"`);

    // Search Wikidata only
    const wikidataResults = await searchWikidata(searchTerm, 10);

    console.log(`[Wikidata Search] Found ${wikidataResults.length} results`);

    res.json({
      query: searchTerm,
      results: wikidataResults,
    });
  } catch (error) {
    console.error('Error searching Wikidata:', error);
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
    console.log(`[Museum Select] Selecting museum: ${qid}`);

    // Check if museum already exists in DB
    const existingMuseum = await prisma.museum.findUnique({
      where: { wikidataId: qid },
    });

    if (existingMuseum) {
      console.log(`[Museum Select] Museum already exists: ${existingMuseum.name} (${qid})`);

      // Check if we need to enrich (missing key fields)
      const needsEnrichment =
        !existingMuseum.wikipediaUrl &&
        !existingMuseum.image &&
        !existingMuseum.coordinates;

      if (needsEnrichment) {
        console.log(`[Museum Select] Enriching existing museum...`);
        const details = await fetchWikidataEntity(qid);

        if (details) {
          await prisma.museum.update({
            where: { wikidataId: qid },
            data: {
              wikipediaUrl: details.wikipediaUrl || existingMuseum.wikipediaUrl,
              image: details.image || existingMuseum.image,
              coordinates: details.coordinates
                ? details.coordinates
                : (existingMuseum.coordinates as { lat: number; lng: number } | null) ?? undefined,
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
    console.log(`[Museum Select] Fetching details from Wikidata...`);
    const details = await fetchWikidataEntity(qid);

    if (!details) {
      return res.status(404).json({
        error: `Museum not found on Wikidata: ${qid}`,
      });
    }

    // Create the museum
    console.log(`[Museum Select] Creating museum: ${details.label}`);
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

    console.log(`[Museum Select] Created museum: ${museum.name} (id: ${museum.id})`);

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
    console.error(`Error selecting museum ${qid}:`, error);

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
    console.log(`[Museum Hydrate] Starting hydration for: ${slug}`);

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
      console.log(`[Museum Hydrate] Using cached data for: ${museum.name}`);
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

    console.log(`[Museum Hydrate] Fetching from Wikidata: ${museum.wikidataId}`);

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
      console.log(`[Museum Hydrate] Fetching Wikipedia summary...`);
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
        locationTags: details.locationLabels.length > 0 ? details.locationLabels : museum.locationTags,
        museumHydratedAt: new Date(),
      } as any,
    });

    console.log(`[Museum Hydrate] Successfully hydrated: ${museum.name}`);

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
    console.error(`[Museum Hydrate] Error:`, error);

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
    console.log(`[Artifact Hydrate] Starting hydration for museum: ${slug}`);

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
      console.log(`[Artifact Hydrate] Using cached data for: ${museum.name}`);
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
        error: 'Museum missing wikidataId. Cannot hydrate artifacts from Wikidata.',
      });
    }

    console.log(`[Artifact Hydrate] Querying Wikidata for artifacts of: ${museum.wikidataId}`);

    // Query Wikidata for artifacts
    const sparqlQuery = buildArtifactsQuery(museum.wikidataId);
    const bindings = await queryWikidata<WikidataArtifactBinding>(sparqlQuery);
    const artifactsFromWikidata = parseArtifactResults(bindings);

    console.log(`[Artifact Hydrate] Found ${artifactsFromWikidata.length} artifacts with Wikipedia pages`);

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
              furtherReading: artifact.wikipediaUrl ? [artifact.wikipediaUrl] : [],
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
          console.warn(`[Artifact Hydrate] Skipping duplicate: ${artifact.label}`);
        } else {
          console.error(`[Artifact Hydrate] Error upserting ${artifact.label}:`, artifactError);
        }
      }
    }

    // Update museum's artifactsHydratedAt timestamp
    await prisma.museum.update({
      where: { id: museum.id },
      data: { artifactsHydratedAt: new Date() } as any,
    });

    console.log(`[Artifact Hydrate] Successfully hydrated ${upserted} new artifacts for: ${museum.name}`);

    res.json({
      cached: false,
      museumId: museum.id,
      artifacts: artifactResults,
      newArtifacts: upserted,
      artifactsHydratedAt: new Date(),
    });
  } catch (error) {
    console.error(`[Artifact Hydrate] Error:`, error);

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
    console.error('Error fetching museums:', error);
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
    console.error('Error fetching museum:', error);
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
    console.error('Error fetching museum by slug:', error);
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
    console.error('Error fetching rooms:', error);
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
    console.error('Error fetching artifacts:', error);
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
    console.error('Error deleting museum:', error);
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
    console.error('Error deleting room:', error);
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
    console.error('Error deleting artifact:', error);
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
    console.error('Error fetching museum artifacts:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch artifacts';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /museums/:museumId/artifacts-recursive - Get all artifacts from all rooms in a museum (including child rooms)
app.get('/museums/:museumId/artifacts-recursive', async (req, res) => {
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
        roomId: true,
        createdAt: true,
      } as Prisma.ArtifactSelect,
      orderBy: {
        id: 'asc',
      },
    });

    res.json(artifacts);
  } catch (error) {
    console.error('Error fetching recursive artifacts for museum:', error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to fetch recursive artifacts for museum';
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
    console.error('Error fetching room:', error);
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
    console.error('Error fetching room by slug:', error);
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
    console.error('Error fetching child rooms:', error);
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
    console.error('Error updating room:', error);
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
    console.error('Error fetching recursive artifacts:', error);
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
        roomId: true,
        knowledgeText: true,
        furtherReading: true,
      } as Prisma.ArtifactSelect,
    });

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json(artifact);
  } catch (error) {
    console.error('Error fetching artifact:', error);
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
    console.error('Error fetching artifact by slug:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch artifact';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/content', async (req, res) => {
  const { text, type, museumId, roomId, artifactId, llmProvider, model, prompt } = req.body;

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
    console.error('Error fetching museums:', error);
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
    console.error('Error fetching rooms:', error);
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
    console.error('Error fetching artifacts:', error);
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
    console.error('Error fetching content:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch content';
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// CONTENT GENERATION ENDPOINT
// ============================================================================

// Helper function to generate introduction template (matches frontend logic)
function generateIntroductionTemplate(
  artifact: {
    id: number;
    name: string;
    knowledgeText: string | null;
    roomId: number | null;
  },
  room?: { id: number; name: string; parentRoomId: number | null } | null,
  museum?: { id: number; name: string } | null,
  parentRoom?: { id: number; name: string } | null
): string {
  const museumName = museum?.name || 'Museum Name';
  const roomName = room?.name || 'Room Name';
  const parentRoomName = parentRoom?.name;

  const location = parentRoomName
    ? `${parentRoomName} - ${roomName}`
    : roomName;

  const plaqueInfo =
    artifact.knowledgeText || 'No plaque information available.';

  return `Your role is as a museum guide, the museum you are guiding today is the ${museumName}, we are currently in the ${location} and the artefact you are introducing is: ${artifact.name}, here is the information from the plaque for your reference:
${plaqueInfo}`;
}

// POST /generate-content/artefact/:artefactId - Generate content using Gemini
app.post('/generate-content/artefact/:artefactId', async (req, res) => {
  const startTime = Date.now();
  console.log(
    '[Generate Content] Starting request for artifact:',
    req.params.artefactId
  );

  try {
    const artefactId = Number(req.params.artefactId);
    console.log('[Generate Content] Parsed artifact ID:', artefactId);

    if (Number.isNaN(artefactId)) {
      console.error(
        '[Generate Content] Invalid artifact ID:',
        req.params.artefactId
      );
      return res.status(400).json({ error: 'Invalid artefactId' });
    }

    // Fetch artifact with related data
    console.log('[Generate Content] Fetching artifact from database...');
    const artifact = await prisma.artifact.findUnique({
      where: { id: artefactId },
      include: {
        room: {
          include: {
            museum: {
              select: {
                id: true,
                name: true,
              },
            },
            parentRoom: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    console.log('[Generate Content] Artifact fetched:', {
      id: artifact?.id,
      name: artifact?.name,
      hasRoom: !!artifact?.room,
      hasMuseum: !!artifact?.room?.museum,
    });

    if (!artifact) {
      console.error('[Generate Content] Artifact not found:', artefactId);
      return res.status(404).json({ error: 'Artifact not found' });
    }

    // Extract related entities
    const room = artifact.room;
    const museum = room?.museum || null;
    const parentRoom = room?.parentRoom || null;
    console.log('[Generate Content] Related entities:', {
      roomName: room?.name,
      museumName: museum?.name,
      parentRoomName: parentRoom?.name,
    });

    // Generate template
    console.log('[Generate Content] Generating template...');
    const template = generateIntroductionTemplate(
      {
        id: artifact.id,
        name: artifact.name,
        knowledgeText: artifact.knowledgeText,
        roomId: artifact.roomId,
      },
      room,
      museum,
      parentRoom
    );

    console.log(
      '[Generate Content] Template generated, length:',
      template.length
    );

    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('[Generate Content] GEMINI_API_KEY check:', {
      exists: !!apiKey,
      length: apiKey?.length || 0,
      startsWith: apiKey?.substring(0, 10) || 'N/A',
    });

    if (!apiKey) {
      console.error('[Generate Content] GEMINI_API_KEY not configured');
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    // Initialize Gemini client
    console.log('[Generate Content] Initializing Gemini client...');
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-flash as it's a cheap, non-thinking model
    const modelName = 'gemini-2.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });
    console.log('[Generate Content] Using model:', modelName);

    // Generate content
    console.log('[Generate Content] Calling Gemini API...');
    const geminiStartTime = Date.now();
    const result = await model.generateContent(template);
    const response = await result.response;
    const generatedText = response.text();
    const geminiDuration = Date.now() - geminiStartTime;
    console.log('[Generate Content] Gemini API response received:', {
      duration: `${geminiDuration}ms`,
      textLength: generatedText.length,
      preview: generatedText.substring(0, 100) + '...',
    });

    // Prepare data for database
    const contentData = {
      text: generatedText,
      type: 'introduction',
      artifactId: artefactId,
      llmProvider: 'google',
      model: modelName,
      prompt: template,
    };
    console.log('[Generate Content] Preparing to save content:', {
      textLength: contentData.text.length,
      type: contentData.type,
      artifactId: contentData.artifactId,
      llmProvider: contentData.llmProvider,
      model: contentData.model,
      promptLength: contentData.prompt.length,
    });

    // Check Prisma client schema
    console.log('[Generate Content] Checking Prisma Content model fields...');
    try {
      // Try to introspect what fields Prisma thinks exist
      const sampleContent = await prisma.content.findFirst();
      console.log('[Generate Content] Sample content from DB:', {
        hasLlmProvider: 'llmProvider' in (sampleContent || {}),
        hasModel: 'model' in (sampleContent || {}),
        hasPrompt: 'prompt' in (sampleContent || {}),
        fields: sampleContent ? Object.keys(sampleContent) : 'no content found',
      });
    } catch (introspectError) {
      console.warn(
        '[Generate Content] Could not introspect Content model:',
        introspectError
      );
    }

    // Save to Content table
    console.log('[Generate Content] Saving content to database...');
    const dbStartTime = Date.now();
    const content = await prisma.content.create({
      data: contentData,
    });
    const dbDuration = Date.now() - dbStartTime;
    console.log('[Generate Content] Content saved successfully:', {
      id: content.id,
      duration: `${dbDuration}ms`,
    });

    // Generate audio using Google Cloud Text-to-Speech
    let audioUrl: string | null = null;
    try {
      console.log('[Generate Content] Starting audio generation...');
      audioUrl = await generateAudioForContent(content.id, generatedText, {
        outputDir: audioDir,
      });

      // Update content with audio URL
      await prisma.content.update({
        where: { id: content.id },
        data: { audioUrl },
      });

      console.log('[Generate Content] Content updated with audio URL');
    } catch (audioError) {
      console.error('[Generate Content] Error generating audio:', audioError);
      // Don't fail the entire request if audio generation fails
      // Content is already saved, audio is optional
    }

    const totalDuration = Date.now() - startTime;
    console.log('[Generate Content] Complete:', {
      contentId: content.id,
      hasAudio: !!audioUrl,
      totalDuration: `${totalDuration}ms`,
    });

    // Return updated content with audioUrl
    const updatedContent = await prisma.content.findUnique({
      where: { id: content.id },
    });

    res.json(updatedContent);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Generate Content] Error occurred:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    if (error instanceof Error) {
      console.error('[Generate Content] Error details:', {
        name: error.name,
        message: error.message,
        cause: (error as unknown as { cause?: unknown }).cause,
      });

      // Log Prisma-specific errors in detail
      if (
        error.message.includes('prisma') ||
        error.message.includes('Invalid')
      ) {
        console.error(
          '[Generate Content] Prisma error detected - checking schema sync...'
        );
        console.error(
          '[Generate Content] Full error:',
          JSON.stringify(error, null, 2)
        );
      }
    }

    let errorMessage = 'Failed to generate content';

    if (error instanceof Error) {
      errorMessage = error.message;
      // If it's a Prisma error, provide more helpful context
      if (
        error.message.includes('prisma') ||
        error.message.includes('Invalid')
      ) {
        errorMessage = `Database error: ${error.message}\n\nThis usually means the Prisma client needs to be regenerated. Run: yarn prisma generate`;
      }
    }

    res.status(500).json({ error: errorMessage });
  }
});

// GET /generate-content/artefact/:artefactId/stream - Stream content generation using SSE
app.get('/generate-content/artefact/:artefactId/stream', async (req, res) => {
  const startTime = Date.now();
  console.log(
    '[Generate Content Stream] Starting request for artifact:',
    req.params.artefactId
  );

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const artefactId = Number(req.params.artefactId);

    if (Number.isNaN(artefactId)) {
      sendEvent('error', { error: 'Invalid artefactId' });
      res.end();
      return;
    }

    // Fetch artifact with related data
    sendEvent('status', { step: 'loading', message: 'Loading artifact data...' });

    const artifact = await prisma.artifact.findUnique({
      where: { id: artefactId },
      include: {
        room: {
          include: {
            museum: { select: { id: true, name: true } },
            parentRoom: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!artifact) {
      sendEvent('error', { error: 'Artifact not found' });
      res.end();
      return;
    }

    const room = artifact.room;
    const museum = room?.museum || null;
    const parentRoom = room?.parentRoom || null;

    // Generate template
    const template = generateIntroductionTemplate(
      {
        id: artifact.id,
        name: artifact.name,
        knowledgeText: artifact.knowledgeText,
        roomId: artifact.roomId,
      },
      room,
      museum,
      parentRoom
    );

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      sendEvent('error', { error: 'GEMINI_API_KEY not configured' });
      res.end();
      return;
    }

    // Initialize Gemini and start streaming
    sendEvent('status', { step: 'generating', message: 'Sending prompt to LLM...' });

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = 'gemini-2.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    // Use streaming API
    const result = await model.generateContentStream(template);

    let fullText = '';

    // Stream chunks to client
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      sendEvent('chunk', { text: chunkText });
    }

    console.log('[Generate Content Stream] Streaming complete, text length:', fullText.length);

    // Save to database
    sendEvent('status', { step: 'saving', message: 'Saving content...' });

    const content = await prisma.content.create({
      data: {
        text: fullText,
        type: 'introduction',
        artifactId: artefactId,
        llmProvider: 'google',
        model: modelName,
        prompt: template,
      },
    });

    // Generate audio
    sendEvent('status', { step: 'audio', message: 'Generating audio with text-to-speech...' });

    let audioUrl: string | null = null;
    try {
      audioUrl = await generateAudioForContent(content.id, fullText, {
        outputDir: audioDir,
      });

      await prisma.content.update({
        where: { id: content.id },
        data: { audioUrl },
      });
    } catch (audioError) {
      console.error('[Generate Content Stream] Audio generation failed:', audioError);
      // Continue without audio
    }

    // Send final complete event
    const finalContent = await prisma.content.findUnique({
      where: { id: content.id },
    });

    const totalDuration = Date.now() - startTime;
    console.log('[Generate Content Stream] Complete:', {
      contentId: content.id,
      hasAudio: !!audioUrl,
      totalDuration: `${totalDuration}ms`,
    });

    sendEvent('complete', { content: finalContent });
    res.end();
  } catch (error) {
    console.error('[Generate Content Stream] Error:', error);
    sendEvent('error', {
      error: error instanceof Error ? error.message : 'Failed to generate content',
    });
    res.end();
  }
});

// POST /generate-audio/artefact/:artefactId - Generate audio for artifact's content
app.post('/generate-audio/artefact/:artefactId', async (req, res) => {
  const startTime = Date.now();
  console.log(
    '[Generate Audio] Starting request for artifact:',
    req.params.artefactId
  );

  try {
    const artefactId = Number(req.params.artefactId);
    console.log('[Generate Audio] Parsed artifact ID:', artefactId);

    if (Number.isNaN(artefactId)) {
      console.error(
        '[Generate Audio] Invalid artifact ID:',
        req.params.artefactId
      );
      return res.status(400).json({ error: 'Invalid artefactId' });
    }

    // Find the most recent content for this artifact
    console.log('[Generate Audio] Fetching content for artifact...');
    const content = await prisma.content.findFirst({
      where: { artifactId: artefactId },
      orderBy: { createdAt: 'desc' },
    });

    if (!content) {
      console.error(
        '[Generate Audio] No content found for artifact:',
        artefactId
      );
      return res
        .status(404)
        .json({ error: 'No content found for this artifact' });
    }

    if (!content.text) {
      console.error(
        '[Generate Audio] Content has no text for artifact:',
        artefactId
      );
      return res
        .status(400)
        .json({ error: 'Content has no text to generate audio from' });
    }

    console.log('[Generate Audio] Found content:', {
      contentId: content.id,
      textLength: content.text.length,
    });

    // Generate audio
    console.log('[Generate Audio] Starting audio generation...');
    const audioUrl = await generateAudioForContent(content.id, content.text, {
      outputDir: audioDir,
    });

    // Update content with audio URL
    console.log('[Generate Audio] Updating content with audio URL...');
    const updatedContent = await prisma.content.update({
      where: { id: content.id },
      data: { audioUrl },
    });

    const duration = Date.now() - startTime;
    console.log('[Generate Audio] Complete:', {
      contentId: content.id,
      audioUrl,
      duration: `${duration}ms`,
    });

    res.json(updatedContent);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Generate Audio] Error occurred:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    let errorMessage = 'Failed to generate audio';

    if (error instanceof Error) {
      errorMessage = error.message;
      // If it's a Google Cloud credentials error, provide helpful context
      if (
        error.message.includes('GOOGLE_APPLICATION_CREDENTIALS') ||
        error.message.includes('credentials') ||
        error.message.includes('authentication')
      ) {
        errorMessage = `${error.message}\n\nMake sure GOOGLE_APPLICATION_CREDENTIALS is configured or Google Cloud credentials are set up correctly.`;
      }
    }

    res.status(500).json({ error: errorMessage });
  }
});

// POST /generate-audio/content/:contentId - Generate audio for a specific content item
app.post('/generate-audio/content/:contentId', async (req, res) => {
  const startTime = Date.now();
  console.log(
    '[Generate Audio] Starting request for content:',
    req.params.contentId
  );

  try {
    const contentId = Number(req.params.contentId);
    console.log('[Generate Audio] Parsed content ID:', contentId);

    if (Number.isNaN(contentId)) {
      console.error(
        '[Generate Audio] Invalid content ID:',
        req.params.contentId
      );
      return res.status(400).json({ error: 'Invalid contentId' });
    }

    // Find the content
    console.log('[Generate Audio] Fetching content...');
    const content = await prisma.content.findUnique({
      where: { id: contentId },
    });

    if (!content) {
      console.error('[Generate Audio] Content not found:', contentId);
      return res.status(404).json({ error: 'Content not found' });
    }

    if (!content.text) {
      console.error('[Generate Audio] Content has no text:', contentId);
      return res
        .status(400)
        .json({ error: 'Content has no text to generate audio from' });
    }

    console.log('[Generate Audio] Found content:', {
      contentId: content.id,
      textLength: content.text.length,
    });

    // Generate audio
    console.log('[Generate Audio] Starting audio generation...');
    const audioUrl = await generateAudioForContent(content.id, content.text, {
      outputDir: audioDir,
    });

    // Update content with audio URL
    console.log('[Generate Audio] Updating content with audio URL...');
    const updatedContent = await prisma.content.update({
      where: { id: content.id },
      data: { audioUrl },
    });

    const duration = Date.now() - startTime;
    console.log('[Generate Audio] Complete:', {
      contentId: content.id,
      audioUrl,
      duration: `${duration}ms`,
    });

    res.json(updatedContent);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Generate Audio] Error occurred:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    let errorMessage = 'Failed to generate audio';

    if (error instanceof Error) {
      errorMessage = error.message;
      // If it's a Google Cloud credentials error, provide helpful context
      if (
        error.message.includes('GOOGLE_APPLICATION_CREDENTIALS') ||
        error.message.includes('credentials') ||
        error.message.includes('authentication')
      ) {
        errorMessage = `${error.message}\n\nMake sure GOOGLE_APPLICATION_CREDENTIALS is configured or Google Cloud credentials are set up correctly.`;
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
        console.warn('Skipping museum with missing URI or label:', binding);
        continue;
      }

      const wikidataId = extractQId(museumUri);
      if (!wikidataId) {
        console.warn('Failed to extract Q-id from URI:', museumUri);
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
            if (createError?.code === 'P2002' && createError?.meta?.modelName === 'Museum') {
              // Slug collision - a museum with a similar name already exists
              // This can happen when Wikidata has multiple entries for similar museums
              console.warn(
                `Skipping museum ${wikidataId} (${museumLabel}): slug collision with existing museum`
              );
            } else {
              throw createError;
            }
          }
        }
      } catch (error) {
        console.error(`Error upserting museum ${wikidataId}:`, error);
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
    console.error('Error seeding museums:', error);
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
