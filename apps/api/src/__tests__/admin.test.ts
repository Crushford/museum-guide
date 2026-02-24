import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@repo/db';
import { generateIntroduction } from '../lib/llm/generate-content';
import {
  makeMuseum,
  makeRoom,
  makeArtifact,
  makeContent,
} from './helpers/factories';
import { app } from '../server';
import { asUser, adminAuth } from './helpers/test-setup';

describe('GET /admin/rooms', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).get('/admin/rooms');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app).get('/admin/rooms').set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 200 with rooms array when admin', async () => {
    const rooms = [
      makeRoom({ id: 1, museumId: 1 }),
      makeRoom({ id: 2, museumId: 1, name: 'Room 2' }),
    ];
    vi.mocked(prisma.room.findMany).mockResolvedValue(
      rooms.map((r) => ({ ...r, museum: { id: 1, name: 'Museum' } })) as any
    );
    const res = await request(app).get('/admin/rooms').set(adminAuth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /admin/artifacts', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).get('/admin/artifacts');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app).get('/admin/artifacts').set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 200 with artifacts array when admin', async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      {
        id: 1,
        name: 'Room',
        museumId: 1,
        parentRoomId: null,
        museum: { id: 1, name: 'Museum' },
      },
    ] as any);
    vi.mocked(prisma.museum.findMany).mockResolvedValue([
      { id: 1, name: 'Museum' },
    ] as any);
    vi.mocked(prisma.artifact.findMany).mockResolvedValue([
      makeArtifact({ id: 1, roomId: 1, museumId: 1 }),
    ] as any);
    const res = await request(app).get('/admin/artifacts').set(adminAuth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /admin/content/museums', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).get('/admin/content/museums');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app).get('/admin/content/museums').set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 200 with museums array when admin', async () => {
    const museums = [makeMuseum({ id: 1 }), makeMuseum({ id: 2, name: 'M2' })];
    vi.mocked(prisma.museum.findMany).mockResolvedValue(museums as any);
    const res = await request(app)
      .get('/admin/content/museums')
      .set(adminAuth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /admin/content/rooms', () => {
  it('returns 403 for non-admin user', async () => {
    const res = await request(app).get('/admin/content/rooms').set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 200 with rooms when admin', async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      makeRoom({ id: 1 }),
    ] as any);
    const res = await request(app).get('/admin/content/rooms').set(adminAuth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /admin/content/content', () => {
  it('returns 403 for non-admin user', async () => {
    const res = await request(app).get('/admin/content/content').set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 200 with content rows when admin', async () => {
    const content = [makeContent({ id: 1 })];
    vi.mocked(prisma.content.findMany).mockResolvedValue(content as any);
    const res = await request(app)
      .get('/admin/content/content')
      .set(adminAuth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /admin/artifacts/:artifactId/generate-introduction', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app)
      .post('/admin/artifacts/1/generate-introduction')
      .send({ provider: 'google' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/admin/artifacts/1/generate-introduction')
      .set(asUser())
      .send({ provider: 'google' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when provider is missing or invalid', async () => {
    const res = await request(app)
      .post('/admin/artifacts/1/generate-introduction')
      .set(adminAuth())
      .send({ provider: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty(
      'error',
      'provider must be "google" or "openai"'
    );
  });

  it('returns 200 with result when successful', async () => {
    const result = {
      contentId: 1,
      text: 'Generated introduction',
      audioUrl: '/audio/intro.mp3',
    };
    vi.mocked(generateIntroduction).mockResolvedValue(result as any);
    const res = await request(app)
      .post('/admin/artifacts/1/generate-introduction')
      .set(adminAuth())
      .send({ provider: 'google' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(result);
  });
});

describe('GET /admin/llm-usage/monthly', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).get('/admin/llm-usage/monthly');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .get('/admin/llm-usage/monthly')
      .set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 200 with spend when admin', async () => {
    const res = await request(app)
      .get('/admin/llm-usage/monthly')
      .set(adminAuth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('spend');
  });
});

describe('GET /admin/api-calls', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).get('/admin/api-calls');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app).get('/admin/api-calls').set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 200 with rows and total when admin', async () => {
    vi.mocked(prisma.apiCall.findMany).mockResolvedValue([]);
    vi.mocked(prisma.apiCall.count).mockResolvedValue(0);
    const res = await request(app).get('/admin/api-calls').set(adminAuth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rows');
    expect(res.body).toHaveProperty('total', 0);
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pageSize');
  });
});

describe('GET /admin/api-calls/daily', () => {
  it('returns 403 for non-admin user', async () => {
    const res = await request(app).get('/admin/api-calls/daily').set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 200 with totalCalls and services when admin', async () => {
    vi.mocked(prisma.apiCall.findMany).mockResolvedValue([]);
    const res = await request(app)
      .get('/admin/api-calls/daily')
      .set(adminAuth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCalls');
    expect(res.body).toHaveProperty('services');
    expect(res.body).toHaveProperty('globalLimits');
  });
});
