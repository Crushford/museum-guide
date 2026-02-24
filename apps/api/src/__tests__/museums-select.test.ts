import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@repo/db';
import {
  fetchWikidataEntity,
  parseArtifactResults,
  queryWikidata,
  buildArtifactsQuery,
} from '../lib/wikidata';
import { makeMuseum } from './helpers/factories';
import { asUser } from './helpers/test-setup';
import { app } from '../server';

describe('POST /api/museums/select/:qid', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).post('/api/museums/select/Q12345');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/api/museums/select/Q12345')
      .set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid QID format', async () => {
    const res = await request(app)
      .post('/api/museums/select/INVALID')
      .set('Authorization', 'Bearer admin-token');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 422 when wikidata entity has no wikipedia URL (new museum)', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(null);
    vi.mocked(fetchWikidataEntity).mockResolvedValue({
      wikipediaUrl: null,
      locationLabels: [],
      label: 'Test Museum',
    } as any);

    const res = await request(app)
      .post('/api/museums/select/Q12345')
      .set('Authorization', 'Bearer admin-token');
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('returns existing museum when museum already exists with wikipedia', async () => {
    const existingMuseum = makeMuseum({
      id: 5,
      wikidataId: 'Q12345',
      wikipediaUrl: 'https://en.wikipedia.org/wiki/Test',
    });
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(
      existingMuseum as any
    );

    const res = await request(app)
      .post('/api/museums/select/Q12345')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      created: false,
      museum: {
        id: 5,
        qid: 'Q12345',
        slug: existingMuseum.slug,
        name: existingMuseum.name,
      },
    });
  });

  it('creates and returns new museum when it does not exist', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(null);
    vi.mocked(fetchWikidataEntity).mockResolvedValue({
      wikipediaUrl: 'https://en.wikipedia.org/wiki/Test_Museum',
      label: 'Test Museum',
      locationLabels: ['London'],
      image: null,
      coordinates: null,
    } as any);
    const newMuseum = makeMuseum({
      id: 10,
      name: 'Test Museum',
      slug: 'test-slug',
      wikidataId: 'Q12345',
    });
    vi.mocked(prisma.museum.create).mockResolvedValue(newMuseum as any);

    const res = await request(app)
      .post('/api/museums/select/Q12345')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      created: true,
      museum: {
        id: 10,
        qid: 'Q12345',
      },
    });
  });
});

describe('POST /api/museums/:slug/hydrate', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).post('/api/museums/test-museum/hydrate');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/api/museums/test-museum/hydrate')
      .set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 404 when museum not found', async () => {
    vi.mocked(prisma.museum.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/museums/nonexistent/hydrate')
      .set('Authorization', 'Bearer admin-token');
    expect(res.status).toBe(404);
  });

  it('returns cached museum data when recently hydrated', async () => {
    const recentDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    const museum = makeMuseum({
      museumHydratedAt: recentDate,
      wikidataId: 'Q123',
    });
    vi.mocked(prisma.museum.findFirst).mockResolvedValue(museum as any);

    const res = await request(app)
      .post('/api/museums/test-museum/hydrate')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cached', true);
    expect(res.body).toHaveProperty('museum');
  });

  it('returns 400 when museum has no wikidataId', async () => {
    const museum = makeMuseum({ wikidataId: null, museumHydratedAt: null });
    vi.mocked(prisma.museum.findFirst).mockResolvedValue(museum as any);

    const res = await request(app)
      .post('/api/museums/test-museum/hydrate?force=1')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('hydrates and returns museum data from wikidata', async () => {
    const museum = makeMuseum({ wikidataId: 'Q123', museumHydratedAt: null });
    vi.mocked(prisma.museum.findFirst).mockResolvedValue(museum as any);
    vi.mocked(fetchWikidataEntity).mockResolvedValue({
      description: 'A great museum',
      wikipediaUrl: 'https://en.wikipedia.org/wiki/Test',
      image: null,
      coordinates: null,
      officialWebsite: null,
      locationLabels: ['London'],
    } as any);
    const updatedMuseum = makeMuseum({
      ...museum,
      description: 'A great museum',
      museumHydratedAt: new Date(),
    });
    vi.mocked(prisma.museum.update).mockResolvedValue(updatedMuseum as any);

    const res = await request(app)
      .post('/api/museums/test-museum/hydrate?force=1')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cached', false);
    expect(res.body).toHaveProperty('museum');
  });
});

describe('POST /api/museums/:slug/hydrate-artifacts', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).post(
      '/api/museums/test-museum/hydrate-artifacts'
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/api/museums/test-museum/hydrate-artifacts')
      .set(asUser());
    expect(res.status).toBe(403);
  });

  it('returns 404 when museum not found', async () => {
    vi.mocked(prisma.museum.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/museums/nonexistent/hydrate-artifacts')
      .set('Authorization', 'Bearer admin-token');
    expect(res.status).toBe(404);
  });

  it('returns cached artifacts when recently hydrated', async () => {
    const recentDate = new Date(Date.now() - 1000 * 60 * 60);
    const museum = makeMuseum({
      artifactsHydratedAt: recentDate,
      wikidataId: 'Q123',
    });
    vi.mocked(prisma.museum.findFirst).mockResolvedValue(museum as any);
    vi.mocked(prisma.artifact.findMany).mockResolvedValue([
      {
        id: 1,
        displayTitle: 'Artifact 1',
        slug: 'artifact-1',
        wikidataId: null,
        wikipediaUrl: null,
        wikimediaImageUrl: null,
      } as any,
    ]);

    const res = await request(app)
      .post('/api/museums/test-museum/hydrate-artifacts')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cached', true);
    expect(res.body).toHaveProperty('artifacts');
  });

  it('queries wikidata and returns artifacts when not cached', async () => {
    const museum = makeMuseum({
      wikidataId: 'Q123',
      artifactsHydratedAt: null,
    });
    vi.mocked(prisma.museum.findFirst).mockResolvedValue(museum as any);
    vi.mocked(buildArtifactsQuery).mockReturnValue('artifacts-sparql');
    vi.mocked(queryWikidata).mockResolvedValue([]);
    vi.mocked(parseArtifactResults).mockReturnValue([]);
    vi.mocked(prisma.museum.update).mockResolvedValue(museum as any);

    const res = await request(app)
      .post('/api/museums/test-museum/hydrate-artifacts')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cached', false);
    expect(res.body).toHaveProperty('artifacts');
    expect(res.body).toHaveProperty('newArtifacts');
    expect(res.body).toHaveProperty('museumId', museum.id);
  });
});
