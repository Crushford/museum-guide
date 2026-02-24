import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@repo/db';
import { enforceSignupPolicy, getUserUsageForToday } from '../lib/usage-limits';
import { app } from '../server';

const adminToken = {
  uid: 'admin-uid',
  email: 'admin@test.com',
  name: 'Test Admin',
  admin: true,
};

describe('GET /auth/status', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).get('/auth/status');
    expect(res.status).toBe(401);
  });

  it('returns 200 with user data when authenticated', async () => {
    const usage = {
      llmCalls: 1,
      wikiCalls: 2,
      museumCreates: 0,
      artifactCreates: 0,
    };
    vi.mocked(getUserUsageForToday).mockResolvedValue(usage as any);

    const res = await request(app)
      .get('/auth/status')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      uid: adminToken.uid,
      email: adminToken.email,
      isAdmin: true,
      usage,
    });
  });

  it('returns displayName in response', async () => {
    const res = await request(app)
      .get('/auth/status')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('displayName');
  });

  it('returns 401 when enforceSignupPolicy blocks', async () => {
    vi.mocked(enforceSignupPolicy).mockImplementation(({ res }: any) => {
      res.status(403).json({ error: 'Signup blocked' });
      return Promise.resolve(false);
    });

    const res = await request(app)
      .get('/auth/status')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
  });
});

describe('GET /account/usage', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).get('/account/usage');
    expect(res.status).toBe(401);
  });

  it('returns 200 with user and usage when authenticated', async () => {
    const usage = {
      llmCalls: 3,
      wikiCalls: 1,
      museumCreates: 0,
      artifactCreates: 0,
    };
    vi.mocked(getUserUsageForToday).mockResolvedValue(usage as any);

    const res = await request(app)
      .get('/account/usage')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      user: {
        uid: adminToken.uid,
        email: adminToken.email,
        isAdmin: true,
      },
      usage,
    });
  });
});

describe('GET /account/questions', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).get('/account/questions');
    expect(res.status).toBe(401);
  });

  it('returns 200 with questions array when authenticated', async () => {
    vi.mocked(prisma.artifactQuestion.findMany).mockResolvedValue([
      {
        id: 1,
        questionText: 'What is this?',
        answerText: 'An artifact.',
        status: 'ACTIVE',
        upvotes: 2,
        askCount: 1,
        createdAt: new Date('2024-01-01'),
        artifact: { slug: 'test-artifact', displayTitle: 'Test Artifact' },
        museum: { slug: 'test-museum', name: 'Test Museum' },
      } as any,
    ]);

    const res = await request(app)
      .get('/account/questions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: 1,
      questionText: 'What is this?',
      answerText: 'An artifact.',
      status: 'ACTIVE',
      artifact: { slug: 'test-artifact', name: 'Test Artifact' },
      museum: { slug: 'test-museum', name: 'Test Museum' },
    });
  });

  it('returns empty array when no questions', async () => {
    vi.mocked(prisma.artifactQuestion.findMany).mockResolvedValue([]);

    const res = await request(app)
      .get('/account/questions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
