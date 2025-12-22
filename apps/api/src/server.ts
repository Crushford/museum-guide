import express from 'express';
import { prisma } from '@repo/db';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// ============================================================================
// NEW NODE-BASED ENDPOINTS
// ============================================================================

// 5A) List top-level museums (Nodes with type MUSEUM and parentId null)
app.get('/nodes/museums', async (_req, res) => {
  const museums = await prisma.node.findMany({
    where: {
      type: 'MUSEUM',
      parentId: null,
    },
    orderBy: {
      id: 'asc',
    },
  });
  res.json(museums);
});

// 5B) Get one node
app.get('/nodes/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }
  const node = await prisma.node.findUnique({
    where: { id },
  });
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }
  res.json(node);
});

// 5C) Get children of a node
app.get('/nodes/:id/children', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }
  const children = await prisma.node.findMany({
    where: {
      parentId: id,
    },
    orderBy: {
      id: 'asc',
    },
  });
  res.json(children);
});

// 5D) Create a node
app.post('/nodes', async (req, res) => {
  const { type, name, parentId } = req.body;

  if (!type || !name) {
    return res.status(400).json({ error: 'type and name are required' });
  }

  if (type === 'MUSEUM') {
    if (parentId !== null && parentId !== undefined) {
      return res.status(400).json({
        error: 'MUSEUM nodes must have parentId null',
      });
    }
  } else if (type === 'ROOM') {
    if (!parentId) {
      return res.status(400).json({
        error: 'ROOM nodes require parentId',
      });
    }
    // Validate parent is MUSEUM
    const parent = await prisma.node.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.type !== 'MUSEUM') {
      return res.status(400).json({
        error: 'ROOM parent must be a MUSEUM node',
      });
    }
  } else if (type === 'ARTIFACT') {
    if (!parentId) {
      return res.status(400).json({
        error: 'ARTIFACT nodes require parentId',
      });
    }
    // Validate parent is ROOM
    const parent = await prisma.node.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.type !== 'ROOM') {
      return res.status(400).json({
        error: 'ARTIFACT parent must be a ROOM node',
      });
    }
  } else {
    return res.status(400).json({
      error: 'type must be MUSEUM, ROOM, or ARTIFACT',
    });
  }

  const node = await prisma.node.create({
    data: {
      type,
      name,
      parentId: type === 'MUSEUM' ? null : parentId,
      knowledgeText: null,
      furtherReading: [],
    },
  });

  res.json(node);
});

// PATCH /nodes/:id - Update a node
app.patch('/nodes/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }

  const { name, knowledgeText, furtherReading } = req.body;

  // Build update data object
  const updateData: {
    name?: string;
    knowledgeText?: string | null;
    furtherReading?: string[];
  } = {};

  if (name !== undefined) {
    updateData.name = name;
  }

  if (knowledgeText !== undefined) {
    updateData.knowledgeText = knowledgeText || null;
  }

  if (furtherReading !== undefined) {
    if (!Array.isArray(furtherReading)) {
      return res.status(400).json({
        error: 'furtherReading must be an array of strings',
      });
    }
    // Validate all items are strings
    if (!furtherReading.every((item) => typeof item === 'string')) {
      return res.status(400).json({
        error: 'furtherReading must be an array of strings',
      });
    }
    updateData.furtherReading = furtherReading;
  }

  try {
    const node = await prisma.node.update({
      where: { id },
      data: updateData,
    });
    res.json(node);
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return res.status(404).json({ error: 'Node not found' });
    }
    throw error;
  }
});

// 5E) Content endpoints now attach by nodeId
app.post('/content-items', async (req, res) => {
  const { nodeId, type, title, body } = req.body;

  if (!nodeId || !type || !title || !body) {
    return res.status(400).json({
      error: 'nodeId, type, title, and body are required',
    });
  }

  const contentItem = await prisma.contentItem.create({
    data: {
      nodeId,
      type,
      title,
      body,
    },
  });

  res.json(contentItem);
});

app.get('/nodes/:id/content-items', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }
  const contentItems = await prisma.contentItem.findMany({
    where: { nodeId: id },
    orderBy: { id: 'asc' },
  });
  res.json(contentItems);
});

// GET /nodes/:id/playlist - Get node's placements grouped by role
app.get('/nodes/:id/playlist', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }

  const node = await prisma.node.findUnique({
    where: { id },
  });

  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  const placements = await prisma.nodeContent.findMany({
    where: { nodeId: id },
    include: { contentItem: true },
    orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
  });

  // Group by role
  const roles: Record<string, any[]> = {};
  for (const placement of placements) {
    if (!roles[placement.role]) {
      roles[placement.role] = [];
    }
    roles[placement.role].push({
      id: placement.id,
      sortOrder: placement.sortOrder,
      contentItem: {
        id: placement.contentItem.id,
        title: placement.contentItem.title,
        type: placement.contentItem.type,
        body: placement.contentItem.body,
        audioUrl: placement.contentItem.audioUrl,
      },
    });
  }

  res.json({
    node: {
      id: node.id,
      type: node.type,
      name: node.name,
    },
    roles,
  });
});

// POST /nodes/:id/outline - Ingest outline JSON and materialize placements
app.post('/nodes/:id/outline', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }

  const { outline } = req.body;

  if (!outline || typeof outline !== 'object') {
    return res.status(400).json({ error: 'outline must be an object' });
  }

  if (!outline.roles || typeof outline.roles !== 'object') {
    return res.status(400).json({
      error: 'outline must have a roles object',
    });
  }

  // Validate outline structure
  const roles = outline.roles;
  const roleKeys = Object.keys(roles);
  const allKeys: string[] = [];

  for (const roleKey of roleKeys) {
    if (!Array.isArray(roles[roleKey])) {
      return res.status(400).json({
        error: `roles.${roleKey} must be an array`,
      });
    }
    for (const item of roles[roleKey]) {
      if (!item.key || !item.title || !item.contentType) {
        return res.status(400).json({
          error: `Each outline item must have key, title, and contentType`,
        });
      }
      // Validate keys are unique across all roles for this node
      if (allKeys.includes(item.key)) {
        return res.status(400).json({
          error: `Duplicate key "${item.key}" found. Keys must be unique across all roles.`,
        });
      }
      allKeys.push(item.key);
    }
  }

  // Check node exists
  const node = await prisma.node.findUnique({
    where: { id },
  });

  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  // Update node with outline
  await prisma.node.update({
    where: { id },
    data: {
      outline: outline as any,
      outlineUpdatedAt: new Date(),
    },
  });

  let placementsCreated = 0;
  let contentItemsCreated = 0;

  // Materialize placements and content items
  for (const roleKey of roleKeys) {
    const items = roles[roleKey];
    const contentItemIdsToKeep: number[] = [];

    // First, delete any existing placements at sortOrders we'll be using
    // This handles the unique constraint on [nodeId, role, sortOrder]
    const sortOrdersToUse = items.map((_: any, index: number) => index);
    await prisma.nodeContent.deleteMany({
      where: {
        nodeId: id,
        role: roleKey,
        sortOrder: {
          in: sortOrdersToUse,
        },
      },
    });

    for (let sortOrder = 0; sortOrder < items.length; sortOrder++) {
      const item = items[sortOrder];
      const { key, title, contentType } = item;

      // Find or create ContentItem (scoped by nodeId + outlineKey)
      let contentItem = await prisma.contentItem.findFirst({
        where: {
          nodeId: id,
          outlineKey: key,
        },
      });

      if (!contentItem) {
        contentItem = await prisma.contentItem.create({
          data: {
            nodeId: id,
            type: contentType,
            title,
            body: '',
            outlineKey: key,
          },
        });
        contentItemsCreated++;
      } else {
        // Update title/type if changed
        await prisma.contentItem.update({
          where: { id: contentItem.id },
          data: {
            title,
            type: contentType,
          },
        });
      }

      contentItemIdsToKeep.push(contentItem.id);

      // Create NodeContent placement (we deleted conflicting ones above)
      await prisma.nodeContent.create({
        data: {
          nodeId: id,
          contentItemId: contentItem.id,
          role: roleKey,
          sortOrder,
        },
      });
      placementsCreated++;
    }

    // Cleanup: remove placements for this role that aren't in the new outline
    // This only deletes NodeContent rows, NOT ContentItems
    await prisma.nodeContent.deleteMany({
      where: {
        nodeId: id,
        role: roleKey,
        contentItemId: {
          notIn: contentItemIdsToKeep,
        },
      },
    });
  }

  res.json({
    success: true,
    nodeId: id,
    placementsCreated,
    contentItemsCreated,
  });
});

// GET /content-items/:id - Get single content item
app.get('/content-items/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid content item id' });
  }

  const contentItem = await prisma.contentItem.findUnique({
    where: { id },
    include: {
      nodeContents: {
        include: {
          node: {
            select: {
              id: true,
              type: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!contentItem) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  res.json(contentItem);
});

// PATCH /content-items/:id - Update content item
app.patch('/content-items/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid content item id' });
  }

  const { body, audioUrl } = req.body;

  const updateData: { body?: string; audioUrl?: string | null } = {};

  if (body !== undefined) {
    updateData.body = body;
  }

  if (audioUrl !== undefined) {
    updateData.audioUrl = audioUrl || null;
  }

  try {
    const contentItem = await prisma.contentItem.update({
      where: { id },
      data: updateData,
    });
    res.json(contentItem);
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return res.status(404).json({ error: 'Content item not found' });
    }
    throw error;
  }
});

// ============================================================================
// BACKWARDS COMPATIBILITY ENDPOINTS (using Node queries)
// ============================================================================

app.post('/museums', async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const museum = await prisma.museum.create({
    data: {
      name,
      description,
    },
  });
  res.json(museum);
});

app.get('/museums', async (_req, res) => {
  // Backwards compatibility: return Node museums
  const museums = await prisma.node.findMany({
    where: {
      type: 'MUSEUM',
      parentId: null,
    },
    orderBy: {
      id: 'asc',
    },
  });
  // Transform to match old format
  res.json(
    museums.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.knowledgeText,
      createdAt: m.createdAt,
    }))
  );
});

app.post('/rooms', async (req, res) => {
  const { name, museumId } = req.body;

  if (!name || !museumId) {
    return res.status(400).json({ error: 'name and museumId are required' });
  }

  const room = await prisma.room.create({
    data: {
      name,
      museumId,
    },
  });

  res.json(room);
});

app.get('/museums/:museumId/rooms', async (req, res) => {
  const museumId = Number(req.params.museumId);

  if (Number.isNaN(museumId)) {
    return res.status(400).json({ error: 'Invalid museumId' });
  }

  // Backwards compatibility: return Node rooms that are children of the museum
  const rooms = await prisma.node.findMany({
    where: {
      type: 'ROOM',
      parentId: museumId,
    },
    orderBy: {
      id: 'asc',
    },
  });

  // Transform to match old format
  res.json(
    rooms.map((r) => ({
      id: r.id,
      name: r.name,
      museumId: r.parentId,
      createdAt: r.createdAt,
    }))
  );
});

app.get('/rooms/:roomId/artifacts', async (req, res) => {
  const roomId = Number(req.params.roomId);

  if (Number.isNaN(roomId)) {
    return res.status(400).json({ error: 'Invalid roomId' });
  }

  // Backwards compatibility: return Node artifacts that are children of the room
  const artifacts = await prisma.node.findMany({
    where: {
      type: 'ARTIFACT',
      parentId: roomId,
    },
    orderBy: {
      id: 'asc',
    },
  });

  // Transform to match old format
  res.json(
    artifacts.map((a) => ({
      id: a.id,
      name: a.name,
      createdAt: a.createdAt,
    }))
  );
});

app.post('/artifacts', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const artifact = await prisma.artifact.create({
    data: {
      name,
    },
  });

  res.json(artifact);
});

app.get('/artifacts', async (_req, res) => {
  // Backwards compatibility: return Node artifacts
  const artifacts = await prisma.node.findMany({
    where: {
      type: 'ARTIFACT',
    },
    orderBy: {
      id: 'asc',
    },
  });
  // Transform to match old format
  res.json(
    artifacts.map((a) => ({
      id: a.id,
      name: a.name,
      createdAt: a.createdAt,
    }))
  );
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

  // Backwards compatibility: return ContentItems for the museum node
  const contentItems = await prisma.contentItem.findMany({
    where: { nodeId: museumId },
    orderBy: { id: 'asc' },
  });

  // Transform to match old format
  res.json(
    contentItems.map((c) => ({
      id: c.id,
      text: c.body,
      type: c.type,
      museumId: c.nodeId,
      roomId: null,
      artifactId: null,
      createdAt: c.createdAt,
    }))
  );
});

app.get('/rooms/:roomId/content', async (req, res) => {
  const roomId = Number(req.params.roomId);

  if (Number.isNaN(roomId)) {
    return res.status(400).json({ error: 'Invalid roomId' });
  }

  // Backwards compatibility: return ContentItems for the room node
  const contentItems = await prisma.contentItem.findMany({
    where: { nodeId: roomId },
    orderBy: { id: 'asc' },
  });

  // Transform to match old format
  res.json(
    contentItems.map((c) => ({
      id: c.id,
      text: c.body,
      type: c.type,
      museumId: null,
      roomId: c.nodeId,
      artifactId: null,
      createdAt: c.createdAt,
    }))
  );
});

app.get('/artifacts/:artifactId/content', async (req, res) => {
  const artifactId = Number(req.params.artifactId);

  if (Number.isNaN(artifactId)) {
    return res.status(400).json({ error: 'Invalid artifactId' });
  }

  // Backwards compatibility: return ContentItems for the artifact node
  const contentItems = await prisma.contentItem.findMany({
    where: { nodeId: artifactId },
    orderBy: { id: 'asc' },
  });

  // Transform to match old format
  res.json(
    contentItems.map((c) => ({
      id: c.id,
      text: c.body,
      type: c.type,
      museumId: null,
      roomId: null,
      artifactId: c.nodeId,
      createdAt: c.createdAt,
    }))
  );
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
