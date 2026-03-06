import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@repo/db';
import type { Prisma } from '@repo/db';
import createHttpError from 'http-errors';
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
import { buildUniqueArtifactSlug } from '../../lib/artifact-slug';
import { buildArtifactDisplayTitle } from '../../lib/artifact-scan';
import { getDescendantRoomIds } from '../rooms/service';

export const router = Router();

const checkDuplicatesBodySchema = z.preprocess(
  (value) => (value && typeof value === 'object' ? value : {}),
  z
    .object({
      name: z
        .string({ error: 'name is required' })
        .min(1, { error: 'name is required' }),
      knowledgeText: z.unknown().optional(),
      furtherReading: z.unknown().optional(),
    })
    .transform((value) => ({
      name: value.name,
      knowledgeText:
        typeof value.knowledgeText === 'string' ? value.knowledgeText : '',
      furtherReading: Array.isArray(value.furtherReading)
        ? value.furtherReading.filter(
            (entry): entry is string => typeof entry === 'string'
          )
        : [],
    }))
);

const artifactCreateBodySchema = z.preprocess(
  (value) => (value && typeof value === 'object' ? value : {}),
  z
    .object({
      name: z.unknown().optional(),
      displayTitle: z.unknown().optional(),
      roomId: z.unknown().optional(),
      museumId: z.unknown().optional(),
      knowledgeText: z.unknown().optional(),
      furtherReading: z.unknown().optional(),
      localTitle: z.unknown().optional(),
      localTitleLanguage: z.unknown().optional(),
      englishTitle: z.unknown().optional(),
      rawPlaqueText: z.unknown().optional(),
      knowledgeTextEn: z.unknown().optional(),
    })
    .superRefine((value, ctx) => {
      const fallbackName =
        (typeof value.displayTitle === 'string' && value.displayTitle.trim()) ||
        (typeof value.name === 'string' && value.name.trim());

      if (!fallbackName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'name or displayTitle is required',
        });
      }

      const museumId =
        value.museumId === undefined ||
        value.museumId === null ||
        value.museumId === ''
          ? NaN
          : Number(value.museumId);
      if (!Number.isFinite(museumId) || !value.museumId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['museumId'],
          message: 'museumId is required',
        });
      }
    })
    .transform((value) => {
      const fallbackName =
        (typeof value.displayTitle === 'string' && value.displayTitle.trim()) ||
        (typeof value.name === 'string' && value.name.trim()) ||
        '';

      const roomIdNum = Number(value.roomId);
      const museumIdNum = Number(value.museumId);

      return {
        fallbackName,
        name: typeof value.name === 'string' ? value.name : undefined,
        displayTitle:
          typeof value.displayTitle === 'string'
            ? value.displayTitle
            : undefined,
        roomId: Number.isFinite(roomIdNum) ? roomIdNum : undefined,
        museumId: museumIdNum,
        knowledgeText:
          typeof value.knowledgeText === 'string'
            ? value.knowledgeText
            : undefined,
        furtherReading: Array.isArray(value.furtherReading)
          ? value.furtherReading.filter(
              (entry): entry is string => typeof entry === 'string'
            )
          : [],
        localTitle:
          typeof value.localTitle === 'string' ? value.localTitle : undefined,
        localTitleLanguage:
          typeof value.localTitleLanguage === 'string'
            ? value.localTitleLanguage
            : undefined,
        englishTitle:
          typeof value.englishTitle === 'string'
            ? value.englishTitle
            : undefined,
        rawPlaqueText:
          typeof value.rawPlaqueText === 'string'
            ? value.rawPlaqueText
            : undefined,
        knowledgeTextEn:
          typeof value.knowledgeTextEn === 'string'
            ? value.knowledgeTextEn
            : undefined,
      };
    })
);

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
router.post(
  '/artifacts/check-duplicates',
  requireAuth,
  requireCreator,
  async (req, res) => {
    try {
      const { name, knowledgeText, furtherReading } = parseWithSchema(
        checkDuplicatesBodySchema,
        req.body,
        'name is required'
      );

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
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to check duplicates';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// DELETE /artifacts/:id - Delete an artifact
router.delete(
  '/artifacts/:id',
  requireAuth,
  requireCreator,
  async (req, res) => {
    try {
      const id = parseRequiredNumber(req.params.id, 'Invalid artifact ID');

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
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to delete artifact';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// GET /museums/:museumId/artifacts - Get all artifacts from all rooms in a museum (including child rooms) with slug
router.get('/museums/:museumId/artifacts', async (req, res) => {
  try {
    const museumId = parseRequiredNumber(
      req.params.museumId,
      'Invalid museumId'
    );

    // Get all rooms directly attached to the museum
    const topLevelRooms = await prisma.room.findMany({
      where: {
        museumId: museumId,
      },
      select: { id: true },
    });

    // Collect all room IDs (top-level + all child rooms)
    const allRoomIds: number[] = [];
    for (const room of topLevelRooms) {
      allRoomIds.push(room.id);
      const childRoomIds = await getDescendantRoomIds(room.id);
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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch artifacts';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /museums/:museumId/artifacts-recursive - Get all artifacts in a museum
router.get('/museums/:museumId/artifacts-recursive', async (req, res) => {
  try {
    const museumId = parseRequiredNumber(
      req.params.museumId,
      'Invalid museumId'
    );

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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to fetch artifacts for museum';
    res.status(500).json({ error: errorMessage });
  }
});

router.post('/artifacts', requireAuth, requireCreator, async (req, res) => {
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
    fallbackName,
    roomId,
    museumId,
    knowledgeText,
    furtherReading,
    localTitle,
    localTitleLanguage,
    englishTitle,
    rawPlaqueText,
    knowledgeTextEn,
  } = parseWithSchema(artifactCreateBodySchema, req.body);

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

  const txResult = await withPremiumAllowanceTransaction({
    res,
    actor: req.actor,
    increments: { artifactCreates: 1 },
    run: async (tx) =>
      tx.artifact.create({
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
      }),
  });
  if (!txResult.ok) {
    return;
  }
  const artifact = txResult.value;

  res.json(artifact);
});

router.get('/artifacts', async (_req, res) => {
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
router.get('/artifacts/:id', async (req, res) => {
  try {
    const id = parseRequiredNumber(req.params.id, 'Invalid artifact ID');

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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch artifact';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /artifacts/by-slug/:slug - Get a single artifact by slug (scoped by museumSlug query param)
router.get('/artifacts/by-slug/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const museumSlug = parseOptionalString(req.query.museumSlug);

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
