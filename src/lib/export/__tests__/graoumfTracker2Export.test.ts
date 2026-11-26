/** Graoumf Tracker 2 (.gt2) re-pack: unedited export is the loaded module; cell and order edits reparse to the edit; unwritten edits warn. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGraoumfTracker2File } from '@/lib/import/formats/GraoumfTracker2Parser';
import { exportGraoumfTracker2 } from '../GraoumfTracker2Exporter';

const FIXTURE = join(process.cwd(), 'public/data/songs/graoumf-tracker-2/gimmekuh.gt2');
const load = () => {
  const b = readFileSync(FIXTURE);
  return { b, song: parseGraoumfTracker2File(new Uint8Array(b), 'gimmekuh.gt2')! };
};
const reparse = (d: Uint8Array) => parseGraoumfTracker2File(d.slice(), 'x.gt2')!;

describe('GraoumfTracker2Exporter', () => {
  it('unedited export is the loaded module', async () => {
    const { b, song } = load();
    const out = await exportGraoumfTracker2(song);
    expect(Buffer.from(out.data).equals(b)).toBe(true);
    expect(out.warnings).toEqual([]);
  });

  it('cell and order edits are re-packed and reparse to the edit', async () => {
    const { song } = load();
    const rows = song.patterns[1].length;
    for (let r = 0; r < rows; r++) song.patterns[1].channels[0].rows[r] = { ...song.patterns[1].channels[0].rows[r], note: 30 + (r % 12), instrument: 2, volume: 20, effTyp: 0x0F, eff: 6, effTyp2: 0, eff2: 0 };
    const o = song.songPositions.slice(0, 3);
    song.songPositions = [o[1], o[0], o[1]];
    const re = reparse((await exportGraoumfTracker2(song)).data);
    expect(re.songPositions.length).toBe(3);
    for (let r = 0; r < rows; r++) {
      const g = re.patterns[0].channels[0].rows[r];
      expect([g.note, g.instrument, g.volume, g.effTyp, g.eff]).toEqual([30 + (r % 12), 2, 20, 0x0F, 6]);
    }
  });

  it('an effect GT2 cannot hold is dropped with a warning; instrument edits warn', async () => {
    const { song } = load();
    song.patterns[0].channels[0].rows[3] = { ...song.patterns[0].channels[0].rows[3], effTyp: 0x1F, eff: 5 };
    song.instruments[0] = { ...song.instruments[0], name: 'edited' };
    const w = (await exportGraoumfTracker2(song)).warnings.join('\n');
    expect(w).toContain('cannot be written');
    expect(w).toContain('instrument and sample edits');
  });
});
