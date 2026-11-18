/** Farandole Composer (.far) native export: byte-exact when unedited, a cell edit reaches the file and reparses to the edited value. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFARFile } from '@/lib/import/formats/FARParser';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { exportFAR } from '../FARExporter';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/m31.far');
const load = async () => {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const song = await parseFARFile(ab, 'm31.far');
  setGridBaseline(baselineOf(song.patterns));
  return { b, song };
};

describe('FARExporter', () => {
  it('unedited export is byte-exact', async () => {
    const { b, song } = await load();
    const r = await exportFAR(song);
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
    song.patterns[p].channels[c].rows[r] = { ...cell, note: 49, instrument: 3, effTyp: 0x0F, eff: 0x06 };
    const out = await exportFAR(song);
    const re = await parseFARFile(out.data.buffer.slice(out.data.byteOffset, out.data.byteOffset + out.data.byteLength) as ArrayBuffer, 'x.far');
    const got = re.patterns[p].channels[c].rows[r];
    expect([got.note, got.instrument, got.effTyp, got.eff]).toEqual([49, 3, 0x0F, 0x06]);
  });
});
