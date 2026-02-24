import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@repo/db';
import { makeMuseum, makeRoom, makeArtifact } from './helpers/factories';
import { app } from '../server';
import { asUser, adminAuth } from './helpers/test-setup';

describe('GET /museums', () => {
  it('returns 200 with array of museums', async () => {
    vi.mocked(prisma.museum.findMany).mockResolvedValue([
      makeMuseum(),
      makeMuseum({ id: 2, name: 'Museum 2' }),
    ]);
    const res = await request(app).get('/museums');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it('returns empty array when no museums', async () => {
    vi.mocked(prisma.museum.findMany).mockResolvedValue([]);
    const res = await request(app).get('/museums');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /museums/:id', () => {
  it('returns 200 with museum when found', async () => {
    const museum = makeMuseum({ id: 1 });
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(museum);
    const res = await request(app).get('/museums/1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: museum.name });
  });

  it('returns 404 when museum not found', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(null);
    const res = await request(app).get('/museums/999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/museums/notanumber');
    expect(res.status).toBe(400);
  });
});

describe('GET /museums/by-slug/:slug', () => {
  it('returns 200 with museum when found', async () => {
    const museum = makeMuseum({ slug: 'test-museum' });
    vi.mocked(prisma.museum.findFirst).mockResolvedValue(museum);
    const res = await request(app).get('/museums/by-slug/test-museum');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: 'test-museum' });
  });

  it('returns 404 when museum not found by slug', async () => {
    vi.mocked(prisma.museum.findFirst).mockResolvedValue(null);
    const res = await request(app).get('/museums/by-slug/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('GET /museums/:museumId/rooms', () => {
  it('returns 200 with rooms array', async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      makeRoom({ id: 1, museumId: 1 }),
      makeRoom({ id: 2, museumId: 1, name: 'Room 2' }),
    ]);
    const res = await request(app).get('/museums/1/rooms');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it('returns 400 for non-numeric museumId', async () => {
    const res = await request(app).get('/museums/notanumber/rooms');
    expect(res.status).toBe(400);
  });
});

describe('GET /museums/:museumId/artifacts', () => {
  it('returns 200 with empty array when museum has no rooms', async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([]);
    const res = await request(app).get('/museums/1/artifacts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 with artifacts array when museum has rooms', async () => {
    vi.mocked(prisma.room.findMany)
      .mockResolvedValueOnce([makeRoom({ id: 1, museumId: 1 })])
      .mockResolvedValue([]);
    vi.mocked(prisma.artifact.findMany).mockResolvedValue([
      makeArtifact({ id: 1, roomId: 1 }),
    ]);
    const res = await request(app).get('/museums/1/artifacts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 400 for non-numeric museumId', async () => {
    const res = await request(app).get('/museums/notanumber/artifacts');
    expect(res.status).toBe(400);
  });
});

describe('POST /museums', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app)
      .post('/museums')
      .send({ name: 'Test Museum' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/museums')
      .set(asUser())
      .send({ name: 'Test Museum' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/museums').set(adminAuth()).send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with created museum when admin provides name', async () => {
    const createdMuseum = makeMuseum({
      id: 5,
      name: 'New Museum',
      slug: 'test-slug',
    });
    vi.mocked(prisma.museum.create).mockResolvedValue(createdMuseum);

    const res = await request(app)
      .post('/museums')
      .set(adminAuth())
      .send({ name: 'New Museum' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 5, name: 'New Museum' });
  });
});

describe('DELETE /museums/:id', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).delete('/museums/1');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app).delete('/museums/1').set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 404 when museum not found', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(null);
    const res = await request(app).delete('/museums/999').set(adminAuth());
    expect(res.status).toBe(404);
  });

  it('returns 200 with success when museum deleted', async () => {
    const museum = makeMuseum({ id: 1 });
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(museum);
    vi.mocked(prisma.museum.delete).mockResolvedValue(museum);

    const res = await request(app).delete('/museums/1').set(adminAuth());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});
