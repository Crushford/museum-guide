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
