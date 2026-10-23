import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  // database.ts opens its file at import (via the Modland cache): keep it out of the real data directory.
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'modarchive-route-'));
});

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createModArchiveRouter } from './modarchive';

const SECRET = 'sekrit-key-123';
const XML = '<?xml version="1.0"?><modarchive><results>2</results><totalpages>3</totalpages>'
  + '<module><filename>chemical_emotion.mod</filename><format>MOD</format><id>100721</id>'
  + '<hash>135bc8c2facf19152c05ca1f90a7214d</hash><bytes>56000</bytes><songtitle>Chemical &amp; Emotion</songtitle>'
  + '<genreid>2</genreid><genretext>Electronic</genretext>'
  + '<artist_info><artist><id>5</id><alias>Jester</alias></artist></artist_info></module>'
  + '<module><filename>other.xm</filename><format>XM</format><id>7</id><hash>00</hash><bytes>10</bytes>'
  + '<songtitle>Other</songtitle><genreid>0</genreid><genretext>n/a</genretext></module></modarchive>';

describe('/api/modarchive', () => {
  const upstream = vi.fn(async (_url: string) => new Response(XML));
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use('/api/modarchive', createModArchiveRouter({
      fetch: upstream as unknown as typeof fetch, apiKey: () => SECRET,
    }));
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/modarchive`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('parses a search into Modland-shaped rows and keeps the key out of the response', async () => {
    const res = await fetch(`${base}/search?q=chemical`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toContain(SECRET);
    const json = JSON.parse(body);
    expect(json.totalPages).toBe(3);
    expect(json.results[0]).toEqual({
      id: 100721, format: 'MOD', author: 'Jester', filename: 'chemical_emotion.mod',
      title: 'Chemical & Emotion', extension: 'mod', bytes: 56000, genre: 'Electronic',
    });
    expect(json.results[1].id).toBe(7);
    const url = upstream.mock.calls[upstream.mock.calls.length - 1][0];
    expect(url).toContain(`key=${SECRET}`);
    expect(url).toContain('type=filename_or_songtitle');
  });

  it('searches by artist through the artist id, since the API has no artist name search type', async () => {
    // Mirrors the live API: an unknown search type is an error; artists resolve to ids first.
    upstream.mockImplementation(async (url: string) => {
      if (/type=guessed_artist/.test(url)) return new Response('<modarchive><error>Invalid Search Type</error></modarchive>');
      if (/request=search_artist/.test(url)) {
        return new Response('<modarchive><items><item><id>9</id><alias>jester-fan</alias></item>'
          + '<item><id>5</id><alias>Jester</alias></item></items></modarchive>');
      }
      if (/request=view_modules_by_artistid&query=5&/.test(url)) return new Response(XML);
      return new Response('<modarchive><error>Invalid Search Type</error></modarchive>');
    });
    try {
      const res = await fetch(`${base}/search?author=jester`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.results.map((r: { id: number }) => r.id)).toEqual([100721, 7]);
      expect(json.totalPages).toBe(3);
    } finally {
      upstream.mockImplementation(async () => new Response(XML));
    }
    expect((await fetch(`${base}/search`)).status).toBe(400);
  });

  it('answers no results when no artist matches', async () => {
    upstream.mockResolvedValueOnce(new Response('<modarchive><error>No results found.</error></modarchive>'));
    const json = await (await fetch(`${base}/search?author=nobody`)).json();
    expect(json.results).toEqual([]);
  });

  it('never leaks the key when the upstream fetch fails', async () => {
    upstream.mockRejectedValueOnce(new Error(`connect failed https://x/?key=${SECRET}`));
    const res = await fetch(`${base}/search?q=a`);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(SECRET);
  });

  it('reports an empty result set as no results', async () => {
    upstream.mockResolvedValueOnce(new Response('<modarchive><error>No results found.</error></modarchive>'));
    const json = await (await fetch(`${base}/search?q=zzzz`)).json();
    expect(json.results).toEqual([]);
  });

  it('rejects a non-numeric download id', async () => {
    expect((await fetch(`${base}/download?id=../x`)).status).toBe(400);
  });
});
