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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
