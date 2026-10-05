/**
 * kh.* (Kris Hatlelid): the UADE hybrid route kept the parser's empty 64-row
 * placeholder, so the grid stayed blank/frozen while the song played.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseKrisHatlelidFile } from '../formats/KrisHatlelidParser';
import { nativeGridHasNotes } from '../uadeScanQuality';

const KH = resolve(import.meta.dirname, '../../../../public/data/songs/kris-hatlelid/fiendish freddys - songs.kh');

describe('hybrid native route grid', () => {
  it('the Kris Hatlelid parser grid is a stub, so the route must hand over to the UADE scan', () => {
    const b = readFileSync(KH);
    const song = parseKrisHatlelidFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, 'fiendish freddys - songs.kh');
    expect(song.patterns).toHaveLength(1);
    expect(nativeGridHasNotes(song)).toBe(false);
  });

  it('keeps a grid that has notes and rejects an empty one', () => {
    const cell = (note: number) => ({ note });
    expect(nativeGridHasNotes({ patterns: [{ channels: [{ rows: [cell(0), cell(49)] }] }] })).toBe(true);
    expect(nativeGridHasNotes({ patterns: [{ channels: [{ rows: [cell(0)] }] }] })).toBe(false);
  });
});
