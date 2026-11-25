/**
 * BeRoTracker .brt: signature detection, ZIP-form refusal and the song shell that hands the whole file to BeRoTrackerEngine.
 * Real songs live in test-data/berotracker (Modland, git-ignored); those cases skip when the folder is missing.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { isBeRoTrackerFormat, isBeRoTrackerZip, parseBeRoTrackerFile } from '@/lib/import/formats/BeRoTrackerParser';
import type { BeRoTrackerEditModule } from '@/engine/berotracker/beRoTrackerEditWasm';

const DIR = join(__dirname, '../../../../test-data/berotracker');
const ROOT = resolve(__dirname, '../../../..');
const create = async (): Promise<BeRoTrackerEditModule> =>
  (await import('../../../../public/berotracker/BeRoTrackerEdit.js')).default({ locateFile: (f: string) => join(ROOT, 'public/berotracker', f) });
const songs = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.brt')).map((f) => join(DIR, f)) : [];

describe('BeRoTracker detection', () => {
  it('rejects a wrong signature and flags the ZIP form', async () => {
    const zip = new Uint8Array(64); zip.set([0x50, 0x4b, 3, 4]);
    expect(isBeRoTrackerFormat(zip)).toBe(false);
    expect(isBeRoTrackerZip(zip)).toBe(true);
    expect(await parseBeRoTrackerFile(zip, 'a.brt', create)).toBeNull();
  });

  it.skipIf(songs.length === 0)('claims every Modland song, keeps the bytes and reads order list and row counts', async () => {
    expect(songs.length).toBe(19);
    for (const path of songs) {
      const bytes = new Uint8Array(readFileSync(path));
      expect(isBeRoTrackerFormat(bytes), path).toBe(true);
      const song = (await parseBeRoTrackerFile(bytes, 'a.brt', create))!;
      expect(song, path).not.toBeNull();
      expect(song.format).toBe('BeRoTracker');
      expect(Buffer.compare(new Uint8Array(song.beRoTrackerFileData!), bytes), path).toBe(0); // toEqual on MB arrays times out
      expect(song.songPositions.length, path).toBeGreaterThan(0);
      expect(song.numChannels, path).toBeGreaterThan(0);
      for (const p of song.songPositions) expect(song.patterns[p]?.length, path).toBeGreaterThan(0);
    }
  }, 120_000);
});
