/**
 * G29: on a CoSo New Song, notes typed into the first pattern played on every step, and every voice played the same pitch.
 *
 * The blank template (written by buildCoSoFile before it stopped sharing identical pattern streams) points all 30 steps and all 4
 * voices at ONE empty pattern block. The in-place patcher wrote each typed cell into that shared block, so every step
 * replayed pattern 0's notes and the voices overwrote each other (last write wins: one pitch). The patcher now refuses a
 * write whose block is shared by cells holding other values, and hippelCoSoModule lays the module out again from the grid.
 */
import { describe, it, expect } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchEditedCells } from '@/engine/hippel/hippelCellSpans';
import { mapHippelCells } from '@/engine/hippel/rebuildHippelModule';
import { hippelCoSoModule } from '../HippelCoSoExporter';
import { parseAs, readFixture } from './exporterHarness.shared';

const TEMPLATE = 'public/templates/hippelCoSo.hipc';
// C-3, E-3, G-3: inside the CoSo period table (the player plays every note above B-3 at period 113).
const NOTES = [37, 41, 44];

async function templateWithTypedNotes(): Promise<TrackerSong> {
  const song = await parseAs(TEMPLATE, readFixture(TEMPLATE));
  const p0 = song.patterns[song.songPositions[0]];
  NOTES.forEach((note, ch) => { p0.channels[ch].rows[0] = { ...p0.channels[ch].rows[0], note, instrument: 1 }; });
  return song;
}

describe('CoSo New Song: typed notes stay in their pattern and voice', () => {
  it('notes typed into pattern 0 leave later steps silent and each voice keeps its own pitch', async () => {
    const song = await templateWithTypedNotes();
    const module = hippelCoSoModule(song);
    expect(module).not.toBeNull();
    expect(module!.fromGrid).toBe(true);

    const back = await parseAs(TEMPLATE, module!.bytes);
    const first = back.patterns[back.songPositions[0]];
    expect(NOTES.map((_, ch) => first.channels[ch].rows[0].note)).toEqual(NOTES);
    for (let pos = 1; pos < back.songPositions.length; pos++) {
      const p = back.patterns[back.songPositions[pos]];
      const notes = p.channels.flatMap((c) => c.rows.map((r) => r.note)).filter((n) => n > 0 && n < 97);
      expect(notes, `step ${pos}`).toEqual([]);
    }
  });

  it('the patcher refuses a note edit into a block other cells share and leaves those bytes alone', async () => {
    const fixture = 'public/data/songs/formats/prehistoric_tale.hipc';
    const song = await parseAs(fixture, readFixture(fixture));
    const spans = mapHippelCells(song.hippelFileData!, song.instruments.length, 0)!;
    // A note cell whose bytes the module also plays as another cell (a pattern reused by a later step or another voice).
    const seen = new Map<number, number>();
    let target: { p: number; ch: number; r: number; offset: number; length: number } | null = null;
    for (const [p, pat] of song.patterns.entries()) for (const [ch, c] of pat.channels.entries()) for (const [r, cell] of c.rows.entries()) {
      const span = spans[p]?.[ch]?.[r];
      if (!span || !(cell.note > 13 && cell.note < 48)) continue;
      seen.set(span.offset, (seen.get(span.offset) ?? 0) + 1);
      if (!target && seen.get(span.offset) === 2) target = { p, ch, r, offset: span.offset, length: span.length };
    }
    expect(target, 'fixture has a shared note block').not.toBeNull();
    const { p, ch, r, offset, length } = target!;
    const row = song.patterns[p].channels[ch].rows;
    row[r] = { ...row[r], note: row[r].note + 1 };
    const original = new Uint8Array(song.hippelFileData!.slice(0));
    const { bytes, refused } = patchEditedCells(original, spans, song.patterns);
    expect(refused).toContain(`${p}:${ch}:${r}`);
    expect(Array.from(bytes.subarray(offset, offset + length))).toEqual(Array.from(original.subarray(offset, offset + length)));
  });

  it('a note edit every cell sharing its block agrees on still patches the loaded module in place', async () => {
    const fixture = 'public/data/songs/formats/prehistoric_tale.hipc';
    const song = await parseAs(fixture, readFixture(fixture));
    const spans = mapHippelCells(song.hippelFileData!, song.instruments.length, 0)!;
    // The first note cell, then the same new note in every cell the module plays from those bytes.
    let target = -1;
    for (const [p, pat] of song.patterns.entries()) for (const [ch, c] of pat.channels.entries()) for (const [r, cell] of c.rows.entries()) {
      if (target < 0 && cell.note > 13 && cell.note < 48 && spans[p]?.[ch]?.[r]) target = spans[p][ch][r].offset;
    }
    expect(target).toBeGreaterThan(0);
    let edited = 0;
    for (const [p, pat] of song.patterns.entries()) for (const [ch, c] of pat.channels.entries()) for (const [r, cell] of c.rows.entries()) {
      if (spans[p]?.[ch]?.[r]?.offset === target) { c.rows[r] = { ...cell, note: cell.note + 1 }; edited++; }
    }
    expect(edited).toBeGreaterThan(0);
    const module = hippelCoSoModule(song);
    expect(module?.fromGrid).toBe(false);
  });
});
