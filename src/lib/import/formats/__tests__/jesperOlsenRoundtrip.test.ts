/**
 * Jesper Olsen (L/G offset-table songs): the module codec is byte-exact and
 * the grid is the driver's own row reads.
 *
 * Regression for the stub parser (one empty pattern, 0 notes - the app showed
 * UADE's scan grid). The driver model (JoPlayer) was checked against UADE's
 * Paula writes register for register over the whole song and against the
 * voice records in UADE's chip RAM tick for tick (2026-10-06, see
 * thoughts/shared/research/2026-10-06_jesper-olsen-format.md); that UADE test
 * is not yet in the suite (handoff 2026-10-06_jesper-olsen.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { decodeJoModule, encodeJoModule, runJoSong } from '../JesperOlsenModule';
import { parseJesperOlsenFile } from '../JesperOlsenParser';

const ROOT = join(process.cwd(), 'public/data/songs');
const SONGS: Array<[string, 'L' | 'G', number[]]> = [
  ['jesper-olsen/lollypop-subgame 01.jo', 'L', [449, 149, 150, 156]],
  ['formats/lollypop-subgame_01.jo', 'L', [449, 149, 150, 156]],
  ['jesper-olsen/georg glaxo/JO.GeorgGlaxo title', 'G', [195, 191, 226, 223]],
];

describe('Jesper Olsen L/G songs', () => {
  it.each(SONGS)('%s: decode -> encode is byte-exact', (rel, driver) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
    const m = decodeJoModule(bytes);
    expect(m.driver).toBe(driver);
    expect([...encodeJoModule(m)]).toEqual([...bytes]);
  });

  it.each(SONGS)('%s: every note row the driver reads is a grid note, on its channel', (rel, _d, notes) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
    const song = parseJesperOlsenFile(bytes.slice().buffer as ArrayBuffer, rel.split('/').pop()!);
    const grid = [0, 1, 2, 3].map((c) => song.patterns.reduce((n, p) => n + p.channels[c].rows.filter((r) => r.note > 0 && r.note < 97).length, 0));
    expect(grid).toEqual(notes);
    const p = runJoSong(bytes, 1);
    const reads = [0, 1, 2, 3].map((c) => p.reads.filter((r) => r.channel === c && r.a < 0x7e && r.tick <= p.ends[0]).length);
    expect(grid).toEqual(reads);
  });

  it('an edit is written in place: the note byte of the row the cell shows', () => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, 'jesper-olsen/lollypop-subgame 01.jo')));
    const song = parseJesperOlsenFile(bytes.slice().buffer as ArrayBuffer, 'lollypop-subgame 01.jo');
    const layout = song.uadePatternLayout!;
    const row = song.patterns[0].channels[0].rows.findIndex((c) => c.note > 0 && c.note < 97);
    const cell = song.patterns[0].channels[0].rows[row];
    const runs = layout.writeCell!(0, row, 0, { ...cell, note: cell.note + 2 });
    expect(runs).toHaveLength(1);
    expect(runs[0].offset).toBe(layout.getCellFileOffset!(0, row, 0));
    expect(runs[0].bytes[0]).toBe(bytes[runs[0].offset] + 2);
    expect(layout.writeCell!(0, row, 0, cell)).toEqual([]);
  });
});
