import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@repo/db';
import { makeMuseum, makeRoom, makeArtifact } from './helpers/factories';
import { app } from '../server';
import { asUser, adminAuth } from './helpers/test-setup';

describe('GET /artifacts', () => {
  it('returns 200 with array of artifacts', async () => {
    vi.mocked(prisma.artifact.findMany).mockResolvedValue([
      makeArtifact({ id: 1 }),
      makeArtifact({ id: 2, displayTitle: 'Artifact 2' }),
    ]);
    const res = await request(app).get('/artifacts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('createdAt');
  });

  it('returns empty array when no artifacts', async () => {
    vi.mocked(prisma.artifact.findMany).mockResolvedValue([]);
    const res = await request(app).get('/artifacts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /artifacts/:id', () => {
  it('returns 200 with artifact when found', async () => {
    const artifact = makeArtifact({ id: 1 });
    vi.mocked(prisma.artifact.findUnique).mockResolvedValue(artifact);
    const res = await request(app).get('/artifacts/1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: artifact.displayTitle });
  });

  it('returns 404 when artifact not found', async () => {
    vi.mocked(prisma.artifact.findUnique).mockResolvedValue(null);
    const res = await request(app).get('/artifacts/999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/artifacts/notanumber');
    expect(res.status).toBe(400);
  });
});

describe('GET /artifacts/by-slug/:slug', () => {
  it('returns 200 with artifact when found', async () => {
    const artifact = makeArtifact({ slug: 'test-artifact' });
    vi.mocked(prisma.artifact.findFirst).mockResolvedValue(artifact);
    const res = await request(app).get('/artifacts/by-slug/test-artifact');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      slug: 'test-artifact',
      name: artifact.displayTitle,
    });
  });

  it('returns 404 when artifact not found by slug', async () => {
    vi.mocked(prisma.artifact.findFirst).mockResolvedValue(null);
    const res = await request(app).get('/artifacts/by-slug/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /artifacts', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app)
      .post('/artifacts')
      .send({ name: 'Test', museumId: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/artifacts')
      .set(asUser())
      .send({ name: 'Test', museumId: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when name/displayTitle is missing', async () => {
    const res = await request(app)
      .post('/artifacts')
      .set(adminAuth())
      .send({ museumId: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when museumId is missing', async () => {
    const res = await request(app)
      .post('/artifacts')
      .set(adminAuth())
      .send({ name: 'Test Artifact' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when museum not found', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(null);
    const res = await request(app)
      .post('/artifacts')
      .set(adminAuth())
      .send({ name: 'Test Artifact', museumId: 999 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with created artifact when admin provides valid data', async () => {
    const museum = makeMuseum({ id: 1 });
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(museum);
    const createdArtifact = makeArtifact({
      id: 5,
      displayTitle: 'Test Artifact',
      museumId: 1,
    });
    vi.mocked(prisma.artifact.create).mockResolvedValue(createdArtifact);

    const res = await request(app)
      .post('/artifacts')
      .set(adminAuth())
      .send({ name: 'Test Artifact', museumId: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 5 });
  });
});

describe('DELETE /artifacts/:id', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).delete('/artifacts/1');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app).delete('/artifacts/1').set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 404 when artifact not found', async () => {
    vi.mocked(prisma.artifact.findUnique).mockResolvedValue(null);
    const res = await request(app).delete('/artifacts/999').set(adminAuth());
    expect(res.status).toBe(404);
  });

  it('returns 204 when artifact deleted', async () => {
    const artifact = makeArtifact({ id: 1 });
    vi.mocked(prisma.artifact.findUnique).mockResolvedValue(artifact);
    vi.mocked(prisma.artifact.delete).mockResolvedValue(artifact);

    const res = await request(app).delete('/artifacts/1').set(adminAuth());

    expect(res.status).toBe(204);
  });
});

describe('POST /artifacts/check-duplicates', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app)
      .post('/artifacts/check-duplicates')
      .send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/artifacts/check-duplicates')
      .set(asUser())
      .send({ name: 'Test' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/artifacts/check-duplicates')
      .set(adminAuth())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with duplicates and totalChecked when valid', async () => {
    vi.mocked(prisma.artifact.findMany).mockResolvedValue([
      makeArtifact({ id: 1, displayTitle: 'Test Artifact' }),
      makeArtifact({ id: 2, displayTitle: 'Another Artifact' }),
    ]);

    const res = await request(app)
      .post('/artifacts/check-duplicates')
      .set(adminAuth())
      .send({ name: 'Test Artifact' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('duplicates');
    expect(res.body).toHaveProperty('totalChecked', 2);
    expect(Array.isArray(res.body.duplicates)).toBe(true);
  });

  it('finds similar artifacts by name', async () => {
    vi.mocked(prisma.artifact.findMany).mockResolvedValue([
      makeArtifact({ id: 1, displayTitle: 'Test Artifact' }),
    ]);

    const res = await request(app)
      .post('/artifacts/check-duplicates')
      .set(adminAuth())
      .send({ name: 'Test Artifact' });

    expect(res.status).toBe(200);
    expect(res.body.duplicates).toHaveLength(1);
    expect(res.body.duplicates[0]).toHaveProperty('id', 1);
    expect(res.body.duplicates[0]).toHaveProperty('similarity');
    expect(res.body.duplicates[0]).toHaveProperty('matchReasons');
  });
});
