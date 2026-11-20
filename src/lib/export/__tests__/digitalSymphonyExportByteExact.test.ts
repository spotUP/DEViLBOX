/** Digital Symphony export writes the loaded .dsym back byte for byte; a note edit changes only its own track chunk. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDigitalSymphonyFile } from '@/lib/import/formats/DigitalSymphonyParser';
import { exportDigitalSymphony } from '../DigitalSymphonyExporter';

const FILES = ['public/data/songs/formats/drwho_final4.dsym'];

function diffOffsets(a: Uint8Array, b: Uint8Array): number[] {
  const d: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d.push(i);
  return d;
}

describe.each(FILES)('Digital Symphony export %s', (path) => {
  const raw = new Uint8Array(readFileSync(path));

  it('unedited export is byte-exact', () => {
    const out = new Uint8Array(exportDigitalSymphony(parseDigitalSymphonyFile(raw.slice(0), 'x')!));
    expect(out.length).toBe(raw.length);
    expect(diffOffsets(out, raw)).toEqual([]);
  });

  it('one note edit reloads as the edit and leaves every other cell alone', () => {
    const song = parseDigitalSymphonyFile(raw.slice(0), 'x')!;
    const before = parseDigitalSymphonyFile(raw.slice(0), 'x')!;
    let p = 0, ch = 0, r = 0;
    outer: for (p = 0; p < song.patterns.length; p++) for (ch = 0; ch < song.numChannels; ch++) for (r = 0; r < 64; r++) {
      if (song.patterns[p].channels[ch].rows[r].note > 50) break outer;
    }
    if (p === song.patterns.length) throw new Error('no note cell');
    const edited = song.patterns[p].channels[ch].rows[r].note - 1;
    song.patterns[p].channels[ch].rows[r].note = edited;
    const out = new Uint8Array(exportDigitalSymphony(song));
    // sample data after the track chunks is copied verbatim
    expect(out.subarray(out.length - 20000)).toEqual(raw.subarray(raw.length - 20000));
    const re = parseDigitalSymphonyFile(out, 'x')!;
    expect(re.patterns[p].channels[ch].rows[r].note).toBe(edited);
    before.patterns[p].channels[ch].rows[r].note = edited;
    // shared tracks may carry the edit to other positions; compare against the same-track expectation
    const tm = song.uadeVariableLayout!.trackMap!;
    for (let q = 0; q < re.patterns.length; q++) for (let c = 0; c < re.numChannels; c++) {
      const same = tm[q][c] === tm[p][ch];
      for (let k = 0; k < 64; k++) {
        const want = same && k === r ? edited : before.patterns[q].channels[c].rows[k].note;
        const wantNote = (q === p && c === ch && k === r) || same && k === r ? edited : want;
        expect(re.patterns[q].channels[c].rows[k].note).toBe(wantNote);
      }
    }
  });
});
