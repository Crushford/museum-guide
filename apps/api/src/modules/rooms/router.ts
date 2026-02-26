import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@repo/db';
import type { Prisma } from '@repo/db';
import createHttpError from 'http-errors';
import { requireAuth, requireAdmin } from '../../middleware/auth';
import {
  parseRequiredNumber,
  parseOptionalString,
  parseWithSchema,
} from '../../lib/http/validation';
import { generateSlug } from '../../lib/slug';
import { getDescendantRoomIds } from './service';

export const router = Router();

const createRoomBodySchema = z.preprocess(
  (value) => (value && typeof value === 'object' ? value : {}),
  z
    .object({
      name: z.unknown().optional(),
      museumId: z.unknown().optional(),
      parentRoomId: z.unknown().optional(),
      knowledgeText: z.unknown().optional(),
      furtherReading: z.unknown().optional(),
    })
    .superRefine((value, ctx) => {
      if (typeof value.name !== 'string' || value.name.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['name'],
          message: 'name is required',
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
      const museumId = Number(value.museumId);
      const parentRoomIdRaw = Number(value.parentRoomId);

      return {
        name: value.name as string,
        museumId,
        parentRoomId:
          value.parentRoomId === null
            ? null
            : Number.isFinite(parentRoomIdRaw)
              ? parentRoomIdRaw
              : undefined,
        knowledgeText:
          typeof value.knowledgeText === 'string'
            ? value.knowledgeText
            : undefined,
        furtherReading: Array.isArray(value.furtherReading)
          ? value.furtherReading.filter(
              (entry): entry is string => typeof entry === 'string'
            )
          : undefined,
      };
    })
);

const updateRoomBodySchema = z.preprocess(
  (value) => (value && typeof value === 'object' ? value : {}),
  z.object({
    name: z.string().optional(),
    museumId: z.union([z.coerce.number(), z.null()]).optional(),
    parentRoomId: z.union([z.coerce.number(), z.null()]).optional(),
    knowledgeText: z.union([z.string(), z.null()]).optional(),
    furtherReading: z.array(z.string()).optional(),
  })
);

// DELETE /rooms/:id - Delete a room
router.delete('/rooms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseRequiredNumber(req.params.id, 'Invalid room ID');

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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to delete room';
    res.status(500).json({ error: errorMessage });
  }
});

router.post('/rooms', requireAuth, requireAdmin, async (req, res) => {
  const { name, museumId, parentRoomId, knowledgeText, furtherReading } =
    parseWithSchema(createRoomBodySchema, req.body);

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

router.get('/museums/:museumId/rooms', async (req, res) => {
  const museumId = parseRequiredNumber(req.params.museumId, 'Invalid museumId');

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

// GET /rooms/:id - Get a single room by ID
router.get('/rooms/:id', async (req, res) => {
  try {
    const id = parseRequiredNumber(req.params.id, 'Invalid room ID');

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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch room';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /rooms/by-slug/:slug - Get a single room by slug (scoped by museumSlug query param)
router.get('/rooms/by-slug/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const museumSlug = parseOptionalString(req.query.museumSlug);

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

router.get('/rooms/:roomId/artifacts', async (req, res) => {
  const roomId = parseRequiredNumber(req.params.roomId, 'Invalid roomId');

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
router.get('/rooms/:id/children', async (req, res) => {
  try {
    const id = parseRequiredNumber(req.params.id, 'Invalid room ID');

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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch child rooms';
    res.status(500).json({ error: errorMessage });
  }
});

// PATCH /rooms/:id - Update a room
router.patch('/rooms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseRequiredNumber(req.params.id, 'Invalid room ID');

    const { name, museumId, parentRoomId, knowledgeText, furtherReading } =
      parseWithSchema(
        updateRoomBodySchema,
        req.body,
        'Invalid room update payload'
      );

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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to update room';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /rooms/:id/artifacts-recursive - Get all artifacts from room and all child rooms
router.get('/rooms/:id/artifacts-recursive', async (req, res) => {
  try {
    const id = parseRequiredNumber(req.params.id, 'Invalid room ID');
    const childRoomIds = await getDescendantRoomIds(id);
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
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to fetch recursive artifacts';
    res.status(500).json({ error: errorMessage });
  }
});
