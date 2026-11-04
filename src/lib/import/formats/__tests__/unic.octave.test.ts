/**
 * UNIC octave (measured 2026-11-05, thoughts/spot/2026-11-05-octave-unic.md): UADE's Paula AUDxPER log of
 * 'african dreams.unic' (60 s) names the same pitch set as the parsed grid (periodToPitch): 13, 25, 28, 30, 32,
 * 33, 35, 37, 42, 44 ... i.e. noteIdx 1 = period 856 = C-1 = grid 13, and the song's anchors sit at
 * period 428 (C-2, grid 25) and 214 (C-3, grid 37). The grid constant (noteIdx + 12) is therefore correct.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseUNICFile } from '@/lib/import/formats/UNICParser';
import { periodToNote, noteToPeriod } from '@/lib/amiga/periodNotes';

describe('UNIC octave', () => {
  it('african dreams.unic grid notes equal the periods Paula plays', async () => {
    const raw = readFileSync('public/data/songs/formats/african dreams.unic');
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const song = await parseUNICFile(buf, 'african dreams.unic');
    const hist = new Map<number, number>();
    for (const p of song.patterns) for (const ch of p.channels) for (const r of ch.rows) {
      if (r.note > 0) hist.set(r.note, (hist.get(r.note) ?? 0) + 1);
    }
    const notes = [...hist.keys()];
    expect(Math.min(...notes)).toBe(periodToNote(856));
    expect(notes).toContain(periodToNote(428));
    expect(notes).toContain(periodToNote(214));
    for (const n of notes) expect(noteToPeriod(n)).toBeGreaterThan(0);
  });
});
