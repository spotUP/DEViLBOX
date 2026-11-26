/** PolyTracker (.ptm) re-pack: unedited export is the loaded module; an edit that grows a pattern is re-packed and reparses to the edited value. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePTMFile } from '@/lib/import/formats/PTMParser';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { exportPTM } from '../PTMExporter';

const FIXTURE = join(process.cwd(), 'public/data/songs/protracker-iff/rew_vibr.ptm');
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const load = async () => {
  const b = readFileSync(FIXTURE);
  const song = await parsePTMFile(ab(b), 'rew_vibr.ptm');
  song.uadeEditableFileData = ab(b);
  song.uadeEditableFileName = 'rew_vibr.ptm';
  setGridBaseline(baselineOf(song.patterns));
  return { b, song };
};

describe('PTMExporter', () => {
  it('unedited export is the loaded module', async () => {
    const { b, song } = await load();
    expect(Buffer.from((await exportPTM(song)).data).equals(b)).toBe(true);
  });

  it('a pattern full of new cells is re-packed (file grows) and reparses to the edit and to the untouched cells', async () => {
    const { b, song } = await load();
    const before = song.patterns.map((p) => p.channels.map((c) => c.rows.map((r) => ({ ...r }))));
    const ch = song.patterns[0].channels;
    for (let r = 0; r < 64; r++) ch[r % ch.length].rows[r] = { ...ch[r % ch.length].rows[r], note: 30 + (r % 12), instrument: 2, volume: 40, effTyp: 0x0F, eff: 0x06 };
    const out = await exportPTM(song);
    expect(out.data.length).not.toBe(b.length);
    const re = await parsePTMFile(ab(out.data), 'x.ptm');
    expect(re.patterns.length).toBe(song.patterns.length);
    for (let r = 0; r < 64; r++) {
      const g = re.patterns[0].channels[r % ch.length].rows[r];
      expect([g.note, g.instrument, g.volume, g.effTyp, g.eff]).toEqual([30 + (r % 12), 2, 40, 0x0F, 0x06]);
    }
    for (let p = 1; p < before.length; p++) expect(re.patterns[p].channels.map((c) => c.rows.map((x) => [x.note, x.instrument, x.volume]))).toEqual(before[p].map((c) => c.map((x) => [x.note, x.instrument, x.volume])));
    expect(re.instruments.length).toBe(song.instruments.length);
  });
});
