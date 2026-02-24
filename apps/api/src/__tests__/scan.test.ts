import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@repo/db';
import {
  extractTextFromImage,
  searchDuplicatesFromRawText,
  extractArtifactDraft,
  searchDuplicatesFromDraft,
  createArtifactAndAssets,
} from '../lib/artifact-scan';
import { makeMuseum } from './helpers/factories';
import { app } from '../server';
import { asUser, adminAuth } from './helpers/test-setup';

describe('POST /museums/:museumId/scan/ocr', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app)
      .post('/museums/1/scan/ocr')
      .send({ imageBase64: 'base64data' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/museums/1/scan/ocr')
      .set(asUser())
      .send({ imageBase64: 'base64data' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when museumId is invalid', async () => {
    const res = await request(app)
      .post('/museums/notanumber/scan/ocr')
      .set(adminAuth())
      .send({ imageBase64: 'base64data' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid museumId');
  });

  it('returns 400 when imageBase64 is missing', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(
      makeMuseum({ id: 1 })
    );
    const res = await request(app)
      .post('/museums/1/scan/ocr')
      .set(adminAuth())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'imageBase64 is required');
  });

  it('returns 404 when museum not found', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(null);
    const res = await request(app)
      .post('/museums/999/scan/ocr')
      .set(adminAuth())
      .send({ imageBase64: 'base64data' });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Museum not found');
  });

  it('returns 422 when OCR returns empty text', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(
      makeMuseum({ id: 1 })
    );
    vi.mocked(extractTextFromImage).mockResolvedValue({
      rawText: '   ',
      languageHints: [],
      confidence: 0.5,
      blocks: [],
    } as any);
    const res = await request(app)
      .post('/museums/1/scan/ocr')
      .set(adminAuth())
      .send({ imageBase64: 'base64data' });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with museumId, rawText, ocr when successful', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(
      makeMuseum({ id: 1 })
    );
    vi.mocked(extractTextFromImage).mockResolvedValue({
      rawText: 'Plaque text here',
      languageHints: ['en'],
      confidence: 0.95,
      blocks: [],
    } as any);
    const res = await request(app)
      .post('/museums/1/scan/ocr')
      .set(adminAuth())
      .send({ imageBase64: 'base64data' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      museumId: 1,
      rawText: 'Plaque text here',
    });
    expect(res.body.ocr).toHaveProperty('rawText', 'Plaque text here');
  });
});

describe('POST /museums/:museumId/scan/duplicates-raw', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app)
      .post('/museums/1/scan/duplicates-raw')
      .send({ rawText: 'Some text' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/museums/1/scan/duplicates-raw')
      .set(asUser())
      .send({ rawText: 'Some text' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when museumId is invalid', async () => {
    const res = await request(app)
      .post('/museums/notanumber/scan/duplicates-raw')
      .set(adminAuth())
      .send({ rawText: 'Some text' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rawText is missing or empty', async () => {
    const res = await request(app)
      .post('/museums/1/scan/duplicates-raw')
      .set(adminAuth())
      .send({ rawText: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'rawText is required');
  });

  it('returns 200 with duplicates result', async () => {
    const duplicates = {
      outcome: 'no_duplicates' as const,
      candidates: [],
      thresholds: {},
    };
    vi.mocked(searchDuplicatesFromRawText).mockResolvedValue(duplicates as any);
    const res = await request(app)
      .post('/museums/1/scan/duplicates-raw')
      .set(adminAuth())
      .send({ rawText: 'Plaque text' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(duplicates);
  });
});

describe('POST /museums/:museumId/scan/draft', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app)
      .post('/museums/1/scan/draft')
      .send({ rawText: 'Plaque text' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/museums/1/scan/draft')
      .set(asUser())
      .send({ rawText: 'Plaque text' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when rawText is missing', async () => {
    const res = await request(app)
      .post('/museums/1/scan/draft')
      .set(adminAuth())
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when museum not found', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(null);
    const res = await request(app)
      .post('/museums/999/scan/draft')
      .set(adminAuth())
      .send({ rawText: 'Plaque text' });
    expect(res.status).toBe(404);
  });

  it('returns 200 with draft when successful', async () => {
    vi.mocked(prisma.museum.findUnique).mockResolvedValue(
      makeMuseum({ id: 1, name: 'Test Museum' })
    );
    const draft = {
      localTitle: 'Artifact Title',
      englishTitle: 'Artifact Title',
      knowledgeText: 'Knowledge',
    };
    vi.mocked(extractArtifactDraft).mockResolvedValue(draft as any);
    const res = await request(app)
      .post('/museums/1/scan/draft')
      .set(adminAuth())
      .send({ rawText: 'Plaque text' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('draft', draft);
  });
});

describe('POST /museums/:museumId/scan/duplicates-draft', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app)
      .post('/museums/1/scan/duplicates-draft')
      .send({ draft: { localTitle: 'Title', knowledgeText: 'Text' } });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/museums/1/scan/duplicates-draft')
      .set(asUser())
      .send({ draft: { localTitle: 'Title' } });
    expect(res.status).toBe(403);
  });

  it('returns 400 when draft is missing', async () => {
    const res = await request(app)
      .post('/museums/1/scan/duplicates-draft')
      .set(adminAuth())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'draft is required');
  });

  it('returns 200 with duplicates result', async () => {
    const duplicates = {
      outcome: 'no_duplicates' as const,
      candidates: [],
      thresholds: {},
    };
    vi.mocked(searchDuplicatesFromDraft).mockResolvedValue(duplicates as any);
    const res = await request(app)
      .post('/museums/1/scan/duplicates-draft')
      .set(adminAuth())
      .send({
        draft: {
          localTitle: 'Title',
          englishTitle: 'Title',
          knowledgeText: 'Text',
        },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(duplicates);
  });
});

describe('POST /museums/:museumId/scan/create', () => {
  it('returns 401 when no auth header', async () => {
    const res = await request(app).post('/museums/1/scan/create').send({
      imageBase64: 'base64',
      rawText: 'text',
      draft: {},
      ocr: {},
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .post('/museums/1/scan/create')
      .set(asUser())
      .send({
        imageBase64: 'base64',
        rawText: 'text',
        draft: {},
        ocr: {},
      });
    expect(res.status).toBe(403);
  });

  it('returns 400 when payload is incomplete', async () => {
    const res = await request(app)
      .post('/museums/1/scan/create')
      .set(adminAuth())
      .send({
        imageBase64: 'base64',
        rawText: '',
        draft: null,
        ocr: {},
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Missing/);
  });

  it('returns 200 with created artifact when successful', async () => {
    const created = {
      id: 1,
      slug: 'new-artifact',
      displayTitle: 'New Artifact',
    };
    vi.mocked(createArtifactAndAssets).mockResolvedValue(created as any);
    const res = await request(app)
      .post('/museums/1/scan/create')
      .set(adminAuth())
      .send({
        imageBase64: 'base64data',
        rawText: 'Plaque text',
        draft: {
          localTitle: 'Title',
          englishTitle: 'Title',
          knowledgeText: 'Text',
        },
        ocr: {
          rawText: 'Plaque text',
          languageHints: [],
          confidence: 0.95,
          blocks: [],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(created);
  });
});
