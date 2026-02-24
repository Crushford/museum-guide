import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@repo/db';
import {
  makeMuseum,
  makeRoom,
  makeArtifact,
  makeContent,
} from './helpers/factories';
import { app } from '../server';
import { asUser, adminAuth } from './helpers/test-setup';

describe('POST /content', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app)
      .post('/content')
      .send({ text: 'Content', artifactId: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/content')
      .set(asUser())
      .send({ text: 'Content', artifactId: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when text is missing', async () => {
    const res = await request(app)
      .post('/content')
      .set(adminAuth())
      .send({ artifactId: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'text is required');
  });

  it('returns 400 when exactly one of museumId/roomId/artifactId is not provided', async () => {
    const res = await request(app)
      .post('/content')
      .set(adminAuth())
      .send({ text: 'Content' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty(
      'error',
      'Exactly one of museumId, roomId, or artifactId must be provided'
    );
  });

  it('returns 200 with created content when valid', async () => {
    const created = makeContent({
      id: 5,
      text: 'New content',
      type: 'introduction',
      artifactId: 1,
    });
    vi.mocked(prisma.content.create).mockResolvedValue(created as any);
    const res = await request(app)
      .post('/content')
      .set(adminAuth())
      .send({ text: 'New content', artifactId: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 5, text: 'New content' });
  });
});

describe('GET /museums/:museumId/content', () => {
  it('returns 400 for non-numeric museumId', async () => {
    const res = await request(app).get('/museums/notanumber/content');
    expect(res.status).toBe(400);
  });

  it('returns 200 with content array', async () => {
    const content = [makeContent({ id: 1, museumId: 1 })];
    vi.mocked(prisma.content.findMany).mockResolvedValue(content as any);
    const res = await request(app).get('/museums/1/content');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /rooms/:roomId/content', () => {
  it('returns 400 for non-numeric roomId', async () => {
    const res = await request(app).get('/rooms/notanumber/content');
    expect(res.status).toBe(400);
  });

  it('returns 200 with content array', async () => {
    const content = [makeContent({ id: 1, roomId: 1 })];
    vi.mocked(prisma.content.findMany).mockResolvedValue(content as any);
    const res = await request(app).get('/rooms/1/content');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /artifacts/:artifactId/content', () => {
  it('returns 400 for non-numeric artifactId', async () => {
    const res = await request(app).get('/artifacts/notanumber/content');
    expect(res.status).toBe(400);
  });

  it('returns 200 with content array', async () => {
    const content = [makeContent({ id: 1, artifactId: 1 })];
    vi.mocked(prisma.content.findMany).mockResolvedValue(content as any);
    const res = await request(app).get('/artifacts/1/content');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /generate-content/artefact/:artefactId', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).post('/generate-content/artefact/1');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/generate-content/artefact/1')
      .set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid artefactId', async () => {
    const res = await request(app)
      .post('/generate-content/artefact/notanumber')
      .set(adminAuth());
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid artefactId');
  });

  it('returns 404 when artifact not found', async () => {
    vi.mocked(prisma.artifact.findUnique).mockResolvedValue(null);
    const res = await request(app)
      .post('/generate-content/artefact/999')
      .set(adminAuth());
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Artifact not found');
  });

  it('returns 200 with created content when successful', async () => {
    const artifact = makeArtifact({ id: 1 });
    const museum = makeMuseum({ id: 1 });
    vi.mocked(prisma.artifact.findUnique).mockResolvedValue({
      ...artifact,
      museum,
      room: makeRoom({ id: 1, museumId: 1 }),
    } as any);
    const createdContent = makeContent({
      id: 1,
      artifactId: 1,
      text: 'Generated intro',
    });
    vi.mocked(prisma.content.create).mockResolvedValue(createdContent as any);
    vi.mocked(prisma.content.findUnique).mockResolvedValue(
      createdContent as any
    );
    const res = await request(app)
      .post('/generate-content/artefact/1')
      .set(adminAuth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('text', 'Generated intro');
  });
});
