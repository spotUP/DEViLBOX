/**
 * One companion fetch for every in-app load path. The file browser listed a
 * directory from the bundled manifest, which only holds common module and
 * audio extensions, so a Jesper Olsen song in songs/formats loaded without
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
    const found = await gatherCompanions('lollypop-subgame_01.jo', 'songs/formats/', undefined);
    expect([...found.keys()]).toContain('WantedTeam.bin');
    expect(found.get('WantedTeam.bin')!.byteLength).toBeGreaterThan(0);
  });

  it('finds the .nt partner of a StarTrekker AM song in a mixed folder', async () => {
    const found = await gatherCompanions('shortsong1.mod', 'songs/formats', undefined);
    expect([...found.keys()]).toContain('shortsong1.mod.nt');
  });

  it('reads an index listing for a folder the manifest knows nothing about', async () => {
    const listing = await appCompanionIO.listing('songs/paul-robotham/');
    expect(listing?.siblings).toContain('mdtest.ssd');
  });

  it('gives a plain module no partners', async () => {
    const found = await gatherCompanions('a sleep so deep.mod', 'songs/formats/', undefined);
    expect(found.size).toBe(0);
  });
});
