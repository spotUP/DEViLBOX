/**
 * InStereo! 1 octave (measured 2026-11-05, thoughts/spot/2026-11-05-octave-instereo1.md): UADE's Paula AUDxPER log
 * of fantasi8.is (60 s, periodToPitch) names the same absolute pitches as the parsed grid (index 49 = 856 = C-1 = 13,
 * index 61 = 428 = C-2 = 25). The first Paula pitches per voice were logged, not derived:
 *   v1 13,25,37,25,13,25,37,28,13,25   v3 37,38,37,37,38,37,37,37,38,37
 * The grid shows the same run on ch1 (25,13,25,37,25,13,25,37,28,13) and ch3. The edit path (decodeCell /
 * encodeCell) had the sign reversed (+36 / -36) and erased or misnamed every note; it must round-trip the byte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseInStereo1File } from '@/lib/import/formats/InStereo1Parser';
import { periodToNote } from '@/lib/amiga/periodNotes';

const GRID_FIRST10 = [
  [25, 25, 37, 44, 37, 32, 44, 40, 35, 40],
  [25, 13, 25, 37, 25, 13, 25, 37, 28, 13],
  [13, 13, 25, 13, 13, 25, 16, 13, 13, 25],
  [37, 37, 38, 37, 37, 38, 37, 37, 37, 38],
];

describe('InStereo 1 octave', () => {
  const raw = readFileSync('public/data/songs/formats/fantasi8.is');
  const song = parseInStereo1File(new Uint8Array(raw), 'fantasi8.is')!;

  it('fantasi8.is grid notes equal the pitches Paula plays', () => {
    const order = song.songPositions?.length ? song.songPositions : song.patterns.map((_, i) => i);
    for (let ch = 0; ch < 4; ch++) {
      const seq: number[] = [];
      for (const pi of order) for (const r of song.patterns[pi].channels[ch].rows) if (r.note > 0 && r.note < 97) seq.push(r.note);
      expect(seq.slice(0, 10)).toEqual(GRID_FIRST10[ch]);
    }
    expect(periodToNote(856)).toBe(13);
    expect(periodToNote(428)).toBe(25);
  });

  it('edit path: raw note byte 61 (period 428) decodes to C-2 and encodes back to 61', () => {
    const l = song.uadePatternLayout!;
    expect(l.decodeCell!(new Uint8Array([61, 1, 0, 0])).note).toBe(25);
    expect(l.decodeCell!(new Uint8Array([49, 1, 0, 0])).note).toBe(13);
    expect(l.encodeCell({ note: 25 } as never)[0]).toBe(61);
    expect(l.encodeCell({ note: 13 } as never)[0]).toBe(49);
  });
});
