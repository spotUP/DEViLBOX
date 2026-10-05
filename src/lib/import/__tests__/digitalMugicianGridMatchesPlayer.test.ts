/**
 * Regression: the Digital Mugician grid did not show what the replayer plays.
 *
 * Symptoms (tools/uade-audit/gridVsPaula.ts on cockwise.mug, Mugician II):
 *   - every plain note showed the same pitch. A plain DM cell carries effect
 *     byte 0, which the replayer reads as Pitch Bend (val1 1) towards note 0
 *     at speed 0 - a bend that never moves - but the parser replaced the
 *     row's note with the bend target, so the grid read "C-0" on every row;
 *   - Mugician II showed four channels where the replayer runs seven voices:
 *     sub-song 0 is the PAIR of song headers 0 and 1 - song 0's columns 0..2
 *     on Paula AUD3/AUD1/AUD2, song 1's columns 0..3 mixed into AUD0
 *     (Mugician II_v8.asm, Init + Play); the grid used song 0's four columns;
 *   - patterns always ran 64 rows, ignoring the Pattern Length effect.
 *
 * The expected sequences below were read from UADE's Paula write log while
 * the real replayer played the file (tools/uade-audit/gridVsPaula.ts note-on
 * rules) and named by the period each note plays, through the one Amiga
 * naming (src/lib/amiga/periodNotes.ts, 428 = C-2). The grid must show the
 * same note numbers: the same tune AND the same names. (Before, the grid
 * named a DM table index i as note i + 1, eleven semitones above the
 * period's name.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDigitalMugicianFile } from '../formats/DigitalMugicianParser';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { dmIndexToNote, noteToDMIndex } from '../formats/DigitalMugicianNotes';
import { noteToPeriod } from '@/lib/amiga/periodNotes';

async function load(rel: string): Promise<TrackerSong> {
  const raw = readFileSync(join(process.cwd(), rel));
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  return parseDigitalMugicianFile(ab, rel.split('/').pop() ?? rel);
}

/** Re-triggered notes of one grid channel in song order (Note Wander, 3xx, slides without a retrigger). */
function channelNotes(song: TrackerSong, ch: number, count: number): number[] {
  const out: number[] = [];
  for (const p of song.songPositions) {
    for (const cell of song.patterns[p].channels[ch].rows) {
      if (cell.note > 0 && cell.note < 97 && cell.effTyp !== 0x03) out.push(cell.note);
      if (out.length === count) return out;
    }
  }
  return out;
}

describe('Digital Mugician grid plays what the replayer plays', () => {
  it('names DM pitches by the period they play (periodNotes: 856 = C-1 = 13, 428 = C-2 = 25)', () => {
    expect(dmIndexToNote(23)).toBe(13);  // period 853
    expect(dmIndexToNote(35)).toBe(25);  // period 426
    expect(dmIndexToNote(11)).toBe(1);   // period 1706 = C-0
    expect(noteToPeriod(25)).toBe(428);
    // Writing a grid note back gives the cell byte it came from, over the whole nameable range.
    for (let i = 11; i < 57; i++) expect(noteToDMIndex(dmIndexToNote(i))).toBe(i);
  });


  it('Mugician II (cockwise.mug): seven voices; the hardware voices open with the notes Paula plays', async () => {
    const song = await load('public/data/songs/formats/cockwise.mug');
    expect(song.numChannels).toBe(7);
    expect(song.patterns[0].channels).toHaveLength(7);

    // Grid channel -> Paula voice: 0 -> AUD3, 1 -> AUD1, 2 -> AUD2.
    // AUD3 (first note precedes the log, so its sequence starts at note 2).
    expect(channelNotes(song, 0, 16).slice(1)).toEqual(
      [20, 25, 28, 32, 37, 35, 30, 16, 20, 25, 28, 30, 26, 24, 36]);
    // AUD1
    expect(channelNotes(song, 1, 16)).toEqual(
      [23, 28, 33, 30, 28, 30, 27, 23, 23, 28, 33, 30, 33, 30, 36, 36]);
    // AUD2
    expect(channelNotes(song, 2, 14)).toEqual(
      [41, 23, 28, 25, 28, 30, 30, 33, 32, 30, 28, 27, 25, 37]);

    // The mixed voices carry song 1's tracks, so they are not empty.
    for (let ch = 3; ch < 7; ch++) expect(channelNotes(song, ch, 4)).toHaveLength(4);
  });

  it('Mugician I (flight.dmu): four voices open with the notes Paula plays', async () => {
    const song = await load('public/data/songs/formats/flight.dmu');
    expect(song.numChannels).toBe(4);
    const paula = [
      [39, 29, 29, 39, 39, 29, 39, 29, 39, 39, 29, 39, 29, 39, 29, 29],
      [22, 20, 22, 20, 22, 25, 27, 22, 22, 20, 22, 20, 22, 25, 27, 22],
      [22, 24, 25, 24, 25, 29, 22, 25, 27, 25, 22, 20, 22, 25, 22, 22],
      [34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 32, 32, 32, 32, 32, 34],
    ];
    // flight's voice 1 opens with one note before the log starts.
    const grid = [
      channelNotes(song, 0, 16),
      channelNotes(song, 1, 17).slice(1),
      channelNotes(song, 2, 16),
      channelNotes(song, 3, 16),
    ];
    for (let ch = 0; ch < 4; ch++) expect(grid[ch], `channel ${ch}`).toEqual(paula[ch]);
  });
});
