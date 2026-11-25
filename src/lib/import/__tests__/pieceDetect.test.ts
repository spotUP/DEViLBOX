/**
 * P/ECE music driver .pmd: content detection picks it ahead of PC-98 PMD, and the parser hands
 * the whole file to PieceEngine. Real songs live in test-data/piece (Modland, git-ignored);
 * those cases skip when the folder is missing.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { detectFormatFromContent } from '@/lib/import/FormatRegistry';
import { isPieceFormat, parsePieceFile } from '@/lib/import/formats/PieceParser';

const DIR = join(__dirname, '../../../../test-data/piece');
const songs = existsSync(DIR)
  ? readdirSync(DIR).flatMap((d) => readdirSync(join(DIR, d)).map((f) => join(DIR, d, f)))
  : [];

describe('P/ECE detection', () => {
  it('rejects a PC-98 PMD style header (byte 1 is an offset, not a part count) and PiyoPiyo', () => {
    const pc98 = new Uint8Array(64); pc98[1] = 0x1a;
    const piyo = new Uint8Array(64); piyo.set([0x50, 0x4d, 0x44]);
    expect(isPieceFormat(pc98)).toBe(false);
    expect(isPieceFormat(piyo)).toBe(false);
    expect(detectFormatFromContent('x.pmd', pc98)?.key).toBe('pmd');
  });

  it.skipIf(songs.length === 0)('claims every Modland P/ECE song and keeps the file bytes', () => {
    expect(songs.length).toBe(36);
    for (const path of songs) {
      const bytes = new Uint8Array(readFileSync(path));
      expect(detectFormatFromContent('a.pmd', bytes)?.key, path).toBe('piece');
      const song = parsePieceFile(bytes, 'a.pmd');
      expect(song?.format).toBe('PIECE');
      expect(new Uint8Array(song!.pieceFileData!)).toEqual(bytes);
    }
  });

  it.skipIf(songs.length === 0)('decodes the Shift-JIS title', () => {
    const p = songs.find((s) => s.endsWith('Final Fantasy - Prelude.pmd'))!;
    const song = parsePieceFile(new Uint8Array(readFileSync(p)), 'a.pmd')!;
    expect(song.name.length).toBeGreaterThan(0);
    expect(song.name).not.toMatch(/�/);
  });
});
