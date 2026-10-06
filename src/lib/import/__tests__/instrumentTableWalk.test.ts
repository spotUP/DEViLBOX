/**
 * Regression: apb.dw (David Whittaker) showed 1 instrument while the song plays
 * several; insects_in_space.jt (Jeroen Tel) showed 2 of 16. Both parsers must
 * expose every instrument the replayer's tables hold, so each instrument id a
 * pattern cell references exists.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseDavidWhittakerFile, scanDWStructures } from '../formats/DavidWhittakerParser';
import { parseJeroenTelFile } from '../formats/JeroenTelParser';

const DIR = resolve(import.meta.dirname, '../../../../public/data/songs');

function load(rel: string): ArrayBuffer {
  const b = readFileSync(resolve(DIR, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function usedInstruments(song: TrackerSong): number[] {
  const used = new Set<number>();
  for (const p of song.patterns) for (const c of p.channels) for (const r of c.rows) {
    if (r.instrument) used.add(r.instrument);
  }
  return [...used].sort((a, b) => a - b);
}

describe('David Whittaker instrument walk', () => {
  for (const f of ['formats/apb.dw', 'david-whittaker/garfield2+.dw']) {
    it(`${f}: every instrument the grid plays exists, from the replayer's own sample table`, () => {
      const ab = load(f);
      const scan = scanDWStructures(new Uint8Array(ab));
      expect(scan?.samples.length).toBeGreaterThan(1);
      const song = parseDavidWhittakerFile(ab, f);
      const used = usedInstruments(song);
      expect(used.length).toBeGreaterThan(1);
      expect(song.instruments.length).toBe(scan!.samples.length);
      expect(Math.max(...used)).toBeLessThanOrEqual(song.instruments.length);
    });
  }
  it('apb.dw has 15 instruments (4 used by the song are all present)', () => {
    expect(parseDavidWhittakerFile(load('formats/apb.dw'), 'apb.dw').instruments).toHaveLength(15);
  });
});

describe('Jeroen Tel instrument walk', () => {
  it('insects_in_space.jt: instruments come from the sample pointer table, not the BNE displacement', async () => {
    const song = await parseJeroenTelFile(load('formats/insects_in_space.jt'), 'insects_in_space.jt');
    const used = usedInstruments(song);
    expect(used.length).toBeGreaterThanOrEqual(10);
    expect(song.instruments).toHaveLength(32);
    expect(Math.max(...used)).toBeLessThanOrEqual(song.instruments.length);
  });
});
