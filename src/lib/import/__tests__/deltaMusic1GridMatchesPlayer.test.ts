/**
 * Regression: the Delta Music 1.0 grid did not show the notes the replayer plays.
 *
 * Symptom (tools/uade-audit/gridVsPaula.ts on crusaders1.dm): bass lines below
 * C-1 read as a run of C-1s. The parser named a DM1 period through
 * ProTracker's three octaves only (periodToPtNote clamps to C-1..B-3), so
 * 904, 960 and 1076 all became C-1. Paula plays them two, three and five
 * semitones lower. DM1's table also skips 1016, so no fixed index offset
 * names it right. The pattern codec (decodeCell/encodeCell) and the exporter
 * each carried a third naming, index + 36.
 *
 * DeltaMusic1Notes.ts now holds the table and the one mapping both ways
 * (named by the period played, periodNotes 428 = C-2). Parser, codec and
 * exporter all use it.
 *
 * The expected sequences were read from UADE's Paula write log while the real
 * replayer played the file (gridVsPaula note-on rules). Synth voices restart
 * their waveform on every tick, so Paula repeats a held pitch; both sides
 * collapse consecutive repeats.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDeltaMusic1File } from '../formats/DeltaMusic1Parser';
import { dm1IndexToNote, noteToDM1Index } from '../formats/DeltaMusic1Notes';
import { encodeDeltaMusic1Cell } from '@/engine/uade/encoders/DeltaMusic1Encoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

async function load(rel: string): Promise<TrackerSong> {
  const raw = readFileSync(join(process.cwd(), rel));
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  return parseDeltaMusic1File(ab, rel.split('/').pop() ?? rel);
}

/** A channel's notes in song order, consecutive repeats collapsed. */
function channelPitches(song: TrackerSong, ch: number, count: number): number[] {
  const out: number[] = [];
  for (const p of song.songPositions) {
    for (const cell of song.patterns[p].channels[ch].rows) {
      if (cell.note > 0 && cell.note < 97 && cell.note !== out[out.length - 1]) out.push(cell.note);
      if (out.length === count) return out;
    }
  }
  return out;
}

describe('Delta Music 1.0 grid plays what the replayer plays', () => {
  it('names DM1 pitches by the period they play (856 = C-1 = 13; the table skips 1016)', () => {
    expect(dm1IndexToNote(36)).toBe(13); // 856
    expect(dm1IndexToNote(35)).toBe(12); // 904
    expect(dm1IndexToNote(34)).toBe(11); // 960 - the table skips 1016
    expect(dm1IndexToNote(33)).toBe(9);  // 1076
    expect(dm1IndexToNote(25)).toBe(1);  // 1712 = C-0
    expect(dm1IndexToNote(80)).toBe(48); // past 71 the table holds 113
    for (let i = 25; i <= 71; i++) expect(noteToDM1Index(dm1IndexToNote(i))).toBe(i);
  });

  it('crusaders1.dm: each voice opens with the notes Paula plays', async () => {
    const song = await load('public/data/songs/formats/crusaders1.dm');
    expect(channelPitches(song, 0, 16)).toEqual([45, 38, 43, 38, 41, 38, 40, 41, 45, 38, 43, 38, 41, 38, 40, 41]);
    expect(channelPitches(song, 1, 16)).toEqual([14, 26, 14, 38, 14, 12, 38, 17, 16, 14, 38, 14, 12, 38, 17, 16]);
    expect(channelPitches(song, 2, 16)).toEqual([21, 22, 34, 36, 33, 26, 29, 26, 34, 33, 29, 26, 22, 26, 29, 26]);
    expect(channelPitches(song, 3, 4)).toEqual([26, 34, 33, 34]);
  });

  it('triplex1.dm: voice 3 opens with the notes Paula plays', async () => {
    const song = await load('public/data/songs/delta-music/triplex1.dm');
    expect(channelPitches(song, 3, 8)).toEqual([41, 48, 41, 48, 41, 48, 41, 48]);
  });

  it('the pattern codec names a cell like the grid and writes every note byte back', async () => {
    const song = await load('public/data/songs/formats/crusaders1.dm');
    const layout = song.uadePatternLayout;
    if (!layout?.decodeCell) throw new Error('layout incomplete');
    // Note byte 35 (period 904) with instrument 2: grid name B-0 (12), byte kept exactly.
    const cell = layout.decodeCell(new Uint8Array([2, 35, 0, 0]));
    expect(cell.note).toBe(12);
    expect([...encodeDeltaMusic1Cell(cell)]).toEqual([2, 35, 0, 0]);
    // An edited cell (no carrier) writes the index that plays its note.
    expect(encodeDeltaMusic1Cell({ ...cell, period: undefined })[1]).toBe(35);
  });
});
