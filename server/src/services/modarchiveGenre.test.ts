import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  // database.ts opens its file at import: keep it out of the real data directory.
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'genre-svc-'));
});

import Database from 'better-sqlite3';
import { createGenreTables } from '../db/database';
import {
  createGenreService, normaliseModuleName, parseSearchXml, pickGenre, GenreLookupError,
  type ModArchiveModule, type GenreServiceOptions,
} from './modarchiveGenre';

const API_KEY = 'secret-test-key';
const DAY = 24 * 60 * 60 * 1000;

/** One <module> block shaped like a real xml-tools search answer (nested artist id after the module id). */
function moduleXml(m: { id: number; filename: string; bytes: number; hash: string; genreid: number | string; genretext: string }): string {
  return `<module><filename>${m.filename}</filename><format>MOD</format>`
    + `<url>https://api.modarchive.org/downloads.php?moduleid=${m.id}#${m.filename}</url>`
    + `<id>${m.id}</id><hash>${m.hash}</hash><bytes>${m.bytes}</bytes>`
    + `<genreid>${m.genreid}</genreid><genretext>${m.genretext}</genretext>`
    + `<artist_info><artists>1</artists><artist><id>99999</id><alias>someone</alias></artist></artist_info>`
    + `</module>`;
}
const answer = (...modules: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><modarchive><sponsor><text>x</text></sponsor>`
  + `<results>${modules.length}</results>${modules.join('')}</modarchive>`;

const HIT = moduleXml({ id: 100721, filename: 'chemical_emotion.mod', bytes: 56000, hash: '135bc8c2facf19152c05ca1f90a7214d', genreid: 2, genretext: 'Electronic - Drum &amp; Bass' });

const mod = (over: Partial<ModArchiveModule>): ModArchiveModule => ({
  id: 1, filename: 'a.mod', bytes: 100, hash: 'a'.repeat(32), genreId: 2, genreText: 'Trance', ...over,
});

function setup(over: Partial<GenreServiceOptions> & { body?: string } = {}) {
  const database = new Database(':memory:');
  createGenreTables(database);
  const fetchFn = vi.fn(async () => new Response(over.body ?? answer(HIT)));
  const service = createGenreService({
    db: database, fetch: fetchFn as unknown as typeof fetch, apiKey: () => API_KEY,
    monthlyBudget: 100, minIntervalMs: 0, maxQueue: 50, ...over,
  });
  return { database, fetchFn, service };
}
const Q = { key: '0123456789ab', name: 'DH0:Mods/mod.Chemical_Emotion', size: 56000 };

describe('normaliseModuleName', () => {
  it.each([
    ['DH0:Mods/mod.Chemical_Emotion', 'chemical_emotion.mod'],
    ['pub/modules/Protracker/James/chemical emotion.mod', 'chemical_emotion.mod'],
    ['mod.Chemical  Emotion', 'chemical_emotion.mod'],
    ['Foo.XM.lha', 'foo.xm'],
    ['C:\\music\\tune.S3M', 'tune.s3m'],
    ['mdat.song', null],
    ['song.tfmx', null],
    ['mod.', null],
    ['noext', null],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseModuleName(input)).toBe(expected);
  });
});

describe('parseSearchXml', () => {
  it('reads the module fields, decodes entities and takes the module id, not the artist id', () => {
    expect(parseSearchXml(answer(HIT))).toEqual([{
      id: 100721, filename: 'chemical_emotion.mod', bytes: 56000,
      hash: '135bc8c2facf19152c05ca1f90a7214d', genreId: 2, genreText: 'Electronic - Drum & Bass',
    }]);
  });
  it('a miss has no modules', () => {
    expect(parseSearchXml(answer())).toEqual([]);
  });
});

describe('pickGenre', () => {
  it('no module with the same bytes is a miss', () => {
    expect(pickGenre([mod({ bytes: 99 })], 100).source).toBe('miss');
  });
  it('an md5 that differs is a miss', () => {
    expect(pickGenre([mod({})], 100, 'b'.repeat(32)).source).toBe('miss');
  });
  it('two different tags on the same bytes are ambiguous', () => {
    expect(pickGenre([mod({ id: 1 }), mod({ id: 2, hash: 'c'.repeat(32), genreText: 'Ambient' })], 100).source).toBe('ambiguous');
  });
  it('the md5 settles an ambiguous match', () => {
    const v = pickGenre([mod({ id: 1 }), mod({ id: 2, hash: 'c'.repeat(32), genreText: 'Ambient' })], 100, 'c'.repeat(32));
    expect(v).toEqual({ source: 'modarchive', genre: 'Ambient', modarchiveId: 2, md5: 'c'.repeat(32) });
  });
  it('genre id 0 or n/a is untagged', () => {
    expect(pickGenre([mod({ genreId: 0 })], 100).source).toBe('untagged');
    expect(pickGenre([mod({ genreText: 'n/a' })], 100).source).toBe('untagged');
  });
});

describe('createGenreService', () => {
  it('stores a miss and does not ask again', async () => {
    const { service, fetchFn } = setup({ body: answer() });
    expect((await service.lookup(Q)).source).toBe('miss');
    expect((await service.lookup(Q)).source).toBe('miss');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('asks again about a non-hit after 180 days, never about a hit', async () => {
    let t = Date.UTC(2026, 0, 1);
    const miss = setup({ body: answer(), now: () => t });
    await miss.service.lookup(Q);
    t += 181 * DAY;
    await miss.service.lookup(Q);
    expect(miss.fetchFn).toHaveBeenCalledTimes(2);

    t = Date.UTC(2026, 0, 1);
    const hit = setup({ now: () => t });
    await hit.service.lookup(Q);
    t += 400 * DAY;
    await hit.service.lookup(Q);
    expect(hit.fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a used-up budget answers 503 and stores nothing', async () => {
    const { service, fetchFn, database } = setup({ monthlyBudget: 1, body: answer() });
    await service.lookup(Q);
    const err = await service.lookup({ ...Q, key: 'ffffffffffff' }).catch((e) => e);
    expect(err).toBeInstanceOf(GenreLookupError);
    expect(err.status).toBe(503);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(database.prepare("SELECT 1 FROM module_genres WHERE key = 'ffffffffffff'").get()).toBeUndefined();
  });

  it('no API key answers 503 without a request', async () => {
    const { service, fetchFn } = setup({ apiKey: () => undefined });
    await expect(service.lookup(Q)).rejects.toMatchObject({ status: 503 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a failed request answers 502, stores nothing and never shows the key', async () => {
    const { service, database } = setup({
      fetch: (async (url: string) => { throw new Error(`connect failed ${url}`); }) as unknown as typeof fetch,
    });
    const err = await service.lookup(Q).catch((e) => e);
    expect(err.status).toBe(502);
    expect(String(err.message)).not.toContain(API_KEY);
    expect(database.prepare('SELECT COUNT(*) AS n FROM module_genres').get()).toEqual({ n: 0 });
  });

  it('a no-results <error> answer is stored as a miss and not asked again', async () => {
    const { service, fetchFn } = setup({ body: '<modarchive><error>Sorry, no results were found.</error></modarchive>' });
    expect((await service.lookup(Q)).source).toBe('miss');
    expect((await service.lookup(Q)).source).toBe('miss');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('an <error> answer is 502', async () => {
    const { service } = setup({ body: '<modarchive><error>Invalid key</error></modarchive>' });
    await expect(service.lookup(Q)).rejects.toMatchObject({ status: 502 });
  });

  it('concurrent lookups of one key make one request', async () => {
    const { service, fetchFn } = setup();
    const [a, b] = await Promise.all([service.lookup(Q), service.lookup(Q)]);
    expect(a).toEqual(b);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('spaces requests by minIntervalMs', async () => {
    const at: number[] = [];
    const { service } = setup({
      minIntervalMs: 60,
      fetch: (async () => { at.push(Date.now()); return new Response(answer()); }) as unknown as typeof fetch,
    });
    await Promise.all([service.lookup(Q), service.lookup({ ...Q, key: 'ffffffffffff' })]);
    expect(at).toHaveLength(2);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(55);
  });

  it('a full queue answers 503', async () => {
    const { service } = setup({ maxQueue: 1, minIntervalMs: 50 });
    const results = await Promise.allSettled([service.lookup(Q), service.lookup({ ...Q, key: 'ffffffffffff' })]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 503 } });
  });

  it('a name without a ModArchive format is stored as unsupported without a request', async () => {
    const { service, fetchFn } = setup();
    expect((await service.lookup({ ...Q, name: 'mdat.song' })).source).toBe('unsupported');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('an ambiguous row is settled when a later client sends the md5', async () => {
    const twin = moduleXml({ id: 5, filename: 'chemical_emotion.mod', bytes: 56000, hash: 'c'.repeat(32), genreid: 7, genretext: 'Ambient' });
    const { service, fetchFn } = setup({ body: answer(HIT, twin) });
    expect((await service.lookup(Q)).source).toBe('ambiguous');
    expect(await service.lookup({ ...Q, md5: 'c'.repeat(32) })).toMatchObject({ source: 'modarchive', genre: 'Ambient', modarchiveId: 5 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
