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
 * the real replayer played the file (note-on = sample start + period, the
 * loop-pointer reload one tick later not counted), as semitone steps, so they
 * do not depend on the grid's note naming.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDigitalMugicianFile } from '../formats/DigitalMugicianParser';
import type { TrackerSong } from '@/engine/TrackerReplayer';

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

const steps = (notes: number[]): number[] => notes.slice(1).map((n, i) => n - notes[i]);

describe('Digital Mugician grid plays what the replayer plays', () => {
  it('Mugician II (cockwise.mug): seven voices; the hardware voices open with the notes Paula plays', async () => {
    const song = await load('public/data/songs/formats/cockwise.mug');
    expect(song.numChannels).toBe(7);
    expect(song.patterns[0].channels).toHaveLength(7);

    // Grid channel -> Paula voice: 0 -> AUD3, 1 -> AUD1, 2 -> AUD2.
    // AUD3 (first note precedes the log, so its sequence starts at note 2).
    expect(steps(channelNotes(song, 0, 16).slice(1))).toEqual(
      steps([47, 52, 55, 59, 64, 62, 57, 43, 47, 52, 55, 57, 53, 51, 63]));
    // AUD1
    expect(steps(channelNotes(song, 1, 16))).toEqual(
      steps([50, 55, 60, 57, 55, 57, 54, 50, 50, 55, 60, 57, 60, 57, 63, 63]));
    // AUD2
    expect(steps(channelNotes(song, 2, 14))).toEqual(
      steps([68, 50, 55, 52, 55, 57, 57, 60, 59, 57, 55, 54, 52, 64]));

    // The mixed voices carry song 1's tracks, so they are not empty.
    for (let ch = 3; ch < 7; ch++) expect(channelNotes(song, ch, 4)).toHaveLength(4);
  });

  it('Mugician I (flight.dmu): four voices open with the notes Paula plays', async () => {
    const song = await load('public/data/songs/formats/flight.dmu');
    expect(song.numChannels).toBe(4);
    const paula = [
      [66, 56, 56, 66, 66, 56, 66, 56, 66, 66, 56, 66, 56, 66, 56, 56],
      [49, 47, 49, 47, 49, 52, 54, 49, 49, 47, 49, 47, 49, 52, 54, 49],
      [49, 51, 52, 51, 52, 56, 49, 52, 54, 52, 49, 47, 49, 52, 49, 49],
      [61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 59, 59, 59, 59, 59, 61],
    ];
    // flight's voice 1 opens with one note before the log starts.
    const grid = [
      channelNotes(song, 0, 16),
      channelNotes(song, 1, 17).slice(1),
      channelNotes(song, 2, 16),
      channelNotes(song, 3, 16),
    ];
    for (let ch = 0; ch < 4; ch++) expect(steps(grid[ch]), `channel ${ch}`).toEqual(steps(paula[ch]));
  });
});
