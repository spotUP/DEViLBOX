/**
 * Regression (MA-OCT): Music Assembler baseheads.ma imported with format 'XM', a note-number format, so the song was not an
 * Amiga-period song: the keyboard typed at octave 4 (past the 3-octave ProTracker table) and a sample instrument
 * played a key by note name against its C3 base at the stored rate, not at the period the grid note stands for.
 * The grid itself is already ProTracker-named (thoughts/spot/2026-11-04-octave-audit.md, "XM-format siblings").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { songUsesAmigaPeriods, typingOctaveFor, PROTRACKER_TYPING_OCTAVE, noteToPeriod } from '@/lib/amiga/periodNotes';
import { keyboardPeriod } from '@/engine/keyboardPeriod';
import { xmNoteToToneJS } from '@/lib/xmConversions';

const PATH = 'public/data/songs/formats/baseheads.ma';

describe('Music Assembler baseheads.ma octave', () => {
  it('plays as an Amiga-period song: typing octave and key periods follow the grid note', async () => {
    const raw = readFileSync(PATH);
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'baseheads.ma'));

    expect(songUsesAmigaPeriods(song.format)).toBe(true);
    expect(typingOctaveFor(song.format)).toBe(PROTRACKER_TYPING_OCTAVE);

    const notes = new Set<number>();
    for (const p of song.patterns) for (const ch of p.channels) for (const r of ch.rows) {
      if (r.note > 0 && r.note < 97) notes.add(r.note);
    }
    expect(notes.size).toBeGreaterThan(0);

    // A key at a grid note on a song sample instrument plays that note's ProTracker period.
    const inst = song.instruments.find((i) => i.metadata?.modPlayback?.usePeriodPlayback)!;
    expect(inst).toBeTruthy();
    const grid = 25; // C-2 = period 428
    const period = keyboardPeriod(inst.metadata?.modPlayback, xmNoteToToneJS(grid)!, songUsesAmigaPeriods(song.format));
    expect(period).toBe(428);
    expect(period).toBe(noteToPeriod(grid));
  });
});
