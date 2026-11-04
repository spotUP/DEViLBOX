/**
 * Regression (STP-OCT): SoundTracker Pro II notes were mapped as 25 + byte, so noname.stp (most common byte 48 =
 * period 214) showed C-6 (grid 73), past the 72-entry period table: noteToPeriod(73) = 0, the notes played
 * three octaves too high. Correct: byte 48 = period 214 = C-3 = grid 37 (thoughts/spot/2026-11-04-octave-audit.md,
 * "STP measured"). Export must return the byte unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { periodToNote, noteToPeriod } from '@/lib/amiga/periodNotes';
import { stpByteToGridNote, gridNoteToStpByte } from '@/lib/import/formats/stpPitch';

const PATH = 'public/data/songs/formats/noname.stp';

describe('SoundTracker Pro II octave', () => {
  it('noname.stp byte 48 shows C-3 (period 214) and every note has a period', async () => {
    const raw = readFileSync(PATH);
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'noname.stp'));
    const notes: number[] = [];
    for (const p of song.patterns) for (const ch of p.channels) for (const r of ch.rows) {
      if (r.note > 0 && r.note < 97) notes.push(r.note);
    }
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(72);
      expect(noteToPeriod(n)).toBeGreaterThan(0);
    }
    expect(notes).toContain(periodToNote(214));
    expect(periodToNote(214)).toBe(37);
  });

  it('byte <-> grid note round-trips through the period table (bytes below 12 clamp to note 1)', () => {
    expect(stpByteToGridNote(48)).toBe(37);
    expect(stpByteToGridNote(36)).toBe(periodToNote(428));
    for (let b = 12; b <= 83; b++) expect(gridNoteToStpByte(stpByteToGridNote(b))).toBe(b);
    expect(stpByteToGridNote(5)).toBe(1);
    expect(stpByteToGridNote(0)).toBe(0);
  });
});
