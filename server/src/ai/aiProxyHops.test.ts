/**
 * Two visitors behind the live proxy chain get separate daily AI caps.
 *
 * Live is Caddy -> nginx -> backend. With 'trust proxy' at 1, req.ip was the
 * Caddy address for every visitor, so the per-IP daily cap was one cap for the
 * whole site. The hop count comes from docker-compose.yml (the live config),
 * so dropping it there fails this test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createAiGuards, trustProxyHops } from './limits';

const compose = readFileSync(resolve(__dirname, '../../../docker-compose.yml'), 'utf8');
const composeHops = /TRUST_PROXY_HOPS=\$\{TRUST_PROXY_HOPS:-(\d+)\}/.exec(compose)?.[1];

let server: Server;
let base = '';
const env = { ...process.env };

beforeAll(async () => {
  process.env.AI_RATE_PER_MINUTE = '10';
  process.env.AI_RATE_PER_DAY = '1';
  if (composeHops) process.env.TRUST_PROXY_HOPS = composeHops;
  else delete process.env.TRUST_PROXY_HOPS;
  const app = express();
  app.set('trust proxy', trustProxyHops());
  app.use(express.json());
  app.use('/api/ai', createAiGuards());
  app.post('/api/ai/chat', (_req, res) => { res.json({ ok: true }); });
  await new Promise<void>((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); process.env = env; });

// Caddy sets X-Forwarded-For to the visitor; nginx appends Caddy's address.
const chatFrom = (visitor: string) =>
  fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `${visitor}, 172.18.0.1` },
    body: JSON.stringify({ prompt: 'x', provider: 'free' }),
  });

describe('AI limits behind Caddy and nginx', () => {
  it('two visitors get separate daily caps', async () => {
    expect((await chatFrom('203.0.113.7')).status).toBe(200);
    expect((await chatFrom('203.0.113.7')).status).toBe(429);
    expect((await chatFrom('198.51.100.9')).status).toBe(200);
  });
});
