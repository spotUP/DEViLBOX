/** Velvet Studio (.ams) re-pack: unedited export is the loaded module; pattern and order edits reparse to the edited values; unrepresentable effects warn. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAMSFile } from '@/lib/import/formats/AMSParser';
import { exportAMS } from '../AMSExporter';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/kernel.ams');
const load = () => {
  const b = readFileSync(FIXTURE);
  const song = parseAMSFile(new Uint8Array(b), 'kernel.ams')!;
  return { b, song };
};
const grid = (s: { patterns: Array<{ channels: Array<{ rows: Array<{ note?: number; instrument?: number; effTyp?: number; eff?: number }> }> }> }, p: number) =>
  s.patterns[p].channels.map((c) => c.rows.map((r) => [r.note, r.instrument, r.effTyp, r.eff]));

describe('AMSExporter', () => {
  it('unedited export is the loaded module', async () => {
    const { b, song } = load();
    expect(Buffer.from((await exportAMS(song)).data).equals(b)).toBe(true);
  });

  it('pattern and order edits are re-packed and reparse to the edit; untouched patterns keep their cells', async () => {
    const { song } = load();
    const before = grid(song, 0);
    const n = song.patterns.length;
    const rows = song.patterns[1].channels[0].rows.length;
    for (let r = 0; r < rows; r++) song.patterns[1].channels[r % 4].rows[r] = { ...song.patterns[1].channels[r % 4].rows[r], note: 30 + (r % 12), instrument: 2, effTyp: 0x0C, eff: 32, effTyp2: 0, eff2: 0 };
    song.songPositions = [1, 0, 1];
    const out = await exportAMS(song);
    const re = parseAMSFile(out.data, 'x.ams')!;
    expect(re.songPositions).toEqual([1, 0, 1]);
    expect(re.patterns.length).toBe(n);
    for (let r = 0; r < rows; r++) {
      const g = re.patterns[1].channels[r % 4].rows[r];
      expect([g.note, g.instrument, g.effTyp, g.eff]).toEqual([30 + (r % 12), 2, 0x0C, 32]);
    }
    expect(grid(re, 0)).toEqual(before);
  });

  it('song name and instrument edits warn instead of vanishing', async () => {
    const { song } = load();
    song.name = 'renamed';
    song.instruments[0] = { ...song.instruments[0], name: 'edited' };
    const w = (await exportAMS(song)).warnings.join('\n');
    expect(w).toContain('song name edits');
    expect(w).toContain('instrument and sample edits');
  });

  it('an effect AMS cannot hold is dropped with a warning', async () => {
    const { song } = load();
    song.patterns[0].channels[0].rows[3] = { ...song.patterns[0].channels[0].rows[3], effTyp: 0x1F, eff: 5 };
    expect((await exportAMS(song)).warnings.join('\n')).toContain('cannot be written');
  });
});
