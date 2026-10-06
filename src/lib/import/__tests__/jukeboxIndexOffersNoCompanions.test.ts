/**
 * The jukebox loaded `shortsong1.mod.nt` - the StarTrekker companion - as the
 * song (2026-10-06). The song index must never offer a file the resolver names
 * as another module's companion, nor a partner-required module with no partner.
 * Checked against the committed index (public/data/songs/index.json).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectFormat } from '../FormatRegistry';
import { companionFilesIn, partnerlessFilesIn, type CompanionListing } from '../companionResolver';

interface Index { entries: Array<{ id: string; files: string[] }>; dirs: Record<string, CompanionListing> }
const index = JSON.parse(readFileSync('public/data/songs/index.json', 'utf8')) as Index;

/** Same predicate the index builder uses (scripts/build-song-index.ts). */
function isSongByName(name: string): boolean {
  const det = detectFormat(name.toLowerCase());
  return !!det && det.key !== 'amiga_formats_catchall';
}

describe('the jukebox song index offers no companion file as a song', () => {
  it('names no StarTrekker .nt, shared bank or partnerless module as a row file', () => {
    const offending: string[] = [];
    for (const entry of index.entries) {
      for (const f of entry.files) {
        const dir = f.slice(0, f.lastIndexOf('/'));
        const name = f.slice(f.lastIndexOf('/') + 1).toLowerCase();
        const listing = index.dirs[dir];
        if (!listing) continue;
        const bad = new Set([...companionFilesIn(listing, isSongByName), ...partnerlessFilesIn(listing)].map((c) => c.toLowerCase()));
        if (bad.has(name)) offending.push(`${entry.id}: ${f}`);
      }
    }
    expect(offending).toEqual([]);
  });
});
