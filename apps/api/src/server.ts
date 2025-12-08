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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
