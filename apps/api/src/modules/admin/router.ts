import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@repo/db';
import type { Prisma } from '@repo/db';
import { resolve } from 'path';
import createHttpError from 'http-errors';
import type { RoomResponse, ArtifactResponse } from '@repo/types';
import { requireAuth, requireAdmin } from '../../middleware/auth';
import {
  enforceUsageLimits,
  enforceSignupPolicy,
} from '../../lib/usage-limits';
import { GLOBAL_DAILY_LIMITS } from '../../lib/usage-limit-constants';
import {
  parseOptionalNumberFilter,
  parseRequiredNumber,
  parseWithSchema,
} from '../../lib/http/validation';
import { parseTtsProvider, getDefaultTtsProvider } from '../../lib/audio';
import {
  generateIntroduction,
  SpendLimitError,
} from '../../lib/llm/generate-content';
import { getMonthlySpendEur } from '../../lib/llm/cost-tracker';
import {
  canCreateContent,
  dbRoleFromUserRole,
  normalizeDbRole,
  USER_ROLES,
  type UserRole,
} from '../../lib/user-roles';
import { adminAuth } from '../../lib/firebase-admin';

export const router = Router();

const audioDir = resolve(__dirname, '../../../public/audio');

const adminApiCallsQuerySchema = z
  .preprocess(
    (value) => (value && typeof value === 'object' ? value : {}),
    z.object({
      service: z.unknown().optional(),
      page: z.preprocess((raw) => {
        if (raw === undefined || raw === null) return 1;
        const parsed = Number(raw);
        return Number.isNaN(parsed) ? 1 : parsed;
      }, z.number()),
      pageSize: z.preprocess((raw) => {
        if (raw === undefined || raw === null) return 50;
        const parsed = Number(raw);
        return Number.isNaN(parsed) ? 50 : parsed;
      }, z.number()),
    })
  )
  .transform((value) => ({
    service: typeof value.service === 'string' ? value.service : undefined,
    page: Math.max(1, value.page || 1),
    pageSize: Math.min(100, Math.max(1, value.pageSize || 50)),
  }));

const generateIntroductionBodySchema = z
  .preprocess(
    (value) => (value && typeof value === 'object' ? value : {}),
    z.object({
      provider: z.enum(['google', 'openai']),
      ttsProvider: z.unknown().optional(),
    })
  )
  .transform((value) => value);

const updateUserRoleBodySchema = z
  .preprocess(
    (value) => (value && typeof value === 'object' ? value : {}),
    z.object({
      role: z.enum(USER_ROLES),
    })
  )
  .transform((value) => value);

const createPromoCodeBodySchema = z
  .preprocess(
    (value) => (value && typeof value === 'object' ? value : {}),
    z.object({
      code: z.string().trim().min(1),
      maxRedemptions: z.coerce.number().int().min(1).max(10000),
      isActive: z.boolean().optional(),
    })
  )
  .transform((value) => ({
    code: value.code.trim().toLowerCase(),
    maxRedemptions: value.maxRedemptions,
    isActive: value.isActive ?? true,
  }));

function isMissingColumnOrTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as { code?: string; message?: string };
  if (err.code === 'P2021' || err.code === 'P2022') {
    return true;
  }

  const message = (err.message ?? '').toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('column') ||
    message.includes('table')
  );
}

// GET /admin/rooms - List all rooms with museum info
router.get('/rooms', requireAuth, requireAdmin, async (req, res) => {
  try {
    const museumId = parseOptionalNumberFilter(req.query.museumId);

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
router.get('/artifacts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const museumId = parseOptionalNumberFilter(req.query.museumId);
    const roomId = parseOptionalNumberFilter(req.query.roomId);

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

// POST /admin/artifacts/:artifactId/generate-introduction
router.post(
  '/artifacts/:artifactId/generate-introduction',
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

      const artifactId = parseRequiredNumber(
        req.params.artifactId,
        'Invalid artifactId'
      );
      const { provider: providerName, ttsProvider: ttsProviderInput } =
        parseWithSchema(
          generateIntroductionBodySchema,
          req.body,
          'provider must be "google" or "openai"'
        );
      const ttsProvider = parseTtsProvider(
        ttsProviderInput,
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
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
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
router.get(
  '/llm-usage/monthly',
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
router.get(
  '/openai-usage/daily',
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
router.get('/api-calls/daily', requireAuth, requireAdmin, async (_req, res) => {
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

    const services = Array.from(byService.entries()).map(([service, data]) => ({
      service,
      count: data.count,
      avgDurationMs: Math.round(data.totalDurationMs / data.count),
    }));

    res.json({ totalCalls, services, globalLimits: GLOBAL_DAILY_LIMITS });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch daily API call data' });
  }
});

// GET /admin/api-calls - Paginated recent API calls
router.get('/api-calls', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { service, page, pageSize } = parseWithSchema(
      adminApiCallsQuerySchema,
      req.query
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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    res.status(500).json({ error: 'Failed to fetch API calls' });
  }
});

router.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const authUsers = await adminAuth.listUsers(1000);
    let users: Array<{
      uid: string;
      email: string | null;
      displayName: string | null;
      role: string | null;
      createdAt: Date | null;
      updatedAt: Date | null;
      upgradedAt: Date | null;
      upgradeCode: string | null;
    }> = [];

    try {
      users = await prisma.appUser.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      if (!isMissingColumnOrTableError(error)) {
        throw error;
      }
      const fallbackRows = await prisma.$queryRaw<
        Array<{
          uid: string;
          email: string | null;
          displayName: string | null;
          createdAt: Date | null;
          updatedAt: Date | null;
        }>
      >`SELECT uid, email, "displayName", "createdAt", "updatedAt" FROM "AppUser" ORDER BY "createdAt" DESC`;
      users = fallbackRows.map((row) => ({
        ...row,
        role: null,
        upgradedAt: null,
        upgradeCode: null,
      }));
    }

    let redemptionRows: Array<{
      userUid: string;
      code: string;
      redeemedAt: Date;
    }> = [];
    try {
      const records = await prisma.promoCodeRedemption.findMany({
        select: {
          userUid: true,
          redeemedAt: true,
          promoCode: {
            select: {
              code: true,
            },
          },
        },
        orderBy: {
          redeemedAt: 'desc',
        },
      });
      redemptionRows = records.map((record) => ({
        userUid: record.userUid,
        code: record.promoCode.code,
        redeemedAt: record.redeemedAt,
      }));
    } catch (error) {
      if (!isMissingColumnOrTableError(error)) {
        throw error;
      }
    }

    const promoUsageByUser = new Map<
      string,
      Array<{ code: string; uses: number; lastRedeemedAt: Date }>
    >();
    for (const redemption of redemptionRows) {
      const entries = promoUsageByUser.get(redemption.userUid) ?? [];
      const existing = entries.find((entry) => entry.code === redemption.code);
      if (existing) {
        existing.uses += 1;
        if (redemption.redeemedAt > existing.lastRedeemedAt) {
          existing.lastRedeemedAt = redemption.redeemedAt;
        }
      } else {
        entries.push({
          code: redemption.code,
          uses: 1,
          lastRedeemedAt: redemption.redeemedAt,
        });
      }
      promoUsageByUser.set(redemption.userUid, entries);
    }

    const authUserMap = new Map(
      authUsers.users.map((user) => [user.uid, user])
    );
    const seen = new Set<string>();

    const rows: Array<{
      uid: string;
      email: string | null;
      displayName: string | null;
      role: UserRole;
      canCreate: boolean;
      createdAt: Date | null;
      updatedAt: Date | null;
      upgradedAt: Date | null;
      upgradeCode: string | null;
      promoUsage: Array<{ code: string; uses: number; lastRedeemedAt: Date }>;
    }> = users.map((row) => {
      seen.add(row.uid);
      const authUser = authUserMap.get(row.uid);
      const effectiveRole = normalizeDbRole(
        row.role,
        authUser?.customClaims?.admin === true
      );
      return {
        uid: row.uid,
        email: row.email ?? authUser?.email ?? null,
        displayName: row.displayName ?? authUser?.displayName ?? null,
        role: effectiveRole,
        canCreate: canCreateContent(effectiveRole),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        upgradedAt: row.upgradedAt,
        upgradeCode: row.upgradeCode,
        promoUsage: promoUsageByUser.get(row.uid) ?? [],
      };
    });

    for (const authUser of authUsers.users) {
      if (seen.has(authUser.uid)) {
        continue;
      }
      const effectiveRole = normalizeDbRole(
        null,
        authUser.customClaims?.admin === true
      );
      rows.push({
        uid: authUser.uid,
        email: authUser.email ?? null,
        displayName: authUser.displayName ?? null,
        role: effectiveRole,
        canCreate: canCreateContent(effectiveRole),
        createdAt: authUser.metadata.creationTime
          ? new Date(authUser.metadata.creationTime)
          : null,
        updatedAt: authUser.metadata.lastRefreshTime
          ? new Date(authUser.metadata.lastRefreshTime)
          : null,
        upgradedAt: null,
        upgradeCode: null,
        promoUsage: promoUsageByUser.get(authUser.uid) ?? [],
      });
    }

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load users',
    });
  }
});

router.get('/promo-codes', requireAuth, requireAdmin, async (_req, res) => {
  try {
    let codes: Array<{
      id: number;
      code: string;
      isActive: boolean;
      maxRedemptions: number;
      createdAt: Date;
      updatedAt: Date;
      _count: { redemptions: number };
      redemptions: Array<{
        userUid: string;
        redeemedAt: Date;
        user: { email: string | null; displayName: string | null } | null;
      }>;
    }> = [];

    try {
      codes = await prisma.promoCode.findMany({
        include: {
          _count: {
            select: { redemptions: true },
          },
          redemptions: {
            orderBy: { redeemedAt: 'desc' },
            take: 30,
            select: {
              userUid: true,
              redeemedAt: true,
              user: {
                select: {
                  email: true,
                  displayName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      if (!isMissingColumnOrTableError(error)) {
        throw error;
      }
      return res.json([]);
    }

    res.json(
      codes.map((code) => ({
        id: code.id,
        code: code.code,
        isActive: code.isActive,
        maxRedemptions: code.maxRedemptions,
        usedRedemptions: code._count.redemptions,
        remainingRedemptions: Math.max(
          0,
          code.maxRedemptions - code._count.redemptions
        ),
        redemptions: code.redemptions.map((redemption) => ({
          userUid: redemption.userUid,
          email: redemption.user?.email ?? null,
          displayName: redemption.user?.displayName ?? null,
          redeemedAt: redemption.redeemedAt,
        })),
        createdAt: code.createdAt,
        updatedAt: code.updatedAt,
      }))
    );
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to fetch promo code usage',
    });
  }
});

router.patch(
  '/users/:uid/role',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const uid = req.params.uid?.trim();
      if (!uid) {
        return res.status(400).json({ error: 'uid is required' });
      }

      const parsed = parseWithSchema(updateUserRoleBodySchema, req.body);
      const nextRole: UserRole = parsed.role;
      const authUser = await adminAuth.getUser(uid);
      const currentClaims = authUser.customClaims ?? {};
      const shouldBeAdmin = nextRole === 'admin';
      const nextClaims = shouldBeAdmin
        ? { ...currentClaims, admin: true }
        : { ...currentClaims, admin: false };
      await adminAuth.setCustomUserClaims(uid, nextClaims);

      const saved = await prisma.appUser.upsert({
        where: { uid },
        update: {
          email: authUser.email ?? null,
          displayName: authUser.displayName ?? null,
          role: dbRoleFromUserRole(nextRole),
        },
        create: {
          uid,
          email: authUser.email ?? null,
          displayName: authUser.displayName ?? null,
          role: dbRoleFromUserRole(nextRole),
        },
      });

      res.json({
        uid: saved.uid,
        email: saved.email,
        displayName: saved.displayName,
        role: nextRole,
        canCreate: canCreateContent(nextRole),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to update user role',
      });
    }
  }
);

router.post('/promo-codes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = parseWithSchema(createPromoCodeBodySchema, req.body);
    const created = await prisma.promoCode.create({
      data: {
        code: parsed.code,
        maxRedemptions: parsed.maxRedemptions,
        isActive: parsed.isActive,
      },
    });
    res.status(201).json({
      id: created.id,
      code: created.code,
      isActive: created.isActive,
      maxRedemptions: created.maxRedemptions,
      usedRedemptions: 0,
      remainingRedemptions: created.maxRedemptions,
      redemptions: [],
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return res.status(409).json({ error: 'Promo code already exists.' });
    }
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to create promo code',
    });
  }
});
