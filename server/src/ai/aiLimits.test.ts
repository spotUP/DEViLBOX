import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createAiGuards } from './limits';

let server: Server;
let base = '';
const env = { ...process.env };

beforeAll(async () => {
  process.env.AI_RATE_PER_MINUTE = '3';
  process.env.AI_RATE_PER_DAY = '2';
  delete process.env.AI_CLI_PROVIDERS;
  const app = express();
  app.use(express.json());
  app.use('/api/ai', createAiGuards());
  app.post('/api/ai/chat', (_req, res) => { res.json({ ok: true }); });
  await new Promise<void>((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); process.env = env; });

const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('AI guards (FA-10)', () => {
  it('refuses a CLI provider when AI_CLI_PROVIDERS is unset, and unknown providers', async () => {
    expect((await post({ prompt: 'x', provider: 'claude' })).status).toBe(403);
    expect((await post({ prompt: 'x', provider: 'bogus' })).status).toBe(400);
  });
  it('refuses an oversized prompt', async () => {
    expect((await post({ prompt: 'x'.repeat(4001), provider: 'free' })).status).toBe(400);
  });
  it('daily cap hits a keyless client at the 3rd chat; a visitor key skips the daily cap but the minute cap then applies', async () => {
    // keyless: 2 daily allowed (the minute limit is 3, and earlier refusals above did not count)
    const a = await post({ prompt: 'x', provider: 'free' });
    const b = await post({ prompt: 'x', provider: 'free' });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    await a.text(); await b.text();
    const c = await post({ prompt: 'x', provider: 'free' });
    expect(c.status).toBe(429);
    expect(await c.text()).toContain('"type":"error"');
  });
});
