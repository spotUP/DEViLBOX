/** MultiTracker (.mtm) native export: byte-exact when unedited, a cell edit reaches the file and reparses to the edited value. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMTMFile } from '@/lib/import/formats/MTMParser';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { exportMTM } from '../MTMExporter';

const FIXTURE = join(process.cwd(), 'public/data/songs/multi-tracker/anonymous in 4ce.mtm');
const load = async () => {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const song = await parseMTMFile(ab, 'anonymous in 4ce.mtm');
  setGridBaseline(baselineOf(song.patterns));
  return { b, song };
};

describe('MTMExporter', () => {
  it('unedited export is byte-exact', async () => {
    const { b, song } = await load();
    const r = await exportMTM(song);
    expect(Buffer.from(r.data).equals(b)).toBe(true);
  });

  it('a note edit reaches the exported bytes and reparses', async () => {
    const { song } = await load();
    const layout = song.uadePatternLayout!;
    let found: [number, number, number] | undefined;
    for (let p = 0; p < song.patterns.length && !found; p++)
      for (let c = 0; c < song.patterns[p].channels.length && !found; c++)
        for (let r = 0; r < 64; r++) if (getCellFileOffset(layout, p, r, c) >= 0 && song.patterns[p].channels[c].rows[r].note === 0) { found = [p, r, c]; break; }
    const [p, r, c] = found!;
    const cell = song.patterns[p].channels[c].rows[r];
    song.patterns[p].channels[c].rows[r] = { ...cell, note: 49, instrument: 3, effTyp: 0x0C, eff: 0x20 };
    const out = await exportMTM(song);
    const re = await parseMTMFile(out.data.buffer.slice(out.data.byteOffset, out.data.byteOffset + out.data.byteLength) as ArrayBuffer, 'x.mtm');
    const got = re.patterns[p].channels[c].rows[r];
    expect([got.note, got.instrument, got.effTyp, got.eff]).toEqual([49, 3, 0x0C, 0x20]);
  });
});
