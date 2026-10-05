/**
 * Fashion Tracker: the grid shows the notes the player writes to Paula, and
 * empty rows stay empty. Regression for the parser reading pattern data at
 * fixed offsets (0x0314) instead of where the module's own player points,
 * which drew carrier bytes as a note on almost every row (LCS vs Paula 0.45).
 * Expected values are the first Paula note-ons of the UADE render
 * (tools/uade-audit/gridVsPaula.ts, score 1.00 on all four channels).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFashionTrackerFile, locateFashionTrackerLayout } from '../formats/FashionTrackerParser';

const FILE = resolve(import.meta.dirname, '../../../../public/data/songs/fashion-tracker/ivory tover ii.ex');

function load(): Uint8Array {
  return new Uint8Array(readFileSync(FILE));
}

describe('Fashion Tracker grid matches the player', () => {
  const bytes = load();
  const song = parseFashionTrackerFile(bytes.buffer.slice(0) as ArrayBuffer, 'ivory tover ii.ex');
  const first = song.patterns[song.songPositions[0]];
  const notesOf = (ch: number): Array<[number, number]> =>
    first.channels[ch].rows.flatMap((r, i): Array<[number, number]> => (r.note ? [[i, r.note]] : []));

  it('locates the pattern data from the embedded player code, not a fixed offset', () => {
    const layout = locateFashionTrackerLayout(bytes);
    expect(layout).not.toBeNull();
    expect(song.uadePatternLayout?.patternDataFileOffset).toBe(layout!.patternDataOff);
  });

  it('opens with the notes the player plays on each channel', () => {
    expect(notesOf(0)).toEqual([[0, 45]]);
    expect(notesOf(1)).toEqual([[0, 38]]);
    expect(notesOf(2)).toEqual([[0, 41], [16, 40], [32, 41], [48, 43]]);
  });

  it('leaves empty rows empty (channel 3 is silent in the opening pattern)', () => {
    expect(notesOf(3)).toEqual([]);
    const total = song.patterns.reduce((n, p) => n + p.channels[0].rows.filter((r) => r.note).length, 0);
    expect(total).toBeLessThan(0.5 * song.patterns.length * 64);
  });

  it('rejects a module whose player code carries no layout opcodes', () => {
    const broken = bytes.slice();
    broken.fill(0, 26, 1000);
    expect(locateFashionTrackerLayout(broken)).toBeNull();
  });
});
