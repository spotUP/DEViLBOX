/**
 * kh.* (Kris Hatlelid): the UADE hybrid route kept the parser's empty 64-row
 * placeholder, so the grid stayed blank/frozen while the song played.
 * Since 60c3326e7 the parser decodes the real event grid (KrisHatlelidGrid), so
 * the route keeps it; a parser that falls back to a blank grid fails here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseKrisHatlelidFile } from '../formats/KrisHatlelidParser';
import { nativeGridHasNotes } from '../uadeScanQuality';

const KH = resolve(import.meta.dirname, '../../../../public/data/songs/kris-hatlelid/fiendish freddys - songs.kh');

describe('hybrid native route grid', () => {
  it('the Kris Hatlelid parser grid carries the song notes, so the route keeps it instead of a blank grid', () => {
    const b = readFileSync(KH);
    const song = parseKrisHatlelidFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, 'fiendish freddys - songs.kh');
    expect(nativeGridHasNotes(song)).toBe(true);
  });

  it('keeps a grid that has notes and rejects an empty one', () => {
    const cell = (note: number) => ({ note });
    expect(nativeGridHasNotes({ patterns: [{ channels: [{ rows: [cell(0), cell(49)] }] }] })).toBe(true);
    expect(nativeGridHasNotes({ patterns: [{ channels: [{ rows: [cell(0)] }] }] })).toBe(false);
  });
});
