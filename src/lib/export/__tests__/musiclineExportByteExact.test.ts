/** MusicLine export writes the loaded .ml back byte for byte; a note edit changes only its PART bytes. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMusicLineFile } from '@/lib/import/formats/MusicLineParser';
import { exportMusicLineFile } from '../MusicLineExporter';

const FILES = ['public/data/songs/musicline-editor/harmonic disorder.ml', 'public/data/songs/musicline-editor/drax.ml'];

function diffOffsets(a: Uint8Array, b: Uint8Array): number[] {
  const d: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d.push(i);
  return d;
}

describe.each(FILES)('MusicLine export %s', (path) => {
  const raw = new Uint8Array(readFileSync(path));

  it('unedited export is byte-exact', () => {
    const out = exportMusicLineFile(parseMusicLineFile(raw.slice(0))!);
    expect(out.length).toBe(raw.length);
    expect(diffOffsets(out, raw)).toEqual([]);
  });

  it('one note edit changes only its own PART and reloads as the edit', () => {
    const song = parseMusicLineFile(raw.slice(0))!;
    const lay = song.uadeVariableLayout!;
    let p = 0, r = 0;
    outer: for (p = 0; p < song.patterns.length; p++) for (r = 0; r < song.patterns[p].channels[0].rows.length; r++) {
      if (song.patterns[p].channels[0].rows[r].note > 1) break outer;
    }
    if (p === song.patterns.length) throw new Error('no note cell');
    const cell = song.patterns[p].channels[0].rows[r];
    const edited = cell.note - 1;
    cell.note = edited;
    const out = exportMusicLineFile(song);
    const addr = lay.filePatternAddrs[p], size = lay.filePatternSizes[p];
    expect(out.length).toBe(raw.length);
    const diffs = diffOffsets(out, raw);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.every((i) => i >= addr && i < addr + size)).toBe(true);
    expect(parseMusicLineFile(out)!.patterns[p].channels[0].rows[r].note).toBe(edited);
  });
});
