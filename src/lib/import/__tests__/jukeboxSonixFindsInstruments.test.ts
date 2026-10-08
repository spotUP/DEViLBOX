/**
 * Every Sonix row in the jukebox failed silent (2026-10-06). The panel resolved
 * companions against the ROW's directory (`iff-smus/- unknown`) while the songs
 * sit in subfolders (`42/42.smus`, instruments in `42/instruments/`), so no
 * Instruments reached the engine. Companions are resolved against the song
 * file's own directory, and a failed load raises a copyable toast.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gatherCompanions, directoryOfFile, resetCompanionIndexCache } from '../companionFetch';

function servePublic(): void {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = decodeURIComponent(String(input));
    const local = join('public', url.replace(/^\/+/, ''));
    if (url.startsWith('/data/') && existsSync(local) && statSync(local).isFile()) return new Response(readFileSync(local), { status: 200 });
    return new Response('nf', { status: 404 });
  });
}

describe('the jukebox loads a Sonix song with its instruments', () => {
  beforeEach(() => { resetCompanionIndexCache(); servePublic(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a song in a subfolder of its index row finds the Instruments beside it', async () => {
    const file = '/data/songs/iff-smus/- unknown/42/42.smus';
    const bytes = readFileSync(join('public', file));
    const own = await gatherCompanions('42.smus', directoryOfFile(file), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const mine = readdirSync(join('public', directoryOfFile(file), 'instruments'));
    const got = new Set([...own.keys()].map((k) => k.split('/').pop()!.toLowerCase()));
    // Every instrument of THIS song arrives (the row's shared folder holds other songs' instruments).
    expect(mine.filter((n) => !got.has(n.toLowerCase()))).toEqual([]);
  });

  it('the panel resolves against the song file directory and a failed load is a toast', () => {
    const src = readFileSync('src/components/jukebox/JukeboxPanel.tsx', 'utf8');
    // Since U2.5 (333e95e73) the panel hands openSong a url source and
    // acquireSource resolves companions against that url's own directory.
    expect(src).toContain("loadAndPlay({ kind: 'url', url: file,");
    expect(src).not.toMatch(/gatherCompanions\([^)]*row\.dir/);
    const acquire = readFileSync('src/lib/song/acquireSource.ts', 'utf8');
    expect(acquire).toContain('acquireNeighbourCompanions(name, directoryOfFile(src.url), bytes)');
    expect(src).toContain('notify.error(`Load failed');
  });
});
