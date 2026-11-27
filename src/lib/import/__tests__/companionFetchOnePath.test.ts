/**
 * One companion fetch for every in-app load path. The file browser listed a
 * directory from the bundled manifest, which only holds common module and
 * audio extensions, so a Jesper Olsen song in a songs/<format> dir loaded without
 * WantedTeam.bin and a StarTrekker song without its `.nt`, while the jukebox
 * found both (2026-10-05).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { gatherCompanions, appCompanionIO, resetCompanionIndexCache } from '../companionFetch';

const PUBLIC = join(process.cwd(), 'public');

/** Serve public/ from disk at its web path; the server API is down. */
function servePublic(): void {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = decodeURIComponent(String(input));
    const local = join(PUBLIC, url.replace(/^\/+/, ''));
    if (url.startsWith('/data/') && existsSync(local)) {
      return new Response(readFileSync(local), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    }
    return new Response('not found', { status: 404 });
  });
}

describe('companionFetch: the file browser and the jukebox read the same partners', () => {
  beforeEach(() => { resetCompanionIndexCache(); servePublic(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('finds WantedTeam.bin beside a Jesper Olsen song in a mixed folder', async () => {
    const found = await gatherCompanions('lollypop-subgame_01.jo', 'songs/jesper-olsen/', undefined);
    expect([...found.keys()]).toContain('WantedTeam.bin');
    expect(found.get('WantedTeam.bin')!.byteLength).toBeGreaterThan(0);
  });

  it('finds the .nt partner of a StarTrekker AM song in a mixed folder', async () => {
    const found = await gatherCompanions('shortsong1.mod', 'songs/startrekker-am', undefined);
    expect([...found.keys()]).toContain('shortsong1.mod.nt');
  });

  it('reads an index listing for a folder the manifest knows nothing about', async () => {
    const listing = await appCompanionIO.listing('songs/paul-robotham/');
    expect(listing?.siblings).toContain('mdtest.ssd');
  });

  it('gives a plain module no partners', async () => {
    const found = await gatherCompanions('a sleep so deep.mod', 'songs/mod/', undefined);
    expect(found.size).toBe(0);
  });
});

/**
 * Server listing for a folder the song index does not cover. It read
 * `<parent>/Samples/` blind, so every EdLib .d00 load fired a 404 to
 * /api/demo/songs/ad-lib/EdLib D00/Samples/ (2026-11-24).
 */
describe('companionFetch: server listing asks only for folders that exist', () => {
  const tree: Record<string, { name: string; isDirectory: boolean }[]> = {
    '': [{ name: 'ad-lib', isDirectory: true }, { name: 'zm', isDirectory: true }, { name: 'sx', isDirectory: true }],
    'ad-lib/': [{ name: 'EdLib D00', isDirectory: true }],
    'ad-lib/EdLib D00/': [{ name: 'JCH', isDirectory: true }],
    'ad-lib/EdLib D00/JCH/': [{ name: 'colgatbo.d00', isDirectory: false }],
    'zm/': [{ name: 'Songs', isDirectory: true }, { name: 'Samples', isDirectory: true }],
    'zm/Songs/': [{ name: 'tune.sng', isDirectory: false }],
    'zm/Samples/': [{ name: 'electom', isDirectory: false }],
    'sx/': [{ name: 'song.smus', isDirectory: false }, { name: 'Instruments', isDirectory: true }],
    'sx/Instruments/': [{ name: 'bass.instr', isDirectory: false }],
  };
  let requested: string[] = [];

  beforeEach(() => {
    resetCompanionIndexCache();
    requested = [];
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = decodeURIComponent(String(input));
      const m = url.match(/\/demo\/songs\/(.*)$/);
      if (!m) return new Response('not found', { status: 404 }); // index.json: not covered
      requested.push(m[1]);
      const entries = tree[m[1]];
      return entries ? Response.json(entries) : new Response('not found', { status: 404 });
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('never asks for Samples/ beside an EdLib song', async () => {
    await appCompanionIO.listing('songs/ad-lib/EdLib D00/JCH/');
    expect(requested.filter((p) => !(p in tree))).toEqual([]);
  });

  it('still finds a ZoundMonitor song\'s Samples/ beside its directory', async () => {
    const listing = await appCompanionIO.listing('songs/zm/Songs/');
    expect(listing?.parentSamples).toEqual(['electom']);
  });

  it('still finds a Sonix song\'s Instruments/ subfolder', async () => {
    const listing = await appCompanionIO.listing('songs/sx/');
    expect(listing?.subdirs?.Instruments).toEqual(['bass.instr']);
  });
});
