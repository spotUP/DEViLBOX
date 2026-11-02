/**
 * An edited note in a reused Hippel block did not reach the file when a linked copy played in the octave below C-0.
 *
 * Each step of a CoSo / 7V module carries its own note transpose, so one block's bytes show as different pitches in
 * the grid. A note edit moves every copy by the same interval (hippelLinkedEdits) and the patcher writes the block
 * only when all copies moved by that interval (patchEditedCells). The octave below C-0 is stored -12..-1, so stored
 * values skip 0. The linked edit treated a negative copy as empty and set it to the typed value, and the patcher
 * counted the interval in stored values: the copies disagreed, every cell was refused and the export did not change.
 */
import { describe, it, expect } from 'vitest';
import type { TrackerCell } from '@/types';
import { EMPTY_CELL } from '@/types/tracker';
import { noteValueToPitch } from '@/lib/tracker/noteValue';
import { hippelLinkedEdits } from '../hippelLinkedCells';
import { patchEditedCells, type HippelCellSpan, type HippelCellSpans } from '../hippelCellSpans';

const cell = (note: number): TrackerCell => ({ ...EMPTY_CELL, note, instrument: 1 });
const pattern = (note: number) => ({ channels: [{ rows: [cell(note)] }] });

/** One block byte at offset 0, shown by pattern 0 at `noteA` and by pattern 1 at `noteB` (another step transpose). */
function sharedBlock(noteA: number, noteB: number): HippelCellSpans {
  const pitch = (v: number) => noteValueToPitch(v) ?? 0;
  const span = (note: number): HippelCellSpan => ({
    offset: 0,
    length: 1,
    baseline: cell(note),
    // The byte is the pitch this copy plays minus its transpose; pattern 0 plays it untransposed.
    encode: (c) => Uint8Array.of((pitch(c.note ?? 0) - (pitch(note) - pitch(noteA))) & 0xff),
  });
  return [[[span(noteA)]], [[span(noteB)]]];
}

describe('Hippel linked copies: a note edit moves a low-octave copy by the same interval', () => {
  it('moves the copy at -3 (A#-1) up two semitones to -1 (C-0 minus one), not to the typed value', () => {
    const spans = sharedBlock(10, -3);
    const edits = hippelLinkedEdits(spans, 0, pattern(10), pattern(12), [pattern(12), pattern(-3)]);
    expect(edits).toEqual([{ pattern: 1, channel: 0, row: 0, values: expect.objectContaining({ note: -1 }) }]);
  });

  it('writes the block when a low-octave copy moved by the same interval across C-0', () => {
    // -1 is B-(-1); two semitones up is C#0, stored 2: three stored values apart, two semitones in pitch.
    const spans = sharedBlock(10, -1);
    const original = Uint8Array.of(10);
    const out = patchEditedCells(original, spans, [pattern(12), pattern(2)]);
    expect(out.refused).toEqual([]);
    expect(out.bytes[0]).toBe(12);
  });

  it('still refuses copies that moved by different intervals', () => {
    const spans = sharedBlock(10, -1);
    const out = patchEditedCells(Uint8Array.of(10), spans, [pattern(12), pattern(1)]);
    expect(out.refused).toEqual(['0:0:0', '1:0:0']);
    expect(out.bytes[0]).toBe(10);
  });
});
