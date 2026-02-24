import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@repo/db';
import { makeRoom, makeArtifact } from './helpers/factories';
import { app } from '../server';
import { asUser, adminAuth } from './helpers/test-setup';

describe('GET /rooms/:id', () => {
  it('returns 200 with room when found', async () => {
    const room = makeRoom({ id: 1 });
    vi.mocked(prisma.room.findUnique).mockResolvedValue(room);
    const res = await request(app).get('/rooms/1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: room.name });
  });

  it('returns 404 when room not found', async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue(null);
    const res = await request(app).get('/rooms/999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/rooms/notanumber');
    expect(res.status).toBe(400);
  });
});

describe('GET /rooms/by-slug/:slug', () => {
  it('returns 200 with room when found', async () => {
    const room = makeRoom({ slug: 'test-room' });
    vi.mocked(prisma.room.findFirst).mockResolvedValue(room);
    const res = await request(app).get('/rooms/by-slug/test-room');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: 'test-room' });
  });

  it('returns 404 when room not found by slug', async () => {
    vi.mocked(prisma.room.findFirst).mockResolvedValue(null);
    const res = await request(app).get('/rooms/by-slug/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('GET /rooms/:roomId/artifacts', () => {
  it('returns 200 with artifacts array', async () => {
    vi.mocked(prisma.artifact.findMany).mockResolvedValue([
      makeArtifact({ id: 1, roomId: 1 }),
    ]);
    const res = await request(app).get('/rooms/1/artifacts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('name');
  });

  it('returns 400 for non-numeric roomId', async () => {
    const res = await request(app).get('/rooms/notanumber/artifacts');
    expect(res.status).toBe(400);
  });
});

describe('GET /rooms/:id/children', () => {
  it('returns 200 with child rooms array', async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      makeRoom({ id: 2, parentRoomId: 1 }),
    ]);
    const res = await request(app).get('/rooms/1/children');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 200 with empty array when no children', async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([]);
    const res = await request(app).get('/rooms/1/children');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/rooms/notanumber/children');
    expect(res.status).toBe(400);
  });
});

describe('GET /rooms/:id/artifacts-recursive', () => {
  it('returns 200 with artifacts from room and children', async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([]);
    vi.mocked(prisma.artifact.findMany).mockResolvedValue([
      makeArtifact({ id: 1, roomId: 1 }),
    ]);
    const res = await request(app).get('/rooms/1/artifacts-recursive');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('name');
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/rooms/notanumber/artifacts-recursive');
    expect(res.status).toBe(400);
  });
});

describe('POST /rooms', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app)
      .post('/rooms')
      .send({ name: 'Test Room', museumId: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/rooms')
      .set(asUser())
      .send({ name: 'Test Room', museumId: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/rooms')
      .set(adminAuth())
      .send({ museumId: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when museumId is missing', async () => {
    const res = await request(app)
      .post('/rooms')
      .set(adminAuth())
      .send({ name: 'Test Room' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with created room when admin provides valid data', async () => {
    const createdRoom = makeRoom({
      id: 5,
      name: 'New Room',
      museumId: 1,
      slug: 'test-slug',
    });
    vi.mocked(prisma.room.create).mockResolvedValue(createdRoom);

    const res = await request(app)
      .post('/rooms')
      .set(adminAuth())
      .send({ name: 'New Room', museumId: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 5, name: 'New Room' });
  });
});

describe('PATCH /rooms/:id', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).patch('/rooms/1').send({ name: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .patch('/rooms/1')
      .set(asUser())
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app)
      .patch('/rooms/notanumber')
      .set(adminAuth())
      .send({ name: 'Updated' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with updated room', async () => {
    const updatedRoom = makeRoom({ id: 1, name: 'Updated Room' });
    vi.mocked(prisma.room.update).mockResolvedValue(updatedRoom);

    const res = await request(app)
      .patch('/rooms/1')
      .set(adminAuth())
      .send({ name: 'Updated Room' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: 'Updated Room' });
  });
});

describe('DELETE /rooms/:id', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).delete('/rooms/1');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app).delete('/rooms/1').set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 404 when room not found', async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue(null);
    const res = await request(app).delete('/rooms/999').set(adminAuth());
    expect(res.status).toBe(404);
  });

  it('returns 204 when room deleted', async () => {
    const room = makeRoom({ id: 1 });
    vi.mocked(prisma.room.findUnique).mockResolvedValue(room);
    vi.mocked(prisma.room.delete).mockResolvedValue(room);

    const res = await request(app).delete('/rooms/1').set(adminAuth());

    expect(res.status).toBe(204);
  });
});
