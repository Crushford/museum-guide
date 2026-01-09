import express from 'express';
import { prisma } from '@repo/db';
import type {
  MuseumResponse,
  RoomResponse,
  ArtifactResponse,
} from '@repo/types';

const app = express();
const PORT = process.env.PORT || 3001;

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
      include: {
        room: {
          include: {
            museum: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
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
      if (newKnowledgeText && artifact.knowledgeText) {
        const knowledgeSimilarity = stringSimilarity(
          newKnowledgeText,
          artifact.knowledgeText.trim().toLowerCase()
        );
        if (knowledgeSimilarity >= 0.6) {
          matchReasons.push(
            `Knowledge text similarity: ${Math.round(knowledgeSimilarity * 100)}%`
          );
          maxSimilarity = Math.max(maxSimilarity, knowledgeSimilarity);
        }

        // Also check for substring matches (one contains significant portion of the other)
        const shorter =
          newKnowledgeText.length < artifact.knowledgeText.length
            ? newKnowledgeText
            : artifact.knowledgeText.trim().toLowerCase();
        const longer =
          newKnowledgeText.length >= artifact.knowledgeText.length
            ? newKnowledgeText
            : artifact.knowledgeText.trim().toLowerCase();

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
      const artifactUrls = (artifact.furtherReading || []).map(normalizeUrl);
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
          knowledgeText: artifact.knowledgeText,
          furtherReading: artifact.furtherReading || [],
          roomName: artifact.room?.name || null,
          museumName: artifact.room?.museum?.name || null,
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

    const rooms = await prisma.room.findMany({
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

    const response: RoomResponse[] = rooms.map((room) => ({
      id: room.id,
      name: room.name,
      museumId: room.museumId,
      museumName: room.museum?.name || null,
      updatedAt: room.updatedAt,
    }));
    res.json(response);
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

    const artifacts = await prisma.artifact.findMany({
      where,
      include: {
        room: {
          include: {
            museum: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    const response: ArtifactResponse[] = artifacts.map((artifact) => {
      // Type assertion to work around Prisma type inference issue
      const artifactWithRoom = artifact as typeof artifact & {
        roomId: number;
        room: {
          name: string;
          museum: { id: number; name: string } | null;
        } | null;
      };
      return {
        id: artifactWithRoom.id,
        name: artifactWithRoom.name,
        roomId: artifactWithRoom.roomId,
        roomName: artifactWithRoom.room?.name || null,
        museumId: artifactWithRoom.room?.museum?.id || null,
        museumName: artifactWithRoom.room?.museum?.name || null,
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
      knowledgeText: knowledgeText || null,
      furtherReading: furtherReading || [],
    },
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

  if (!museumId && !parentRoomId) {
    return res.status(400).json({
      error: 'Either museumId or parentRoomId is required',
    });
  }

  if (museumId && parentRoomId) {
    return res.status(400).json({
      error: 'Cannot set both museumId and parentRoomId',
    });
  }

  const roomData: {
    name: string;
    museumId?: number | null;
    parentRoomId?: number | null;
    knowledgeText?: string | null;
    furtherReading?: string[];
  } = {
    name,
  };

  if (museumId) {
    roomData.museumId = museumId;
  }
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
    orderBy: {
      id: 'asc',
    },
  });

  res.json(
    rooms.map((r) => ({
      id: r.id,
      name: r.name,
      museumId: r.museumId,
      createdAt: r.createdAt,
    }))
  );
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
        where: { parentRoomId: parentId },
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
      },
      orderBy: {
        id: 'asc',
      },
    });

    res.json(
      artifacts.map((a) => ({
        id: a.id,
        name: a.name,
        roomId: a.roomId,
        createdAt: a.createdAt,
      }))
    );
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
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({
      id: room.id,
      name: room.name,
      museumId: room.museumId,
      parentRoomId: room.parentRoomId,
      knowledgeText: room.knowledgeText,
      furtherReading: room.furtherReading,
    });
  } catch (error) {
    console.error('Error fetching room:', error);
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
    },
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
      },
      orderBy: {
        id: 'asc',
      },
    });

    res.json(
      childRooms.map((r) => ({
        id: r.id,
        name: r.name,
        museumId: r.museumId,
        parentRoomId: r.parentRoomId,
      }))
    );
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
      data: updateData as any,
    });

    res.json({
      id: room.id,
      name: room.name,
      museumId: room.museumId,
      parentRoomId: room.parentRoomId,
      knowledgeText: room.knowledgeText,
      furtherReading: room.furtherReading,
    });
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
        where: { parentRoomId: parentId },
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
      },
      orderBy: {
        id: 'asc',
      },
    });

    res.json(
      artifacts.map((a) => ({
        id: a.id,
        name: a.name,
        roomId: a.roomId,
        createdAt: a.createdAt,
      }))
    );
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

  const artifact = await prisma.artifact.create({
    data: {
      name,
      roomId,
      knowledgeText: knowledgeText || null,
      furtherReading: furtherReading || [],
    },
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
    });

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json({
      id: artifact.id,
      name: artifact.name,
      roomId: artifact.roomId,
      knowledgeText: artifact.knowledgeText,
      furtherReading: artifact.furtherReading,
    });
  } catch (error) {
    console.error('Error fetching artifact:', error);
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
