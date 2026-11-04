/**
 * Regression (TW-OCT): future basketball main.tw imported with format 'XM', a note-number format, so the song was
 * not an Amiga-period song: the keyboard typed at octave 4 (past the player's 3-octave table) and a sample
 * instrument played a key by note name against its C3 base, an octave under the period the player uses.
 *
 * Measured from the file's replayer (thoughts/spot/2026-11-04-octave-audit.md, "TW-OCT finding"): note byte 0
 * plays period 856 (C-1), the table at 0x634 is ProTracker C-1..B-3, the most common byte 12 plays period 428.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { songUsesAmigaPeriods, typingOctaveFor, periodToNote, PROTRACKER_TYPING_OCTAVE } from '@/lib/amiga/periodNotes';
import { getNoteTable } from '@/engine/renderer/TrackerGLRenderer';
import { keyboardPeriod } from '@/engine/keyboardPeriod';
import { xmNoteToToneJS } from '@/lib/xmConversions';

const PATH = 'public/data/songs/formats/future basketball main.tw';
const AMIGA_PAL_HALF = 3546895;

describe('Tony Williams octave', () => {
  it('future basketball plays as an Amiga-period song: notes at the period octave, keys and instruments in tune', async () => {
    const raw = readFileSync(PATH);
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'future basketball main.tw'));

    expect(songUsesAmigaPeriods(song.format)).toBe(true);
    expect(typingOctaveFor(song.format)).toBe(PROTRACKER_TYPING_OCTAVE);

    // Grid octave spread: the most common note is the one the player plays at period 428 (C-2).
    const hist = new Map<number, number>();
    for (const p of song.patterns) for (const ch of p.channels) for (const r of ch.rows) {
      if (r.note > 0 && r.note < 97) hist.set(r.note, (hist.get(r.note) ?? 0) + 1);
    }
    const top = [...hist.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(top).toBe(periodToNote(428));
    expect(getNoteTable(song.noteDisplayOffset ?? 0)[top]).toBe('C-2');
    const notes = [...hist.keys()];
    expect(Math.min(...notes)).toBeGreaterThanOrEqual(periodToNote(856));
    expect(Math.max(...notes)).toBeLessThanOrEqual(periodToNote(113));

    // A key at that grid note on a song sample instrument plays the player's period, at the player's rate.
    const inst = song.instruments[0]!;
    const name = xmNoteToToneJS(top)!;
    const period = keyboardPeriod(inst.metadata?.modPlayback, name, songUsesAmigaPeriods(song.format));
    expect(period).toBe(428);
    expect(Math.round(AMIGA_PAL_HALF / period!)).toBe(8287);
  });
});
