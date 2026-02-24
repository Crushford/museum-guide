import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@repo/db';
import {
  searchWikidata,
  fetchWikidataEntity,
  queryWikidata,
  buildMuseumQuery,
  buildNearbyMuseumsQuery,
  extractQId,
  searchWikidataLocations,
} from '../lib/wikidata';
import { app } from '../server';

describe('GET /api/museums/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = await request(app).get('/api/museums/search');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when q is 1 character', async () => {
    const res = await request(app).get('/api/museums/search?q=x');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with query, local, wikidata shape', async () => {
    vi.mocked(prisma.museum.findMany).mockResolvedValue([
      {
        id: 1,
        name: 'British Museum',
        slug: 'british-museum',
        wikidataId: 'Q6373',
        citySlug: 'london',
      } as any,
    ]);
    vi.mocked(searchWikidata).mockResolvedValue([
      {
        qid: 'Q9545',
        label: 'British Library',
        description: 'National library',
      },
    ]);
    vi.mocked(fetchWikidataEntity).mockResolvedValue({
      wikipediaUrl: 'https://en.wikipedia.org/wiki/British_Library',
      locationLabels: [],
    } as any);

    const res = await request(app).get('/api/museums/search?q=british');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('query', 'british');
    expect(res.body).toHaveProperty('local');
    expect(res.body).toHaveProperty('wikidata');
    expect(Array.isArray(res.body.local)).toBe(true);
    expect(Array.isArray(res.body.wikidata)).toBe(true);
  });

  it('includes isLocal:true on local results', async () => {
    vi.mocked(prisma.museum.findMany).mockResolvedValue([
      {
        id: 1,
        name: 'British Museum',
        slug: 'british-museum',
        wikidataId: 'Q6373',
        citySlug: 'london',
      } as any,
    ]);

    const res = await request(app).get('/api/museums/search?q=british');
    expect(res.status).toBe(200);
    expect(res.body.local[0]).toMatchObject({
      label: 'British Museum',
      isLocal: true,
      slug: 'british-museum',
    });
  });

  it('filters wikidata results without wikipedia URL', async () => {
    vi.mocked(searchWikidata).mockResolvedValue([
      { qid: 'Q9545', label: 'No Wikipedia Museum', description: 'No wiki' },
    ]);
    vi.mocked(fetchWikidataEntity).mockResolvedValue({
      wikipediaUrl: null,
      locationLabels: [],
    } as any);

    const res = await request(app).get('/api/museums/search?q=notwiki');
    expect(res.status).toBe(200);
    expect(res.body.wikidata).toHaveLength(0);
  });
});

describe('GET /api/museums/search/wikidata', () => {
  it('returns 400 when q is missing', async () => {
    const res = await request(app).get('/api/museums/search/wikidata');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when q is 1 character', async () => {
    const res = await request(app).get('/api/museums/search/wikidata?q=x');
    expect(res.status).toBe(400);
  });

  it('returns 200 with query and results shape', async () => {
    vi.mocked(searchWikidata).mockResolvedValue([
      { qid: 'Q6373', label: 'British Museum', description: 'National museum' },
    ]);
    vi.mocked(fetchWikidataEntity).mockResolvedValue({
      wikipediaUrl: 'https://en.wikipedia.org/wiki/British_Museum',
      locationLabels: [],
    } as any);

    const res = await request(app).get(
      '/api/museums/search/wikidata?q=british'
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('query', 'british');
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('returns empty results when no wikipedia URLs found', async () => {
    vi.mocked(searchWikidata).mockResolvedValue([
      { qid: 'Q9999', label: 'Obscure Museum', description: 'No wiki' },
    ]);
    vi.mocked(fetchWikidataEntity).mockResolvedValue({
      wikipediaUrl: null,
      locationLabels: [],
    } as any);

    const res = await request(app).get(
      '/api/museums/search/wikidata?q=obscure'
    );
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
  });
});

describe('GET /api/museums/search/location', () => {
  it('returns 400 when q is missing', async () => {
    const res = await request(app).get('/api/museums/search/location');
    expect(res.status).toBe(400);
  });

  it('returns 400 when q is 1 character', async () => {
    const res = await request(app).get('/api/museums/search/location?q=x');
    expect(res.status).toBe(400);
  });

  it('returns 200 with empty museums when no location found', async () => {
    vi.mocked(searchWikidataLocations).mockResolvedValue([]);

    const res = await request(app).get('/api/museums/search/location?q=london');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      query: 'london',
      location: null,
      museums: [],
    });
  });

  it('returns 200 with location and museums shape when location found', async () => {
    vi.mocked(searchWikidataLocations).mockResolvedValue([
      { qid: 'Q84', label: 'London', description: 'Capital of England' },
    ]);
    vi.mocked(buildMuseumQuery).mockReturnValue('sparql-query');
    vi.mocked(queryWikidata).mockResolvedValue([
      {
        museum: { value: 'http://www.wikidata.org/entity/Q6373' },
        museumLabel: { value: 'British Museum' },
      },
    ]);
    vi.mocked(extractQId).mockReturnValue('Q6373');

    const res = await request(app).get('/api/museums/search/location?q=london');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('query', 'london');
    expect(res.body).toHaveProperty('location');
    expect(res.body).toHaveProperty('museums');
    expect(res.body.location).toMatchObject({ qid: 'Q84', label: 'London' });
    expect(Array.isArray(res.body.museums)).toBe(true);
  });
});

describe('GET /api/museums/search/nearby', () => {
  it('returns 400 for missing coordinates', async () => {
    const res = await request(app).get('/api/museums/search/nearby');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for invalid latitude (out of range)', async () => {
    const res = await request(app).get(
      '/api/museums/search/nearby?lat=999&lng=0'
    );
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for invalid longitude (out of range)', async () => {
    const res = await request(app).get(
      '/api/museums/search/nearby?lat=51&lng=999'
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for NaN coordinates', async () => {
    const res = await request(app).get(
      '/api/museums/search/nearby?lat=abc&lng=0'
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 with center, radiusKm, results when valid coords', async () => {
    vi.mocked(buildNearbyMuseumsQuery).mockReturnValue('nearby-sparql');
    vi.mocked(queryWikidata).mockResolvedValue([]);

    const res = await request(app).get(
      '/api/museums/search/nearby?lat=51&lng=0'
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('center');
    expect(res.body).toHaveProperty('radiusKm');
    expect(res.body).toHaveProperty('results');
    expect(res.body.center).toMatchObject({ lat: 51, lng: 0 });
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('parses and returns nearby museum results', async () => {
    vi.mocked(buildNearbyMuseumsQuery).mockReturnValue('nearby-sparql');
    vi.mocked(queryWikidata).mockResolvedValue([
      {
        museum: { value: 'http://www.wikidata.org/entity/Q6373' },
        museumLabel: { value: 'British Museum' },
        distance: { value: '0.5' },
        location: { value: 'Point(-0.127 51.519)' },
      },
    ]);
    vi.mocked(extractQId).mockImplementation((uri) => {
      const match = /entity\/(Q\d+)/.exec(uri);
      return match ? match[1] : null;
    });

    const res = await request(app).get(
      '/api/museums/search/nearby?lat=51.5&lng=-0.1'
    );
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({
      qid: 'Q6373',
      label: 'British Museum',
    });
  });
});
