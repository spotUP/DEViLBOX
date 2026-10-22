import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  // database.ts opens its file at import: keep it out of the real data directory.
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'genre-route-'));
});

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import Database from 'better-sqlite3';
import { createGenreTables } from '../db/database';
import { createGenreService } from '../services/modarchiveGenre';
import { createGenreRouter } from './genre';

const XML = '<?xml version="1.0"?><modarchive><results>1</results><module>'
  + '<filename>chemical_emotion.mod</filename><format>MOD</format><id>100721</id>'
  + '<hash>135bc8c2facf19152c05ca1f90a7214d</hash><bytes>56000</bytes>'
  + '<genreid>2</genreid><genretext>Electronic - Drum &amp; Bass</genretext></module></modarchive>';

describe('GET /api/genre/:key', () => {
  const database = new Database(':memory:');
  createGenreTables(database);
  const modarchive = vi.fn(async (_url: string) => new Response(XML));
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use('/api/genre', createGenreRouter(createGenreService({
      db: database, fetch: modarchive as unknown as typeof fetch, apiKey: () => 'k', minIntervalMs: 0,
    })));
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/genre`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('looks the module up on ModArchive once, then answers from the table', async () => {
    const url = `${base}/0123456789AB?name=${encodeURIComponent('DH0:Mods/mod.Chemical_Emotion')}&size=56000`;
    const expected = { key: '0123456789ab', genre: 'Electronic - Drum & Bass', source: 'modarchive', modarchiveId: 100721 };

    const first = await fetch(url);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(expected);
    expect(modarchive).toHaveBeenCalledTimes(1);
    expect(new URL(modarchive.mock.calls[0][0]).searchParams.get('query')).toBe('chemical_emotion.mod');

    expect(await (await fetch(url)).json()).toEqual(expected);
    expect(modarchive).toHaveBeenCalledTimes(1);
    expect(database.prepare('SELECT genre, source FROM module_genres WHERE key = ?').get('0123456789ab'))
      .toEqual({ genre: 'Electronic - Drum & Bass', source: 'modarchive' });
  });

  it.each([
    ['bad key', '/xyz?name=a.mod&size=1'],
    ['no name', '/0123456789ab?size=1'],
    ['bad size', '/0123456789ab?name=a.mod&size=0'],
    ['bad md5', '/0123456789ab?name=a.mod&size=1&md5=zz'],
  ])('%s is 400', async (_label, path) => {
    expect((await fetch(base + path)).status).toBe(400);
  });
});
