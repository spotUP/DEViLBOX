import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import { hippoFreeze } from './hippoForward';

describe('hippoFreeze (HIPPO_FREEZE=1, forward off)', () => {
  let server: http.Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use(hippoFreeze);
    app.all('*', (_req, res) => res.status(200).send('reached'));
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
  });

  it('refuses the vote with the existing ERR reply', async () => {
    const r = await fetch(`${base}/api/hip/vote?k=x`);
    expect(r.status).toBe(500);
    expect(await r.text()).toBe('ERR server\n');
  });

  it.each([
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/signup'],
    ['PUT', '/api/ratings'],
    ['DELETE', '/api/ratings'],
    ['PUT', '/api/loudness/abc'],
  ])('refuses %s %s with 503', async (method, path) => {
    const r = await fetch(base + path, { method });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'Service temporarily unavailable' });
  });

  it.each([
    ['GET', '/api/hip/votes'],
    ['GET', '/api/ratings/batch'],
    ['GET', '/api/loudness/abc'],
    ['GET', '/api/auth/me'],
    ['GET', '/api/genre/abc'],
  ])('still serves %s %s', async (method, path) => {
    const r = await fetch(base + path, { method });
    expect(await r.text()).toBe('reached');
  });
});
