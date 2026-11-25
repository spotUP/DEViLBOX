/**
 * T0AST .t0ast: signature detection and the song shell that hands the whole file to T0astEngine.
 * Real songs live in test-data/t0ast (Modland, git-ignored); those cases skip when the folder is missing.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { isT0astFormat, parseT0astFile } from '@/lib/import/formats/T0astParser';

const DIR = join(__dirname, '../../../../test-data/t0ast');
const songs = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.t0ast')).map((f) => join(DIR, f)) : [];

describe('T0AST detection', () => {
  it('rejects a wrong signature', () => {
    const bad = new Uint8Array(64); bad.set([0x54, 0x30, 0x41, 0x53, 0x54, 0x02, 0x00, 0x01]);
    expect(isT0astFormat(bad)).toBe(false);
    expect(parseT0astFile(bad, 'a.t0ast')).toBeNull();
  });

  it.skipIf(songs.length === 0)('claims every Modland song, keeps the bytes and reads the order list', () => {
    expect(songs.length).toBe(8);
    for (const path of songs) {
      const bytes = new Uint8Array(readFileSync(path));
      expect(isT0astFormat(bytes), path).toBe(true);
      const song = parseT0astFile(bytes, 'a.t0ast')!;
      expect(song.format).toBe('T0AST');
      expect(new Uint8Array(song.t0astFileData!)).toEqual(bytes);
      expect(song.songPositions.length, path).toBeGreaterThan(0);
      expect(song.numChannels, path).toBe(16);
      for (const p of song.songPositions) expect(song.patterns[p], path).toBeDefined();
    }
  });
});
