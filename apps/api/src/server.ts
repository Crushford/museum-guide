import express from 'express';
import { prisma } from '@repo/db';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

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
  const museums = await prisma.museum.findMany({
    orderBy: {
      id: 'asc',
    },
  });
  res.json(museums);
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

  const rooms = await prisma.room.findMany({
    where: {
      museumId,
    },
    orderBy: {
      id: 'asc',
    },
  });

  res.json(rooms);
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
  const artifacts = await prisma.artifact.findMany({
    orderBy: {
      id: 'asc',
    },
  });
  res.json(artifacts);
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
    where: { museumId },
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
    where: { roomId },
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
    where: { artifactId },
    orderBy: { id: 'asc' },
  });

  res.json(content);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
