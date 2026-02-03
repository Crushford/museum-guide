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

// GET /museums - List all museums
app.get('/museums', async (_req, res) => {
  try {
    const museums: MuseumResponse[] = await prisma.museum.findMany({
      orderBy: {
        id: 'asc',
      },
    });
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

    // Build a map for quick lookup
    const roomMap = new Map(allRooms.map((room) => [room.id, room]));

    // Helper function to find museum by traversing up parent room chain
    const findMuseumForRoom = (
      roomId: number | null
    ): { id: number; name: string } | null => {
      if (!roomId) return null;
      const room = roomMap.get(roomId);
      if (!room) {
        console.log(
          `[findMuseumForRoom] Room ${roomId} not found in map, depth: ${depth}`
        );
        return null;
      }

      console.log(
        `[findMuseumForRoom] Checking room ${roomId} (${room.name}), museumId: ${room.museumId}, parentRoomId: ${room.parentRoomId}, depth: ${depth}`
      );

      // If room has museum directly, return it
      if (room.museum) {
        console.log(
          `[findMuseumForRoom] Found museum directly: ${room.museum.name} (id: ${room.museum.id})`
        );
        return room.museum;
      }

      // Otherwise, traverse up parent room chain
      if (room.parentRoomId) {
        console.log(
          `[findMuseumForRoom] No museum on room ${roomId}, traversing to parent room ${room.parentRoomId}`
        );
        return findMuseumForRoom(room.parentRoomId, depth + 1);
      }

      console.log(
        `[findMuseumForRoom] Room ${roomId} has no museum and no parent room`
      );
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
        roomId: number;
        slug: string;
        knowledgeText: string | null;
        furtherReading: string[];
        room: {
          id: number;
          name: string;
          parentRoomId: number | null;
        } | null;
      };

      // Find museum by traversing up parent room chain
      const museum = artifactWithRoom.room
        ? findMuseumForRoom(artifactWithRoom.room.id)
        : null;

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
        museumId: museum?.id || null,
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
  const { name, roomId, knowledgeText, furtherReading } = req.body;

  if (!name || !roomId) {
    return res.status(400).json({ error: 'name and roomId are required' });
  }

  // Look up the room to get its museumId
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    return res.status(400).json({ error: 'Room not found' });
  }

  const artifact = await prisma.artifact.create({
    data: {
      name,
      slug: generateSlug(name),
      roomId,
      museumId: room.museumId,
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
  const { text, type, museumId, roomId, artifactId } = req.body;

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
        roomId: number;
        slug: string;
        knowledgeText: string | null;
        furtherReading: string[];
        room: {
          id: number;
          name: string;
          parentRoomId: number | null;
        } | null;
      };

      // Find museum by traversing up parent room chain
      const museum = artifactWithRoom.room
        ? findMuseumForRoom(artifactWithRoom.room.id)
        : null;

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
        museumId: museum?.id || null,
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
    roomId: number;
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
      totalDuration: `${Date.now() - startTime}ms`,
    });

    res.json(content);
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
        cause: error.cause,
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
