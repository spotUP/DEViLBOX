/** Digitrakker (.mdl) re-pack: unedited export is the loaded module; cell and order edits reparse to the edit; unwritten edits warn. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMDLFile } from '@/lib/import/formats/MDLParser';
import { exportMDL } from '../MDLExporter';

const FIXTURE = join(process.cwd(), 'public/data/songs/digi-trakker/rohadtjo.mdl');
const load = async () => {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { b, song: await parseMDLFile(ab, 'rohadtjo.mdl') };
};
const grid = (s: { patterns: Array<{ channels: Array<{ rows: Array<{ note?: number; instrument?: number; effTyp?: number; eff?: number }> }> }> }, p: number) =>
  s.patterns[p].channels.map((c) => c.rows.map((r) => [r.note, r.instrument, r.effTyp, r.eff]));
const reparse = async (d: Uint8Array) => parseMDLFile(d.slice().buffer, 'x.mdl');

describe('MDLExporter', () => {
  it('unedited export is the loaded module', async () => {
    const { b, song } = await load();
    expect(Buffer.from((await exportMDL(song)).data).equals(b)).toBe(true);
  });

  it('cell and order edits are re-packed and reparse to the edit; untouched patterns keep their cells', async () => {
    const { song } = await load();
    const before = grid(song, 0);
    const rows = song.patterns[1].length;
    for (let r = 0; r < rows; r++) song.patterns[1].channels[0].rows[r] = { ...song.patterns[1].channels[0].rows[r], note: 30 + (r % 12), instrument: 2, volume: 20, effTyp: 0x0F, eff: 6, effTyp2: 0, eff2: 0 };
    song.songPositions = [1, 0, 1];
    const out = await exportMDL(song);
    const re = await reparse(out.data);
    expect(re.songPositions).toEqual([1, 0, 1]);
    for (let r = 0; r < rows; r++) {
      const g = re.patterns[1].channels[0].rows[r];
      expect([g.note, g.instrument, g.volume, g.effTyp, g.eff]).toEqual([30 + (r % 12), 2, 20, 0x0F, 6]);
    }
    expect(grid(re, 0)).toEqual(before);
  });

  it('an effect MDL cannot hold is dropped with a warning; instrument edits warn', async () => {
    const { song } = await load();
    song.patterns[0].channels[0].rows[3] = { ...song.patterns[0].channels[0].rows[3], effTyp: 0x1F, eff: 5 };
    song.instruments[0] = { ...song.instruments[0], name: 'edited' };
    const w = (await exportMDL(song)).warnings.join('\n');
    expect(w).toContain('cannot be written');
    expect(w).toContain('instrument and sample edits');
  });
});
