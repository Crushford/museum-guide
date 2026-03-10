import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@repo/db';
import type { Prisma } from '@repo/db';
import createHttpError from 'http-errors';
import type { MuseumResponse, WikidataSearchResult } from '@repo/types';
import { requireAuth, requireCreator } from '../../middleware/auth';
import {
  enforceUsageLimits,
  enforceSignupPolicy,
  withPremiumAllowanceTransaction,
} from '../../lib/usage-limits';
import {
  parseRequiredNumber,
  parseOptionalString,
  parseWithSchema,
} from '../../lib/http/validation';
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
  parseArtifactResults,
  type WikidataArtifactBinding,
} from '../../lib/wikidata';
import { generateSlug } from '../../lib/slug';
import { buildUniqueArtifactSlug } from '../../lib/artifact-slug';

export const router = Router();
export const apiRouter = Router();

const INVALID_NEARBY_COORDS_MESSAGE =
  'Invalid coordinates. Expected lat in [-90, 90] and lng in [-180, 180].';

const nearbySearchQuerySchema = z
  .object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    radiusKm: z.preprocess((value) => {
      if (value === undefined || value === null) return 5;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? 5 : parsed;
    }, z.number()),
    limit: z.preprocess((value) => {
      if (value === undefined || value === null) return 20;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? 20 : parsed;
    }, z.number()),
  })
  .superRefine((value, ctx) => {
    if (
      !Number.isFinite(value.lat) ||
      !Number.isFinite(value.lng) ||
      value.lat < -90 ||
      value.lat > 90 ||
      value.lng < -180 ||
      value.lng > 180
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: INVALID_NEARBY_COORDS_MESSAGE,
      });
    }
  })
  .transform((value) => ({
    lat: value.lat,
    lng: value.lng,
    radiusKm: Math.min(Math.max(value.radiusKm || 5, 1), 100),
    limit: Math.min(Math.max(value.limit || 20, 1), 100),
  }));

const searchQuerySchema = z.object({
  q: z
    .string({ error: 'Search query must be at least 2 characters' })
    .trim()
    .min(2, { error: 'Search query must be at least 2 characters' }),
});

const createMuseumBodySchema = z.preprocess(
  (value) => (value && typeof value === 'object' ? value : {}),
  z
    .object({
      name: z
        .string({ error: 'Name is required' })
        .min(1, { error: 'Name is required' }),
      knowledgeText: z.unknown().optional(),
      furtherReading: z.unknown().optional(),
    })
    .transform((value) => ({
      name: value.name,
      knowledgeText:
        typeof value.knowledgeText === 'string' && value.knowledgeText
          ? value.knowledgeText
          : null,
      furtherReading: Array.isArray(value.furtherReading)
        ? value.furtherReading.filter(
            (entry): entry is string => typeof entry === 'string'
          )
        : [],
    }))
);

const HYDRATION_CACHE_DAYS = 7;

function isRecentlyHydrated(timestamp: Date | null): boolean {
  if (!timestamp) return false;
  const daysSince = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince < HYDRATION_CACHE_DAYS;
}

// GET /api/museums/search - Search both database and Wikidata for museums
apiRouter.get('/search', async (req, res) => {
  try {
    const { q: searchTerm } = parseWithSchema(searchQuerySchema, req.query);

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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to search museums';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /api/museums/search/wikidata - Search Wikidata only (for explicit search button)
apiRouter.get('/search/wikidata', async (req, res) => {
  try {
    const { q: searchTerm } = parseWithSchema(searchQuerySchema, req.query);

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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to search Wikidata';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /api/museums/search/location - Search for museums by location/city name
apiRouter.get('/search/location', async (req, res) => {
  try {
    const { q: searchTerm } = parseWithSchema(searchQuerySchema, req.query);

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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to search museums by location';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /api/museums/search/nearby - Search for museums near coordinates
apiRouter.get('/search/nearby', async (req, res) => {
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
    const { lat, lng, radiusKm, limit } = parseWithSchema(
      nearbySearchQuerySchema,
      req.query,
      INVALID_NEARBY_COORDS_MESSAGE
    );
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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
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
apiRouter.post(
  '/select/:qid',
  requireAuth,
  requireCreator,
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

      const txResult = await withPremiumAllowanceTransaction({
        res,
        actor: req.actor,
        increments: { museumCreates: 1 },
        run: async (tx) =>
          tx.museum.create({
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
          }),
      });
      if (!txResult.ok) {
        return;
      }
      const museum = txResult.value;

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

// POST /api/museums/:slug/hydrate - Hydrate museum details from Wikidata/Wikipedia
apiRouter.post(
  '/:slug/hydrate',
  requireAuth,
  requireCreator,
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
apiRouter.post(
  '/:slug/hydrate-artifacts',
  requireAuth,
  requireCreator,
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
router.get('/', async (req, res) => {
  try {
    const citySlug = parseOptionalString(req.query.citySlug);

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
router.get('/:id', async (req, res) => {
  try {
    const id = parseRequiredNumber(req.params.id, 'Invalid museum ID');

    const museum = await prisma.museum.findUnique({
      where: { id },
    });

    if (!museum) {
      return res.status(404).json({ error: 'Museum not found' });
    }

    res.json(museum);
  } catch (error) {
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch museum';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /museums/by-slug/:slug - Get a single museum by slug
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;

    // Use findFirst since Prisma does not recognize dbgenerated fields in WhereUniqueInput
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

router.post('/', requireAuth, requireCreator, async (req, res) => {
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

  const { name, knowledgeText, furtherReading } = parseWithSchema(
    createMuseumBodySchema,
    req.body,
    'Name is required'
  );
  const txResult = await withPremiumAllowanceTransaction({
    res,
    actor: req.actor,
    increments: { museumCreates: 1 },
    run: async (tx) =>
      tx.museum.create({
        data: {
          name,
          slug: generateSlug(name),
          knowledgeText: knowledgeText || null,
          furtherReading: furtherReading || [],
        } as Prisma.MuseumCreateInput,
      }),
  });
  if (!txResult.ok) {
    return;
  }
  const museum = txResult.value;

  (res.locals as { usageDelta?: Record<string, number> }).usageDelta = {
    museumCreates: 1,
  };
  res.json(museum);
});

// DELETE /museums/:id - Delete a museum
router.delete('/:id', requireAuth, requireCreator, async (req, res) => {
  try {
    const id = parseRequiredNumber(req.params.id, 'Invalid museum ID');

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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to delete museum';
    res.status(500).json({ error: errorMessage });
  }
});
