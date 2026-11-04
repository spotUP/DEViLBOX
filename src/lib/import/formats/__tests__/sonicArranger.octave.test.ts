/**
 * Sonic Arranger octave (measured 2026-11-05, thoughts/spot/2026-11-05-octave-sonic-arranger.md): UADE's Paula
 * AUDxPER log of almighty.sa (60 s, periodToPitch) names, voice for voice, the same absolute pitches as the
 * parsed grid. The first ten Paula pitches per voice below were logged, not derived: saNote 49 = period 856 =
 * C-1 = grid 13, saNote 61 = 428 = C-2 = grid 25. The grid constant (saNote - 36) is therefore correct.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSonicArrangerFile } from '@/lib/import/formats/SonicArrangerParser';
import { periodToNote } from '@/lib/amiga/periodNotes';

const PAULA_FIRST10 = [
  [13, 13, 13, 25, 29, 29, 27, 27, 25, 25],
  [25, 25, 25, 13, 13, 29, 17, 29, 41, 29],
  [37, 37, 37, 37, 37, 37, 37, 37, 37, 37],
  [17, 20, 22, 27, 25, 29, 29, 31, 32, 31],
];

describe('Sonic Arranger octave', () => {
  it('almighty.sa grid notes equal the pitches Paula plays', async () => {
    const raw = readFileSync('public/data/songs/formats/almighty.sa');
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const song = await parseSonicArrangerFile(buf, 'almighty.sa');
    const order = song.songPositions?.length ? song.songPositions : song.patterns.map((_, i) => i);
    for (let ch = 0; ch < 4; ch++) {
      const seq: number[] = [];
      for (const pi of order) for (const r of song.patterns[pi].channels[ch].rows) if (r.note > 0 && r.note < 97) seq.push(r.note);
      expect(seq.slice(0, 10)).toEqual(PAULA_FIRST10[ch]);
    }
    expect(periodToNote(856)).toBe(13);
    expect(periodToNote(428)).toBe(25);
  });
});
