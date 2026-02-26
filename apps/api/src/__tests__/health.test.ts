import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';

describe('GET /health', () => {
  it('returns 200 with { ok: true }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('GET /health/storage', () => {
  it('returns 200 with { ok: true }', async () => {
    const res = await request(app).get('/health/storage');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
