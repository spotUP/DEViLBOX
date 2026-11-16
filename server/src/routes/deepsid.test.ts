// Route tests for /api/deepsid against a tiny fixture database (DB_DIR points at
// a temp dir, so the real mirror is never touched). Section 4 S1 of the DeepSID design.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepsid-test-'));
process.env.DB_DIR = dir;

const HV = '_High Voltage SID Collection/MUSICIANS/H/Hubbard_Rob';
let server: Server;
let base: string;
const get = async (p: string) => {
  const r = await fetch(base + p);
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null };
};

beforeAll(async () => {
  fs.mkdirSync(path.join(dir, 'deepsid-images', 'composers'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'deepsid-images', 'composers', 'musicians_h_hubbard_rob.jpg'), 'x');
  const db = new Database(path.join(dir, 'deepsid.db'));
  db.exec(`
    CREATE TABLE composers (id INTEGER, fullname TEXT, focus TEXT, name TEXT, shortname TEXT, handles TEXT, shorthandle TEXT,
      active INTEGER, born TEXT, died TEXT, cause TEXT, notable TEXT, country TEXT, employment TEXT, affiliation TEXT,
      brand TEXT, branddark TEXT, csdbtype TEXT, csdbid INTEGER, imagesource TEXT);
    CREATE TABLE composers_links (id INTEGER, composers_id INTEGER, name TEXT, url TEXT);
    CREATE TABLE hvsc_files (id INTEGER, fullname TEXT, player TEXT, lengths TEXT, type TEXT, version TEXT, clockspeed TEXT,
      sidmodel TEXT, subtunes INTEGER, startsubtune INTEGER, name TEXT, author TEXT, copyright TEXT);
    CREATE TABLE hvsc_lengths (fullname TEXT, subtune INTEGER, length TEXT);
    CREATE TABLE tags_info (id INTEGER, name TEXT, type TEXT);
    CREATE TABLE tags_lookup (id INTEGER, files_id INTEGER, tags_id INTEGER);
    CREATE TABLE youtube (id INTEGER, file_id INTEGER, subtune INTEGER, channel TEXT, video_id TEXT, tab_order INTEGER, tab_default INTEGER);
    CREATE TABLE players_lookup (player TEXT, playerid INTEGER);
    CREATE TABLE players_info (id INTEGER, title TEXT, search TEXT, description TEXT, developer TEXT, startyear INTEGER, endyear INTEGER);
    INSERT INTO composers VALUES (1, '${HV}', '', 'Robert Hubbard', 'Rob', 'Rob Hubbard, <del>Old</del>', '', 1,
      '1955-01-01', '0000-00-00', '', 'Legend', 'UK', 'Gremlin|1985-1987', '', '', '', 'sceners', 7, '');
    INSERT INTO composers_links VALUES (1, 1, 'Home', 'http://example.com');
    INSERT INTO hvsc_files VALUES (10, '${HV}/Commando.sid', 'Hubbard', '1:30', 'PSID', '2', 'PAL', 'MOS6581', 1, 1,
      'Commando', 'Rob Hubbard', '1985 Elite');
    INSERT INTO hvsc_files VALUES (11, '${HV}/Delta.sid', 'Hubbard', '2:00', 'PSID', '2', 'PAL', 'MOS6581', 2, 1,
      'Delta', 'Rob Hubbard', '1987 Thalamus');
    INSERT INTO hvsc_lengths VALUES ('${HV}/Commando.sid', 1, '1:30');
    INSERT INTO tags_info VALUES (1, 'Rock', 'music');
    INSERT INTO tags_lookup VALUES (1, 10, 1);
    INSERT INTO youtube VALUES (1, 10, 1, 'chan', 'vid1', 0, 1);
    INSERT INTO youtube VALUES (2, 10, 1, 'chan', 'vid2', 1, 0);
    INSERT INTO youtube VALUES (3, 11, 1, 'chan', 'vid3', 0, 1);
    INSERT INTO players_lookup VALUES ('Hubbard', 1);
    INSERT INTO players_info VALUES (1, 'Rob Hubbard player', '', 'desc', 'Rob', 1985, 0);
  `);
  db.close();

  const app = express();
  const { default: deepsidRoutes } = await import('./deepsid');
  app.use('/api/deepsid', deepsidRoutes);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/deepsid`;
});
afterAll(async () => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('/api/deepsid', () => {
  it('composer: found by path with links, tune count, tags and photo', async () => {
    const { body } = await get(`/composer?path=${encodeURIComponent(HV)}`);
    expect(body).toMatchObject({ found: true, id: 1, tuneCount: 2, died: null, photoUrl: '/api/deepsid/image/composers/musicians_h_hubbard_rob.jpg' });
    expect(body.handles).toEqual(['Rob Hubbard', 'Old']);
    expect(body.links).toEqual([{ name: 'Home', url: 'http://example.com' }]);
    expect(body.tags).toEqual([{ name: 'Rock', type: 'music' }]);
  });
  it('composer: found by author, and not found otherwise', async () => {
    expect((await get('/composer?author=Rob%20Hubbard')).body.found).toBe(true);
    expect((await get('/composer?path=nope')).body).toEqual({ found: false });
  });
  it('tunes: lists a folder with paging, empty without a path', async () => {
    const { body } = await get(`/tunes?path=${encodeURIComponent(HV)}&limit=1`);
    expect(body.total).toBe(2);
    expect(body.tunes).toHaveLength(1);
    expect(body.tunes[0].filename).toBe('Commando.sid');
    expect((await get('/tunes')).body).toEqual({ tunes: [], total: 0 });
  });
  it('file/:id: tags, youtube and lengths; 404 for unknown', async () => {
    const { body } = await get('/file/10');
    expect(body.name).toBe('Commando');
    expect(body.tags).toHaveLength(1);
    expect(body.youtube.map((y: { videoId: string }) => y.videoId)).toEqual(['vid1', 'vid2']);
    expect(body.lengths).toEqual([{ subtune: 1, length: '1:30' }]);
    expect((await get('/file/999')).status).toBe(404);
  });
  it('file-by-path: plain and prefixed path, 400 and 404', async () => {
    expect((await get(`/file-by-path?path=${encodeURIComponent(HV + '/Delta.sid')}`)).body.id).toBe(11);
    expect((await get('/file-by-path?path=' + encodeURIComponent('MUSICIANS/H/Hubbard_Rob/Delta.sid'))).body.id).toBe(11);
    expect((await get('/file-by-path')).status).toBe(400);
    expect((await get('/file-by-path?path=zzz')).status).toBe(404);
  });
  it('player/:name: info and 404', async () => {
    expect((await get('/player/Hubbard')).body).toMatchObject({ title: 'Rob Hubbard player', startYear: 1985, endYear: null });
    expect((await get('/player/none')).status).toBe(404);
  });
  it('search: composers and files, tags category, empty query', async () => {
    const all = (await get('/search?q=Hubbard')).body;
    expect(all.composers).toHaveLength(1);
    expect(all.total).toBe(2);
    const tags = (await get('/search?q=Rock&category=tags')).body;
    expect(tags.files.map((f: { id: number }) => f.id)).toEqual([10]);
    expect((await get('/search?q=')).body).toEqual({ composers: [], files: [], total: 0 });
  });
  it('stats: row counts', async () => {
    expect((await get('/stats')).body).toMatchObject({ composers: 1, files: 2, tags: 1, youtubeLinks: 3 });
  });
  it('image: serves a file, rejects bad type, 404 missing', async () => {
    const r = await fetch(`${base}/image/composers/musicians_h_hubbard_rob.jpg`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/jpeg');
    expect((await get('/image/evil/x.jpg')).status).toBe(400);
    expect((await get('/image/composers/missing.jpg')).status).toBe(404);
  });
  it('tags and tags/:fileId', async () => {
    expect((await get('/tags')).body).toEqual([{ id: 1, name: 'Rock', type: 'music', count: 1 }]);
    expect((await get('/tags/10')).body).toEqual([{ id: 1, name: 'Rock', type: 'music' }]);
    expect((await get('/tags/abc')).status).toBe(400);
  });
  it('recommended: ranks by youtube links and lists notable composers', async () => {
    const { body } = await get('/recommended');
    expect(body.topTunes.map((t: { id: number; youtubeLinks: number }) => [t.id, t.youtubeLinks])).toEqual([[10, 2], [11, 1]]);
    expect(body.notableComposers.map((c: { id: number }) => c.id)).toEqual([1]);
  });
});
